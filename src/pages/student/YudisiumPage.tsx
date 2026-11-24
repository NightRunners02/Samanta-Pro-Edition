import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Send,
} from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';
import { FileUploadField } from '../../components/ui/FileUploadField';
import {
  PostDefenseStepper,
  isDefenseCompleted,
} from '../../components/ui/PostDefenseStepper';
import {
  RealtimeDocumentPreviewPanel,
  SavedDocumentCard,
} from '../../components/ui/RealtimeDocumentPreviewPanel';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logActivity, supabase, uploadPrivateDocument } from '../../lib/supabase';
import { formatDate, getLetterGrade } from '../../lib/utils';
import type {
  DefenseRegistration,
  ExamSchedule,
  ExamScore,
  GraduationRecord,
  PlagiarismCheck,
  ThesisDocument,
  ThesisSubmission,
} from '../../types/database';

interface YudisiumPageProps {
  onNavigate?: (pageId: string) => void;
}

export function YudisiumPage({ onNavigate }: YudisiumPageProps) {
  const { profile, activePeriod, systemSettings } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [thesis, setThesis] = useState<ThesisSubmission | null>(null);
  const [defenseSchedule, setDefenseSchedule] = useState<ExamSchedule | null>(null);
  const [defenseRegistration, setDefenseRegistration] = useState<DefenseRegistration | null>(null);
  const [scores, setScores] = useState<ExamScore[]>([]);
  const [plagiarism, setPlagiarism] = useState<PlagiarismCheck | null>(null);
  const [fullThesisDoc, setFullThesisDoc] = useState<ThesisDocument | null>(null);
  const [savedYudisiumDoc, setSavedYudisiumDoc] = useState<ThesisDocument | null>(null);
  const [record, setRecord] = useState<GraduationRecord | null>(null);
  const [yudisiumDoc, setYudisiumDoc] = useState<File | null>(null);

  const loadData = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!profile?.id) return;
      if (!opts?.silent) setLoading(true);
      const { data: tData } = await supabase
        .from('thesis_submissions')
        .select('*')
        .eq('student_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const currentThesis = (tData as ThesisSubmission) || null;
      setThesis(currentThesis);

      if (currentThesis) {
        const [
          { data: sData },
          { data: defRegData },
          { data: scData },
          { data: plData },
          { data: docData },
          { data: gradDocData },
          { data: gradData },
        ] = await Promise.all([
          supabase
            .from('exam_schedules')
            .select('*')
            .eq('thesis_id', currentThesis.id)
            .eq('exam_type', 'defense')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('defense_registrations')
            .select('*')
            .eq('thesis_id', currentThesis.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from('exam_scores').select('*').eq('thesis_id', currentThesis.id),
          supabase
            .from('plagiarism_checks')
            .select('*')
            .eq('thesis_id', currentThesis.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('thesis_documents')
            .select('*')
            .eq('thesis_id', currentThesis.id)
            .eq('category', 'full_thesis')
            .eq('is_latest', true)
            .limit(1)
            .maybeSingle(),
          supabase
            .from('thesis_documents')
            .select('*')
            .eq('thesis_id', currentThesis.id)
            .eq('category', 'graduation_document')
            .eq('is_latest', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('graduation_records')
            .select('*')
            .eq('thesis_id', currentThesis.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        setDefenseSchedule((sData as ExamSchedule) || null);
        setDefenseRegistration((defRegData as DefenseRegistration) || null);
        setScores((scData || []) as ExamScore[]);
        setPlagiarism((plData as PlagiarismCheck) || null);
        setFullThesisDoc((docData as ThesisDocument) || null);
        setSavedYudisiumDoc((gradDocData as ThesisDocument) || null);
        setRecord((gradData as GraduationRecord) || null);
      } else {
        setDefenseSchedule(null);
        setDefenseRegistration(null);
        setScores([]);
        setPlagiarism(null);
        setFullThesisDoc(null);
        setSavedYudisiumDoc(null);
        setRecord(null);
      }
      if (!opts?.silent) setLoading(false);
    },
    [profile?.id]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime sync across post-defense stages & yudisium
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`student_yudisium_realtime_${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'graduation_records', filter: `student_id=eq.${profile.id}` },
        () => loadData({ silent: true })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plagiarism_checks', filter: `student_id=eq.${profile.id}` },
        () => loadData({ silent: true })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exam_schedules', filter: `student_id=eq.${profile.id}` },
        () => loadData({ silent: true })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'defense_registrations', filter: `student_id=eq.${profile.id}` },
        () => loadData({ silent: true })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'thesis_documents', filter: `student_id=eq.${profile.id}` },
        () => loadData({ silent: true })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, loadData]);

  const avgScore =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + Number(b.weighted_total), 0) / scores.length) * 100) / 100
      : null;

  const defenseDone = isDefenseCompleted(defenseSchedule, defenseRegistration, scores);

  const checklist = [
    {
      key: 'defense_done',
      label: 'Sidang akhir telah selesai dilaksanakan',
      met: defenseDone,
      targetPage: 'defense',
    },
    {
      key: 'score_ready',
      label: 'Nilai akhir sidang telah tersedia',
      met: scores.length > 0,
      targetPage: 'defense',
    },
    {
      key: 'revisions_approved',
      label: 'Revisi dokumen akhir telah disetujui',
      met: fullThesisDoc?.status === 'approved' || scores.some((s) => s.is_finalized),
      targetPage: 'documents',
    },
    {
      key: 'final_doc',
      label: 'Dokumen skripsi akhir (Full Thesis) telah diunggah',
      met: Boolean(fullThesisDoc),
      targetPage: 'defense',
    },
    {
      key: 'plagiarism_ok',
      label: 'Bukti plagiasi telah diverifikasi & disetujui',
      met: plagiarism?.status === 'approved',
      targetPage: 'plagiarism',
    },
    {
      key: 'academic_ok',
      label: 'Persyaratan akademik terpenuhi',
      met: profile?.academic_status === 'active',
      targetPage: 'profile',
    },
  ];

  const allMet = checklist.every((c) => c.met);
  const canSubmit = !record || ['incomplete', 'revision_required'].includes(record.status);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !thesis) return;
    if (!allMet) {
      showToast(
        'Persyaratan yudisium belum lengkap',
        'warning',
        'Pastikan seluruh item checklist yudisium telah terpenuhi.'
      );
      return;
    }

    setSubmitting(true);
    if (yudisiumDoc) {
      const up = await uploadPrivateDocument({
        file: yudisiumDoc,
        userId: profile.id,
        studentId: profile.id,
        category: 'graduation_document',
        title: `Berkas Persyaratan Yudisium — ${profile.full_name}`,
        thesisId: thesis.id,
        parentDocumentId: savedYudisiumDoc?.id || null,
        versionNumber: savedYudisiumDoc ? savedYudisiumDoc.version_number + 1 : 1,
        maxUploadMb: systemSettings?.max_upload_mb || 25,
      });
      if (up.error) {
        setSubmitting(false);
        showToast('Gagal mengunggah berkas yudisium', 'error', up.error);
        return;
      }
    }

    const checklistMap = Object.fromEntries(checklist.map((c) => [c.key, c.met]));
    const payload = {
      thesis_id: thesis.id,
      student_id: profile.id,
      period_id: activePeriod?.id || null,
      yudisium_period: activePeriod?.name || 'Periode Berjalan',
      checklist: checklistMap,
      final_score: avgScore,
      final_grade: avgScore !== null ? getLetterGrade(avgScore) : null,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    };

    const { data: saved, error } = record
      ? await supabase.from('graduation_records').update(payload).eq('id', record.id).select('*').single()
      : await supabase.from('graduation_records').insert(payload).select('*').single();

    setSubmitting(false);
    if (error) {
      showToast('Gagal mengajukan yudisium', 'error', error.message);
      return;
    }

    await logActivity('submit_yudisium', 'graduation_records', saved.id, {});
    setYudisiumDoc(null);
    showToast('Pengajuan yudisium berhasil dikirim', 'success');
    loadData({ silent: true });
  };

  if (loading) return <TableSkeleton rows={5} columns={3} />;

  if (!thesis) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="Yudisium Belum Tersedia"
        description="Tahap yudisium tersedia setelah seluruh proses tugas akhir dan sidang diselesaikan."
      />
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Pengajuan Yudisium & Kelulusan</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Verifikasi kelengkapan seluruh syarat pasca sidang hingga validasi kelulusan resmi.
          </p>
        </div>
        <StatusBadge status={record?.status || 'incomplete'} />
      </div>

      {/* Step-by-Step Post-Defense Progress up to Final Yudisium */}
      <PostDefenseStepper
        currentPage="yudisium"
        defenseSchedule={defenseSchedule}
        defenseRegistration={defenseRegistration}
        scores={scores}
        fullThesisDoc={fullThesisDoc}
        plagiarism={plagiarism}
        graduation={record}
        onNavigate={onNavigate}
      />

      {record?.status === 'graduated' && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/20 p-5 space-y-2 text-xs">
          <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
            Selamat! Status Kelulusan Yudisium Anda Telah Divalidasi
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <span className="text-slate-500">Periode Yudisium: </span>
              <span className="font-semibold">{record.yudisium_period}</span>
            </div>
            <div>
              <span className="text-slate-500">Tanggal Lulus: </span>
              <span className="font-mono font-semibold">{formatDate(record.graduation_date)}</span>
            </div>
            <div>
              <span className="text-slate-500">No. SK / Sertifikat: </span>
              <span className="font-mono font-semibold">{record.certificate_number || '—'}</span>
            </div>
          </div>
        </div>
      )}

      {record?.admin_notes && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-4 flex items-start gap-3 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Catatan Admin Yudisium</p>
            <p className="mt-0.5">{record.admin_notes}</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Checklist Kelengkapan Yudisium</h2>
          {plagiarism?.status !== 'approved' && onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('plagiarism')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-cyan-400 hover:underline"
            >
              <span>Selesaikan Cek Plagiasi</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {checklist.map((c) => (
            <div
              key={c.key}
              className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2.5 text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {c.met ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <span>{c.label}</span>
              </div>
              {!c.met && onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate(c.targetPage)}
                  className="text-[11px] font-medium text-blue-700 dark:text-cyan-400 hover:underline shrink-0"
                >
                  Lengkapi
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Side-by-Side Yudisium Document Upload & Realtime Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Berkas Persyaratan Yudisium</h2>
            <StatusBadge status={record?.status || 'incomplete'} />
          </div>

          {savedYudisiumDoc && (
            <SavedDocumentCard
              label="Berkas Yudisium Tersimpan"
              doc={savedYudisiumDoc}
              isActivePreview={!yudisiumDoc}
              replacedByLocalFile={yudisiumDoc}
              onPreview={() => {}}
            />
          )}

          {canSubmit && (
            <FileUploadField
              label={
                savedYudisiumDoc
                  ? 'Ganti Berkas Pengajuan Yudisium / Bebas Tanggungan (PDF)'
                  : 'Berkas Pengajuan Yudisium / Bebas Tanggungan (PDF)'
              }
              accept=".pdf"
              maxMb={systemSettings?.max_upload_mb || 25}
              selectedFile={yudisiumDoc}
              onSelectFile={setYudisiumDoc}
              helperText={
                savedYudisiumDoc
                  ? 'Berkas tersimpan tetap aman jika Anda tidak memilih file baru.'
                  : undefined
              }
            />
          )}

          {!canSubmit && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 px-3 py-2">
              Pengajuan yudisium Anda sedang diproses atau telah divalidasi. Berkas tetap tersimpan dan dapat dipratinjau di samping.
            </p>
          )}

          {canSubmit && (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting || !allMet}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Ajukan Yudisium
              </button>
            </div>
          )}
        </form>

        <div className="lg:col-span-7">
          <RealtimeDocumentPreviewPanel
            title="Realtime Preview Berkas Yudisium"
            activeSlotId="yudisium"
            onSelectSlot={() => {}}
            slots={[
              {
                id: 'yudisium',
                label: 'Berkas Yudisium',
                localFile: yudisiumDoc,
                savedDoc: savedYudisiumDoc,
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
