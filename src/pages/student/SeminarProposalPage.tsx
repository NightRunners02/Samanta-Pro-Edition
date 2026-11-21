import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Clock, Loader2, Send, AlertCircle } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';
import { FileUploadField } from '../../components/ui/FileUploadField';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logActivity, supabase, uploadPrivateDocument } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import type {
  ExamSchedule,
  ExaminerAssignment,
  SeminarRegistration,
  SubmissionRequirement,
  ThesisSubmission,
} from '../../types/database';

export function SeminarProposalPage() {
  const { profile, activePeriod, systemSettings } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [thesis, setThesis] = useState<ThesisSubmission | null>(null);
  const [registration, setRegistration] = useState<SeminarRegistration | null>(null);
  const [requirements, setRequirements] = useState<SubmissionRequirement[]>([]);
  const [schedule, setSchedule] = useState<ExamSchedule | null>(null);
  const [examiners, setExaminers] = useState<ExaminerAssignment[]>([]);

  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const [supportingFile, setSupportingFile] = useState<File | null>(null);

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

    const { data: reqData } = await supabase
      .from('submission_requirements')
      .select('*')
      .eq('stage', 'seminar_proposal')
      .eq('is_active', true)
      .order('sort_order');

    setRequirements(
      ((reqData || []) as SubmissionRequirement[]).filter(
        (r) => !r.program_id || r.program_id === profile.program_id
      )
    );

    if (currentThesis) {
      const [{ data: regData }, { data: schedData }] = await Promise.all([
        supabase
          .from('seminar_registrations')
          .select('*')
          .eq('thesis_id', currentThesis.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('exam_schedules')
          .select('*')
          .eq('thesis_id', currentThesis.id)
          .eq('exam_type', 'seminar')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      setRegistration((regData as SeminarRegistration) || null);
      const sched = (schedData as ExamSchedule) || null;
      setSchedule(sched);

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

  const canSubmit =
    !registration || ['draft', 'revision_required', 'rejected'].includes(registration.status);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !thesis) return;
    if (!proposalFile && !registration?.proposal_document_id) {
      showToast('Unggah dokumen proposal seminar terlebih dahulu', 'warning');
      return;
    }

    setSubmitting(true);
    let propId = registration?.proposal_document_id || null;
    let suppId = registration?.supporting_document_id || null;

    if (proposalFile) {
      const up = await uploadPrivateDocument({
        file: proposalFile,
        userId: profile.id,
        studentId: profile.id,
        category: 'seminar_document',
        title: `Naskah Seminar Proposal — ${thesis.title}`,
        thesisId: thesis.id,
        maxUploadMb: systemSettings?.max_upload_mb || 25,
      });
      if (up.error) {
        setSubmitting(false);
        showToast('Gagal mengunggah proposal', 'error', up.error);
        return;
      }
      propId = up.data?.id || null;
    }

    if (supportingFile) {
      const up2 = await uploadPrivateDocument({
        file: supportingFile,
        userId: profile.id,
        studentId: profile.id,
        category: 'supporting_document',
        title: `Bukti Persyaratan Seminar — ${profile.full_name}`,
        thesisId: thesis.id,
        maxUploadMb: systemSettings?.max_upload_mb || 25,
      });
      if (up2.error) {
        setSubmitting(false);
        showToast('Gagal mengunggah bukti persyaratan', 'error', up2.error);
        return;
      }
      suppId = up2.data?.id || null;
    }

    const checklist = requirements.map((r) => ({ id: r.id, title: r.title, met: true }));
    const payload = {
      thesis_id: thesis.id,
      student_id: profile.id,
      period_id: activePeriod?.id || null,
      proposal_document_id: propId,
      supporting_document_id: suppId,
      requirements_checklist: checklist,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    };

    const { data: saved, error } = registration
      ? await supabase.from('seminar_registrations').update(payload).eq('id', registration.id).select('*').single()
      : await supabase.from('seminar_registrations').insert(payload).select('*').single();

    setSubmitting(false);
    if (error) {
      showToast('Gagal mendaftar seminar proposal', 'error', error.message);
      return;
    }

    await logActivity('submit_seminar_proposal', 'seminar_registrations', saved.id, {});
    setProposalFile(null);
    setSupportingFile(null);
    showToast('Pendaftaran seminar proposal dikirim', 'success');
    loadData();
  };

  if (loading) return <TableSkeleton rows={4} columns={3} />;

  if (!thesis || thesis.status !== 'approved') {
    return (
      <EmptyState
        icon={Calendar}
        title="Seminar Proposal Belum Tersedia"
        description="Judul tugas akhir Anda harus disetujui terlebih dahulu sebelum mendaftar seminar proposal."
      />
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Pendaftaran Seminar Proposal</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Unggah naskah proposal dan persyaratan seminar, lalu pantau jadwal serta penguji Anda.
          </p>
        </div>
        {registration && <StatusBadge status={registration.status} />}
      </div>

      {registration?.admin_notes && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-4 flex items-start gap-3 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900 dark:text-amber-200">Catatan Verifikasi Prodi</p>
            <p className="text-amber-800 dark:text-amber-300 mt-0.5">{registration.admin_notes}</p>
          </div>
        </div>
      )}

      {schedule && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-blue-950 dark:text-blue-100">Jadwal Seminar Proposal Anda</h2>
            <StatusBadge status={schedule.status} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <p className="text-slate-500 dark:text-slate-400">Tanggal</p>
              <p className="font-mono font-semibold mt-0.5">{formatDate(schedule.exam_date)}</p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Waktu</p>
              <p className="font-mono font-semibold mt-0.5 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {schedule.start_time.slice(0, 5)} – {schedule.end_time.slice(0, 5)}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Ruangan / Tautan</p>
              <p className="font-semibold mt-0.5">{schedule.room_name}</p>
            </div>
          </div>
          {examiners.length > 0 && (
            <div className="pt-2 border-t border-blue-200/70 dark:border-blue-900/50 text-xs">
              <p className="font-medium text-slate-600 dark:text-slate-300 mb-1">Tim Penguji:</p>
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

      {requirements.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h2 className="text-sm font-semibold">Persyaratan Seminar Proposal</h2>
          <div className="space-y-2">
            {requirements.map((r) => (
              <div key={r.id} className="flex items-start gap-2.5 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{r.title}</p>
                  {r.description && <p className="text-[11px] text-slate-500">{r.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
      >
        <h2 className="text-sm font-semibold">Dokumen Pendaftaran Seminar</h2>
        <FileUploadField
          label="Naskah Proposal Seminar (PDF) *"
          accept=".pdf,.docx"
          selectedFile={proposalFile}
          onSelectFile={setProposalFile}
          helperText={registration?.proposal_document_id ? 'Proposal sudah terunggah. Pilih file baru jika ingin mengganti.' : undefined}
        />
        <FileUploadField
          label="Bukti Persyaratan Administrasi / Kartu Bimbingan (PDF/Gambar)"
          accept=".pdf,.png,.jpg,.jpeg"
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
              Ajukan Seminar Proposal
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
