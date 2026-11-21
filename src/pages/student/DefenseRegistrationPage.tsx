import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Award, CheckCircle2, Loader2, Send } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';
import { FileUploadField } from '../../components/ui/FileUploadField';
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
  ExaminerAssignment,
  Program,
  SubmissionRequirement,
  SupervisionSession,
  ThesisProgress,
  ThesisSubmission,
} from '../../types/database';

export function DefenseRegistrationPage() {
  const { profile, activePeriod, systemSettings } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [thesis, setThesis] = useState<ThesisSubmission | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [chapters, setChapters] = useState<ThesisProgress[]>([]);
  const [sessions, setSessions] = useState<SupervisionSession[]>([]);
  const [requirements, setRequirements] = useState<SubmissionRequirement[]>([]);
  const [registration, setRegistration] = useState<DefenseRegistration | null>(null);
  const [schedule, setSchedule] = useState<ExamSchedule | null>(null);
  const [examiners, setExaminers] = useState<ExaminerAssignment[]>([]);
  const [scores, setScores] = useState<ExamScore[]>([]);

  const [thesisFile, setThesisFile] = useState<File | null>(null);
  const [supportingFile, setSupportingFile] = useState<File | null>(null);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);

    const [{ data: tData }, { data: progData }, { data: reqData }] = await Promise.all([
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
        .eq('stage', 'defense_registration')
        .eq('is_active', true)
        .order('sort_order'),
    ]);

    const currentThesis = (tData as ThesisSubmission) || null;
    setThesis(currentThesis);
    setProgram((progData as Program) || null);
    setRequirements(
      ((reqData || []) as SubmissionRequirement[]).filter(
        (r) => !r.program_id || r.program_id === profile.program_id
      )
    );

    if (currentThesis) {
      const [{ data: chData }, { data: sessData }, { data: regData }, { data: schedData }, { data: scoreData }] =
        await Promise.all([
          supabase.from('thesis_progress').select('*').eq('thesis_id', currentThesis.id),
          supabase.from('supervision_sessions').select('*').eq('thesis_id', currentThesis.id),
          supabase
            .from('defense_registrations')
            .select('*')
            .eq('thesis_id', currentThesis.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('exam_schedules')
            .select('*')
            .eq('thesis_id', currentThesis.id)
            .eq('exam_type', 'defense')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('exam_scores')
            .select('*, examiner:profiles!exam_scores_examiner_id_fkey(*)')
            .eq('thesis_id', currentThesis.id),
        ]);

      setChapters((chData || []) as ThesisProgress[]);
      setSessions((sessData || []) as SupervisionSession[]);
      setRegistration((regData as DefenseRegistration) || null);
      const sched = (schedData as ExamSchedule) || null;
      setSchedule(sched);
      setScores((scoreData || []) as ExamScore[]);

      if (sched) {
        const { data: exData } = await supabase
          .from('examiner_assignments')
          .select('*, lecturer:profiles!examiner_assignments_lecturer_id_fkey(*)')
          .eq('schedule_id', sched.id);
        setExaminers((exData || []) as ExaminerAssignment[]);
      }
    }

    setLoading(false);
  }, [profile?.id, profile?.program_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const approvedChapters = chapters.filter((c) => c.status === 'approved').length;
  const completedGuidance = sessions.filter((s) => s.status === 'completed').length;
  const minGuidance = program?.min_guidance_sessions ?? 8;
  const minSks = program?.min_sks ?? systemSettings?.default_min_sks ?? 110;

  const isReqMet = (req: SubmissionRequirement): boolean => {
    switch (req.rule_key) {
      case 'chapters_approved':
        return approvedChapters >= Number(req.rule_value || 5);
      case 'min_guidance':
        return completedGuidance >= Number(req.rule_value || minGuidance);
      case 'min_sks':
        return (profile?.completed_sks || 0) >= Number(req.rule_value || minSks);
      case 'supervisor_approval':
        return Boolean(registration?.supervisor_1_approved);
      default:
        return true;
    }
  };

  const canSubmit =
    !registration || ['draft', 'revision_required', 'rejected'].includes(registration.status);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !thesis) return;
    if (!thesisFile && !registration?.full_thesis_document_id) {
      showToast('Unggah dokumen lengkap skripsi (Full Thesis) terlebih dahulu', 'warning');
      return;
    }

    setSubmitting(true);
    let fullDocId = registration?.full_thesis_document_id || null;
    let suppDocId = registration?.supporting_document_id || null;

    if (thesisFile) {
      const up = await uploadPrivateDocument({
        file: thesisFile,
        userId: profile.id,
        studentId: profile.id,
        category: 'full_thesis',
        title: `Naskah Lengkap Sidang — ${thesis.title}`,
        thesisId: thesis.id,
        maxUploadMb: systemSettings?.max_upload_mb || 25,
      });
      if (up.error) {
        setSubmitting(false);
        showToast('Gagal mengunggah naskah skripsi', 'error', up.error);
        return;
      }
      fullDocId = up.data?.id || null;
    }

    if (supportingFile) {
      const up2 = await uploadPrivateDocument({
        file: supportingFile,
        userId: profile.id,
        studentId: profile.id,
        category: 'defense_document',
        title: `Berkas Persyaratan Sidang — ${profile.full_name}`,
        thesisId: thesis.id,
      });
      if (up2.error) {
        setSubmitting(false);
        showToast('Gagal mengunggah berkas pendukung', 'error', up2.error);
        return;
      }
      suppDocId = up2.data?.id || null;
    }

    const checklist = requirements.map((r) => ({ id: r.id, title: r.title, met: isReqMet(r) }));
    const payload = {
      thesis_id: thesis.id,
      student_id: profile.id,
      period_id: activePeriod?.id || null,
      full_thesis_document_id: fullDocId,
      supporting_document_id: suppDocId,
      requirements_checklist: checklist,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    };

    const { data: saved, error } = registration
      ? await supabase.from('defense_registrations').update(payload).eq('id', registration.id).select('*').single()
      : await supabase.from('defense_registrations').insert(payload).select('*').single();

    setSubmitting(false);
    if (error) {
      showToast('Gagal mendaftar sidang akhir', 'error', error.message);
      return;
    }

    await logActivity('submit_defense_registration', 'defense_registrations', saved.id, {});
    setThesisFile(null);
    setSupportingFile(null);
    showToast('Pendaftaran sidang akhir berhasil dikirim', 'success');
    loadData();
  };

  const finalAverage =
    scores.length > 0
      ? Math.round((scores.reduce((acc, s) => acc + Number(s.weighted_total), 0) / scores.length) * 100) / 100
      : null;

  if (loading) return <TableSkeleton rows={5} columns={3} />;

  if (!thesis || thesis.status !== 'approved') {
    return (
      <EmptyState
        icon={Award}
        title="Pendaftaran Sidang Belum Tersedia"
        description="Selesaikan persetujuan judul, bimbingan, dan Bab 1–5 sebelum mendaftar sidang tugas akhir."
      />
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Pendaftaran Sidang Akhir & Hasil Penilaian</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Periksa kelengkapan persyaratan sidang, jadwal penguji, dan nilai evaluasi akhir Anda.
          </p>
        </div>
        {registration && <StatusBadge status={registration.status} />}
      </div>

      {registration?.admin_notes && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-4 flex items-start gap-3 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900 dark:text-amber-200">Catatan Verifikasi Sidang</p>
            <p className="text-amber-800 dark:text-amber-300 mt-0.5">{registration.admin_notes}</p>
          </div>
        </div>
      )}

      {/* Checklist Persyaratan Dinamis */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Checklist Persyaratan Sidang Akhir</h2>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            Bab Disetujui: {approvedChapters}/5 · Bimbingan: {completedGuidance}/{minGuidance}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {requirements.map((r) => {
            const met = isReqMet(r);
            return (
              <div
                key={r.id}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 text-xs"
              >
                {met ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-medium">{r.title}</p>
                  {r.description && <p className="text-[11px] text-slate-500 mt-0.5">{r.description}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Schedule Display */}
      {schedule && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Jadwal Sidang Tugas Akhir</h2>
            <StatusBadge status={schedule.status} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <p className="text-slate-500">Tanggal</p>
              <p className="font-mono font-semibold mt-0.5">{formatDate(schedule.exam_date)}</p>
            </div>
            <div>
              <p className="text-slate-500">Waktu</p>
              <p className="font-mono font-semibold mt-0.5">
                {schedule.start_time.slice(0, 5)} – {schedule.end_time.slice(0, 5)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Ruang / Lokasi</p>
              <p className="font-semibold mt-0.5">{schedule.room_name}</p>
            </div>
          </div>
          {examiners.length > 0 && (
            <div className="pt-2 border-t border-blue-200/70 dark:border-blue-900/50 text-xs">
              <p className="font-medium mb-1">Dewan Penguji:</p>
              <div className="flex flex-wrap gap-3">
                {examiners.map((ex) => (
                  <span key={ex.id}>
                    {ex.lecturer?.full_name} ({ex.examiner_role.replace(/_/g, ' ')})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Read-Only Examination Scores */}
      {scores.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Hasil Penilaian Sidang (Read-Only)</h2>
              <p className="text-xs text-slate-500">
                Nilai dihitung otomatis berdasarkan bobot rubrik penilaian program studi.
              </p>
            </div>
            {finalAverage !== null && (
              <div className="text-right">
                <span className="text-xs text-slate-500">Nilai Akhir: </span>
                <span className="text-lg font-bold font-mono tabular-nums text-blue-700 dark:text-cyan-400">
                  {finalAverage} ({getLetterGrade(finalAverage)})
                </span>
                <span className="ml-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  {finalAverage >= 60 ? 'Lulus' : 'Tidak Lulus'}
                </span>
              </div>
            )}
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {scores.map((sc) => (
              <div key={sc.id} className="py-3 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{sc.examiner?.full_name || 'Dosen Penguji'}</span>
                  <span className="font-mono font-semibold tabular-nums">
                    Skor: {sc.weighted_total}
                  </span>
                </div>
                {sc.evaluation_notes && (
                  <p className="text-slate-600 dark:text-slate-300">Evaluasi: {sc.evaluation_notes}</p>
                )}
                {sc.revision_notes && (
                  <p className="text-amber-700 dark:text-amber-400">Catatan Revisi: {sc.revision_notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Registration Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
      >
        <h2 className="text-sm font-semibold">Berkas Pendaftaran Sidang Akhir</h2>
        <FileUploadField
          label="Naskah Skripsi Lengkap / Full Thesis (PDF) *"
          accept=".pdf"
          selectedFile={thesisFile}
          onSelectFile={setThesisFile}
        />
        <FileUploadField
          label="Berkas Pendukung Persyaratan Sidang (PDF)"
          accept=".pdf,.png,.jpg"
          selectedFile={supportingFile}
          onSelectFile={setSupportingFile}
        />
        {canSubmit && (
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Kirim Pendaftaran Sidang
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
