import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, FileText, Loader2, Send, Save, AlertCircle } from 'lucide-react';
import { DocumentViewerModal } from '../../components/ui/DocumentViewerModal';
import { FileUploadField } from '../../components/ui/FileUploadField';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logActivity, sendNotification, supabase, uploadPrivateDocument } from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';
import type {
  Profile,
  Program,
  SubmissionRequirement,
  ThesisDocument,
  ThesisSubmission,
} from '../../types/database';

export function TitleSubmissionPage() {
  const { profile, activePeriod, systemSettings } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submission, setSubmission] = useState<ThesisSubmission | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [requirements, setRequirements] = useState<SubmissionRequirement[]>([]);
  const [lecturers, setLecturers] = useState<Profile[]>([]);
  const [proposalDoc, setProposalDoc] = useState<ThesisDocument | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [researchField, setResearchField] = useState('');
  const [abstractText, setAbstractText] = useState('');
  const [background, setBackground] = useState('');
  const [problemStatement, setProblemStatement] = useState('');
  const [objectives, setObjectives] = useState('');
  const [methodology, setMethodology] = useState('');
  const [proposedSup1, setProposedSup1] = useState('');
  const [proposedSup2, setProposedSup2] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);

    const [{ data: subData }, { data: progData }, { data: reqData }, { data: lecData }] =
      await Promise.all([
        supabase
          .from('thesis_submissions')
          .select('*')
          .eq('student_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        profile.program_id
          ? supabase.from('programs').select('*').eq('id', profile.program_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from('submission_requirements')
          .select('*')
          .eq('stage', 'title_submission')
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('profiles')
          .select('*')
          .in('role_code', ['supervisor', 'examiner'])
          .eq('is_active', true)
          .order('full_name'),
      ]);

    const currentProg = (progData as Program) || null;
    setProgram(currentProg);
    const filteredReqs = ((reqData || []) as SubmissionRequirement[]).filter(
      (r) => !r.program_id || r.program_id === profile.program_id
    );
    setRequirements(filteredReqs);
    setLecturers((lecData || []) as Profile[]);

    if (subData) {
      const s = subData as ThesisSubmission;
      setSubmission(s);
      setTitle(s.title || '');
      setResearchField(s.research_field || '');
      setAbstractText(s.abstract || '');
      setBackground(s.background || '');
      setProblemStatement(s.problem_statement || '');
      setObjectives(s.research_objectives || '');
      setMethodology(s.research_methodology || '');
      setProposedSup1(s.proposed_supervisor_1 || '');
      setProposedSup2(s.proposed_supervisor_2 || '');

      if (s.proposal_document_id) {
        const { data: doc } = await supabase
          .from('thesis_documents')
          .select('*')
          .eq('id', s.proposal_document_id)
          .maybeSingle();
        if (doc) setProposalDoc(doc as ThesisDocument);
      }
    }

    setLoading(false);
  }, [profile?.id, profile?.program_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const checkRequirementMet = (req: SubmissionRequirement): boolean => {
    if (!profile) return false;
    const minSks = program?.min_sks ?? systemSettings?.default_min_sks ?? 110;
    const minGpa = program?.min_gpa ?? systemSettings?.default_min_gpa ?? 2.75;

    switch (req.rule_key) {
      case 'active_status':
        return profile.academic_status === 'active';
      case 'min_sks':
        return (profile.completed_sks || 0) >= Number(req.rule_value || minSks);
      case 'min_gpa':
        return (profile.gpa || 0) >= Number(req.rule_value || minGpa);
      default:
        return profile.academic_status === 'active';
    }
  };

  const canEdit =
    !submission || ['draft', 'submitted', 'revision_required'].includes(submission.status);

  const handleSave = async (targetStatus: 'draft' | 'submitted') => {
    if (!profile) return;
    if (!title.trim() || !researchField.trim() || !background.trim() || !problemStatement.trim() || !objectives.trim() || !methodology.trim()) {
      showToast('Formulir belum lengkap', 'warning', 'Mohon lengkapi judul, bidang penelitian, latar belakang, rumusan masalah, tujuan, dan metode.');
      return;
    }

    if (targetStatus === 'submitted') {
      const unmet = requirements.filter((r) => r.is_required && !checkRequirementMet(r));
      if (unmet.length > 0) {
        showToast(
          'Persyaratan akademik belum terpenuhi',
          'error',
          `Belum memenuhi: ${unmet.map((u) => u.title).join(', ')}. Hubungi Admin Prodi jika data SKS/IPK perlu diperbarui.`
        );
        return;
      }
    }

    setSaving(true);
    let proposalDocId = submission?.proposal_document_id || null;

    if (selectedFile) {
      const uploadRes = await uploadPrivateDocument({
        file: selectedFile,
        userId: profile.id,
        studentId: profile.id,
        category: 'proposal',
        title: `Proposal Awal — ${title.trim()}`,
        thesisId: submission?.id || null,
        maxUploadMb: systemSettings?.max_upload_mb || 25,
        allowedFormats: systemSettings?.allowed_file_formats || ['pdf', 'docx'],
      });

      if (uploadRes.error || !uploadRes.data) {
        setSaving(false);
        showToast('Gagal mengunggah proposal', 'error', uploadRes.error || 'Terjadi kesalahan upload.');
        return;
      }
      proposalDocId = uploadRes.data.id;
      setProposalDoc(uploadRes.data);
      setSelectedFile(null);
    }

    const payload = {
      student_id: profile.id,
      program_id: profile.program_id,
      period_id: activePeriod?.id || null,
      title: title.trim(),
      abstract: abstractText.trim() || null,
      background: background.trim(),
      problem_statement: problemStatement.trim(),
      research_objectives: objectives.trim(),
      research_methodology: methodology.trim(),
      research_field: researchField.trim(),
      proposed_supervisor_1: proposedSup1 || null,
      proposed_supervisor_2: proposedSup2 || null,
      proposal_document_id: proposalDocId,
      status: targetStatus,
      submitted_at: targetStatus === 'submitted' ? new Date().toISOString() : submission?.submitted_at || null,
    };

    let savedId = submission?.id;
    let errorMsg: string | null = null;

    if (submission) {
      const { error } = await supabase
        .from('thesis_submissions')
        .update(payload)
        .eq('id', submission.id);
      if (error) errorMsg = error.message;
    } else {
      const { data: inserted, error } = await supabase
        .from('thesis_submissions')
        .insert(payload)
        .select('*')
        .single();
      if (error) errorMsg = error.message;
      else if (inserted) {
        savedId = inserted.id;
        if (proposalDocId) {
          await supabase
            .from('thesis_documents')
            .update({ thesis_id: inserted.id })
            .eq('id', proposalDocId);
        }
      }
    }

    setSaving(false);
    if (errorMsg) {
      showToast('Gagal menyimpan pengajuan', 'error', errorMsg);
      return;
    }

    await logActivity(
      targetStatus === 'submitted' ? 'submit_thesis_title' : 'save_thesis_draft',
      'thesis_submissions',
      savedId || null,
      { title: title.trim() }
    );

    if (targetStatus === 'submitted' && proposedSup1) {
      await sendNotification({
        userId: proposedSup1,
        title: 'Pengajuan Judul TA Baru',
        message: `${profile.full_name} mengajukan judul "${title.trim()}" dan memilih Anda sebagai calon pembimbing.`,
        category: 'submission',
        entityType: 'thesis_submissions',
        entityId: savedId,
      });
    }

    showToast(
      targetStatus === 'submitted' ? 'Pengajuan judul berhasil dikirim' : 'Draft judul tersimpan',
      'success'
    );
    await loadData();
  };

  if (loading) return <TableSkeleton rows={6} columns={3} />;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Pengajuan Judul Tugas Akhir</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Lengkapi detail rencana penelitian dan unggah proposal awal sesuai ketentuan program studi.
          </p>
        </div>
        {submission && (
          <div className="flex items-center gap-3">
            <StatusBadge status={submission.status} />
            {submission.submitted_at && (
              <span className="text-xs font-mono text-slate-400">
                Dikirim {formatDateTime(submission.submitted_at)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Reviewer Notes Alert */}
      {submission?.reviewer_notes && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-amber-900 dark:text-amber-200">Catatan Reviewer / Prodi</p>
            <p className="text-amber-800 dark:text-amber-300 leading-relaxed">{submission.reviewer_notes}</p>
          </div>
        </div>
      )}

      {/* Dynamic Academic Requirements Checklist */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Persyaratan Akademik Program Studi</h2>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            SKS Anda: {profile?.completed_sks ?? 0} · IPK: {(profile?.gpa ?? 0).toFixed(2)}
          </span>
        </div>
        {requirements.length === 0 ? (
          <p className="text-xs text-slate-500">Tidak ada persyaratan khusus yang dikonfigurasi prodi.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {requirements.map((req) => {
              const met = checkRequirementMet(req);
              return (
                <div
                  key={req.id}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start gap-2.5"
                >
                  {met ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="text-xs">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{req.title}</p>
                    {req.description && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {req.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Submission Form */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Judul Tugas Akhir *
            </label>
            <input
              type="text"
              disabled={!canEdit}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tuliskan judul tugas akhir secara spesifik dan jelas"
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Bidang Penelitian *
            </label>
            <input
              type="text"
              disabled={!canEdit}
              value={researchField}
              onChange={(e) => setResearchField(e.target.value)}
              placeholder="Contoh: Machine Learning, Sistem Informasi, Keuangan"
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Periode Akademik
            </label>
            <input
              type="text"
              disabled
              value={activePeriod?.name || 'Periode Aktif'}
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/50 text-slate-500"
            />
          </div>

          {(program?.allow_proposed_supervisor ?? true) && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Usulan Calon Pembimbing 1
                </label>
                <select
                  disabled={!canEdit}
                  value={proposedSup1}
                  onChange={(e) => setProposedSup1(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
                >
                  <option value="">-- Pilih Dosen --</option>
                  {lecturers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.full_name} {l.research_field ? `(${l.research_field})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Usulan Calon Pembimbing 2
                </label>
                <select
                  disabled={!canEdit}
                  value={proposedSup2}
                  onChange={(e) => setProposedSup2(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
                >
                  <option value="">-- Opsional --</option>
                  {lecturers
                    .filter((l) => l.id !== proposedSup1)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.full_name}
                      </option>
                    ))}
                </select>
              </div>
            </>
          )}

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Latar Belakang Masalah *
            </label>
            <textarea
              rows={3}
              disabled={!canEdit}
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              placeholder="Jelaskan urgensi dan konteks permasalahan penelitian..."
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Rumusan Masalah *
            </label>
            <textarea
              rows={2}
              disabled={!canEdit}
              value={problemStatement}
              onChange={(e) => setProblemStatement(e.target.value)}
              placeholder="Pertanyaan penelitian yang akan dijawab..."
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Tujuan Penelitian *
            </label>
            <textarea
              rows={3}
              disabled={!canEdit}
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              placeholder="Target luaran dan tujuan penelitian..."
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Metode Penelitian *
            </label>
            <textarea
              rows={3}
              disabled={!canEdit}
              value={methodology}
              onChange={(e) => setMethodology(e.target.value)}
              placeholder="Metode pengumpulan data, analisis, dan pengembangan..."
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Ringkasan / Abstrak Awal
            </label>
            <textarea
              rows={2}
              disabled={!canEdit}
              value={abstractText}
              onChange={(e) => setAbstractText(e.target.value)}
              placeholder="Ringkasan singkat rencana skripsi (opsional)"
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
            />
          </div>

          <div className="sm:col-span-2 space-y-2">
            {canEdit && (
              <FileUploadField
                label="Unggah Proposal Awal (PDF / DOCX)"
                accept=".pdf,.docx"
                maxMb={systemSettings?.max_upload_mb || 25}
                selectedFile={selectedFile}
                onSelectFile={setSelectedFile}
              />
            )}
            {proposalDoc && (
              <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="font-medium truncate">{proposalDoc.file_name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Lihat Dokumen
                </button>
              </div>
            )}
          </div>
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave('draft')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              Simpan Draft
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave('submitted')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white transition-colors"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Kirim Pengajuan Judul
            </button>
          </div>
        )}
      </div>

      {proposalDoc && (
        <DocumentViewerModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={proposalDoc.title}
          bucketName={proposalDoc.bucket_name}
          filePath={proposalDoc.file_path}
          mimeType={proposalDoc.mime_type}
        />
      )}
    </div>
  );
}
