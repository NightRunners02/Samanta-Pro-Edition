import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, GraduationCap, Loader2, Send } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';
import { FileUploadField } from '../../components/ui/FileUploadField';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logActivity, supabase, uploadPrivateDocument } from '../../lib/supabase';
import { formatDate, getLetterGrade } from '../../lib/utils';
import type {
  ExamSchedule,
  ExamScore,
  GraduationRecord,
  PlagiarismCheck,
  ThesisDocument,
  ThesisSubmission,
} from '../../types/database';

export function YudisiumPage() {
  const { profile, activePeriod } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [thesis, setThesis] = useState<ThesisSubmission | null>(null);
  const [defenseSchedule, setDefenseSchedule] = useState<ExamSchedule | null>(null);
  const [scores, setScores] = useState<ExamScore[]>([]);
  const [plagiarism, setPlagiarism] = useState<PlagiarismCheck | null>(null);
  const [fullThesisDoc, setFullThesisDoc] = useState<ThesisDocument | null>(null);
  const [record, setRecord] = useState<GraduationRecord | null>(null);
  const [yudisiumDoc, setYudisiumDoc] = useState<File | null>(null);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
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
      const [{ data: sData }, { data: scData }, { data: plData }, { data: docData }, { data: gradData }] =
        await Promise.all([
          supabase
            .from('exam_schedules')
            .select('*')
            .eq('thesis_id', currentThesis.id)
            .eq('exam_type', 'defense')
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
            .from('graduation_records')
            .select('*')
            .eq('thesis_id', currentThesis.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      setDefenseSchedule((sData as ExamSchedule) || null);
      setScores((scData || []) as ExamScore[]);
      setPlagiarism((plData as PlagiarismCheck) || null);
      setFullThesisDoc((docData as ThesisDocument) || null);
      setRecord((gradData as GraduationRecord) || null);
    }
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const avgScore =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + Number(b.weighted_total), 0) / scores.length) * 100) / 100
      : null;

  const checklist = [
    { key: 'defense_done', label: 'Sidang akhir telah selesai dilaksanakan', met: defenseSchedule?.status === 'completed' || scores.length > 0 },
    { key: 'score_ready', label: 'Nilai akhir sidang telah tersedia', met: scores.length > 0 },
    { key: 'revisions_approved', label: 'Revisi dokumen akhir telah disetujui', met: fullThesisDoc?.status === 'approved' || scores.some((s) => s.is_finalized) },
    { key: 'final_doc', label: 'Dokumen skripsi akhir (Full Thesis) telah diunggah', met: Boolean(fullThesisDoc) },
    { key: 'plagiarism_ok', label: 'Bukti plagiasi telah diverifikasi & disetujui', met: plagiarism?.status === 'approved' },
    { key: 'academic_ok', label: 'Persyaratan akademik terpenuhi', met: profile?.academic_status === 'active' },
  ];

  const allMet = checklist.every((c) => c.met);
  const canSubmit = !record || ['incomplete', 'revision_required'].includes(record.status);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !thesis) return;
    if (!allMet) {
      showToast('Persyaratan yudisium belum lengkap', 'warning', 'Pastikan seluruh item checklist yudisium telah terpenuhi.');
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
    loadData();
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
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Pengajuan Yudisium & Kelulusan</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Verifikasi kelengkapan seluruh syarat yudisium untuk validasi kelulusan resmi.
          </p>
        </div>
        <StatusBadge status={record?.status || 'incomplete'} />
      </div>

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
        <h2 className="text-sm font-semibold">Checklist Kelengkapan Yudisium</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {checklist.map((c) => (
            <div
              key={c.key}
              className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center gap-2.5 text-xs"
            >
              {c.met ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span>{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {canSubmit && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          <FileUploadField
            label="Berkas Pengajuan Yudisium / Bebas Tanggungan (PDF)"
            accept=".pdf"
            selectedFile={yudisiumDoc}
            onSelectFile={setYudisiumDoc}
          />
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
        </form>
      )}
    </div>
  );
}
