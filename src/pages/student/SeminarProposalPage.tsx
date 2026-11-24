import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
} from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';
import { FileUploadField } from '../../components/ui/FileUploadField';
import {
  RealtimeDocumentPreviewPanel,
  SavedDocumentCard,
} from '../../components/ui/RealtimeDocumentPreviewPanel';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logActivity, supabase, uploadPrivateDocument } from '../../lib/supabase';
import { cn, formatDate } from '../../lib/utils';
import type {
  ExamSchedule,
  ExaminerAssignment,
  Program,
  SeminarRegistration,
  SubmissionRequirement,
  SupervisionSession,
  ThesisDocument,
  ThesisProgress,
  ThesisSubmission,
} from '../../types/database';

interface SeminarProposalPageProps {
  onNavigate?: (pageId: string) => void;
}

const SEMINAR_CHAPTERS = [
  { num: 1, label: 'Bab 1 — Pendahuluan' },
  { num: 2, label: 'Bab 2 — Tinjauan Pustaka' },
  { num: 3, label: 'Bab 3 — Metodologi Penelitian' },
];

export function SeminarProposalPage({ onNavigate }: SeminarProposalPageProps) {
  const { profile, activePeriod, systemSettings } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [thesis, setThesis] = useState<ThesisSubmission | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [chapters, setChapters] = useState<ThesisProgress[]>([]);
  const [sessions, setSessions] = useState<SupervisionSession[]>([]);
  const [registration, setRegistration] = useState<SeminarRegistration | null>(null);
  const [proposalDoc, setProposalDoc] = useState<ThesisDocument | null>(null);
  const [supportingDoc, setSupportingDoc] = useState<ThesisDocument | null>(null);
  const [requirements, setRequirements] = useState<SubmissionRequirement[]>([]);
  const [schedule, setSchedule] = useState<ExamSchedule | null>(null);
  const [examiners, setExaminers] = useState<ExaminerAssignment[]>([]);

  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const [supportingFile, setSupportingFile] = useState<File | null>(null);
  const [activePreviewSlot, setActivePreviewSlot] = useState<'proposal' | 'supporting'>('proposal');

  const loadData = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!profile?.id) return;
      if (!opts?.silent) setLoading(true);

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
          .eq('stage', 'seminar_proposal')
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
        const [{ data: chData }, { data: sessData }, { data: regData }, { data: schedData }] =
          await Promise.all([
            supabase
              .from('thesis_progress')
              .select('*')
              .eq('thesis_id', currentThesis.id)
              .order('chapter_number'),
            supabase
              .from('supervision_sessions')
              .select('*')
              .eq('thesis_id', currentThesis.id),
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

        setChapters((chData || []) as ThesisProgress[]);
        setSessions((sessData || []) as SupervisionSession[]);
        const currentReg = (regData as SeminarRegistration) || null;
        setRegistration(currentReg);

        const docIds = [currentReg?.proposal_document_id, currentReg?.supporting_document_id].filter(
          Boolean
        ) as string[];
        if (docIds.length > 0) {
          const { data: docsData } = await supabase
            .from('thesis_documents')
            .select('*')
            .in('id', docIds);
          const docsMap = new Map<string, ThesisDocument>(
            ((docsData || []) as ThesisDocument[]).map((d) => [d.id, d])
          );
          setProposalDoc(
            currentReg?.proposal_document_id ? docsMap.get(currentReg.proposal_document_id) || null : null
          );
          setSupportingDoc(
            currentReg?.supporting_document_id ? docsMap.get(currentReg.supporting_document_id) || null : null
          );
        } else {
          setProposalDoc(null);
          setSupportingDoc(null);
        }

        const sched = (schedData as ExamSchedule) || null;
        setSchedule(sched);

        if (sched) {
          const { data: exData } = await supabase
            .from('examiner_assignments')
            .select('*, lecturer:profiles!examiner_assignments_lecturer_id_fkey(*)')
            .eq('schedule_id', sched.id);
          setExaminers((exData || []) as ExaminerAssignment[]);
        } else {
          setExaminers([]);
        }
      } else {
        setChapters([]);
        setSessions([]);
        setRegistration(null);
        setProposalDoc(null);
        setSupportingDoc(null);
        setSchedule(null);
        setExaminers([]);
      }

      if (!opts?.silent) setLoading(false);
    },
    [profile?.id, profile?.program_id]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime sync for registration status, documents, chapter 1-3 approvals, guidance, and exam schedules
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`student_seminar_realtime_${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seminar_registrations', filter: `student_id=eq.${profile.id}` },
        () => loadData({ silent: true })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'thesis_documents', filter: `student_id=eq.${profile.id}` },
        () => loadData({ silent: true })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'thesis_progress', filter: `student_id=eq.${profile.id}` },
        () => loadData({ silent: true })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'supervision_sessions', filter: `student_id=eq.${profile.id}` },
        () => loadData({ silent: true })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exam_schedules', filter: `student_id=eq.${profile.id}` },
        () => loadData({ silent: true })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, loadData]);

  const approvedChapters1to3 = SEMINAR_CHAPTERS.filter(
    (ch) => chapters.find((c) => c.chapter_number === ch.num)?.status === 'approved'
  ).length;
  const isChapters1to3Ready = approvedChapters1to3 >= 3;
  const completedGuidance = sessions.filter((s) => s.status === 'completed').length;
  const minSks = program?.min_sks ?? systemSettings?.default_min_sks ?? 110;
  const minGpa = program?.min_gpa ?? systemSettings?.default_min_gpa ?? 2.75;

  const isReqMet = (req: SubmissionRequirement): boolean => {
    switch (req.rule_key) {
      case 'chapters_1_3_approved':
      case 'chapters_approved':
        return approvedChapters1to3 >= Number(req.rule_value || 3);
      case 'supervisor_approval':
        return Boolean(registration?.supervisor_approved);
      case 'min_guidance':
        return completedGuidance >= Number(req.rule_value || 4);
      case 'min_sks':
        return (profile?.completed_sks || 0) >= Number(req.rule_value || minSks);
      case 'min_gpa':
        return (profile?.gpa || 0) >= Number(req.rule_value || minGpa);
      case 'active_status':
        return profile?.academic_status === 'active';
      default:
        return true;
    }
  };

  // Ensure Bab 1-3 approval requirement always appears even if Admin has not seeded custom rows yet
  const hasChapterReqInDb = requirements.some(
    (r) => r.rule_key === 'chapters_1_3_approved' || r.rule_key === 'chapters_approved'
  );
  const checklistItems: Array<{
    id: string;
    title: string;
    description: string | null;
    met: boolean;
  }> = [
    ...(hasChapterReqInDb
      ? []
      : [
          {
            id: 'default-chapters-1-3',
            title: 'Bab 1 s/d Bab 3 Disetujui Dosen Pembimbing',
            description:
              'Bab 1 (Pendahuluan), Bab 2 (Tinjauan Pustaka), dan Bab 3 (Metodologi Penelitian) harus berstatus Disetujui.',
            met: isChapters1to3Ready,
          },
        ]),
    ...requirements.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      met: isReqMet(r),
    })),
  ];

  const canSubmit =
    !registration || ['draft', 'revision_required', 'rejected'].includes(registration.status);

  const handleSelectProposalFile = (file: File | null) => {
    setProposalFile(file);
    if (file) setActivePreviewSlot('proposal');
  };

  const handleSelectSupportingFile = (file: File | null) => {
    setSupportingFile(file);
    if (file) setActivePreviewSlot('supporting');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !thesis) return;
    if (!isChapters1to3Ready) {
      showToast(
        'Bab 1 sampai Bab 3 belum seluruhnya disetujui',
        'warning',
        'Pastikan Dosen Pembimbing telah menyetujui Bab 1, Bab 2, dan Bab 3 pada halaman Progres Bab.'
      );
      return;
    }
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
        parentDocumentId: propId,
        versionNumber: proposalDoc ? proposalDoc.version_number + 1 : 1,
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
        parentDocumentId: suppId,
        versionNumber: supportingDoc ? supportingDoc.version_number + 1 : 1,
        maxUploadMb: systemSettings?.max_upload_mb || 25,
      });
      if (up2.error) {
        setSubmitting(false);
        showToast('Gagal mengunggah bukti persyaratan', 'error', up2.error);
        return;
      }
      suppId = up2.data?.id || null;
    }

    const checklist = checklistItems.map((c) => ({ id: c.id, title: c.title, met: c.met }));
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
    loadData({ silent: true });
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
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Pendaftaran Seminar Proposal</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Pastikan Bab 1 s/d Bab 3 telah disetujui dosen pembimbing, unggah naskah proposal, lalu pantau jadwal serta penguji Anda.
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

      {/* Dynamic Checklist Persyaratan Seminar Proposal (Bab 1-3 Disetujui Dosen Pembimbing) */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Checklist Persyaratan Seminar Proposal</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Syarat utama seminar proposal: Bab 1, Bab 2, dan Bab 3 telah disetujui oleh dosen pembimbing.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
            Bab 1–3 Disetujui: {approvedChapters1to3}/3 · ACC Pembimbing:{' '}
            {registration?.supervisor_approved ? 'Ya' : 'Menunggu'}
          </span>
        </div>

        {/* Status Persetujuan Per Bab (Bab 1 - Bab 3) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SEMINAR_CHAPTERS.map((ch) => {
            const chapterRow = chapters.find((c) => c.chapter_number === ch.num);
            const approved = chapterRow?.status === 'approved';
            return (
              <div
                key={ch.num}
                className={cn(
                  'p-3 rounded-lg border flex items-center justify-between gap-2 text-xs',
                  approved
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : 'border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/15'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {approved ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                  <span className="font-medium truncate">{ch.label}</span>
                </div>
                <StatusBadge status={chapterRow?.status || 'not_started'} />
              </div>
            );
          })}
        </div>

        {/* Checklist Aturan Prodi */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {checklistItems.map((item) => (
            <div
              key={item.id}
              className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 text-xs"
            >
              {item.met ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-medium">{item.title}</p>
                {item.description && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {item.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {!isChapters1to3Ready && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <p className="text-amber-800 dark:text-amber-300">
              Pengajuan seminar proposal baru dapat dikirim setelah <strong>Bab 1, Bab 2, dan Bab 3</strong> disetujui oleh dosen pembimbing.
            </p>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('chapters')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-medium shrink-0"
              >
                <span>Buka Progres Bab 1–5</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Side-by-Side Document Upload & Realtime Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Dokumen Pendaftaran Seminar</h2>
            {registration && <StatusBadge status={registration.status} />}
          </div>

          {proposalDoc && (
            <SavedDocumentCard
              label="Naskah Proposal Tersimpan"
              doc={proposalDoc}
              isActivePreview={activePreviewSlot === 'proposal' && !proposalFile}
              replacedByLocalFile={proposalFile}
              onPreview={() => setActivePreviewSlot('proposal')}
            />
          )}

          {canSubmit && (
            <FileUploadField
              label={
                proposalDoc
                  ? 'Ganti Naskah Proposal Seminar (PDF/DOCX)'
                  : 'Naskah Proposal Seminar (PDF) *'
              }
              accept=".pdf,.docx"
              maxMb={systemSettings?.max_upload_mb || 25}
              selectedFile={proposalFile}
              onSelectFile={handleSelectProposalFile}
              helperText={
                proposalDoc
                  ? 'Berkas tersimpan tetap aman jika Anda tidak memilih file baru.'
                  : undefined
              }
            />
          )}

          {supportingDoc && (
            <SavedDocumentCard
              label="Bukti Persyaratan Tersimpan"
              doc={supportingDoc}
              isActivePreview={activePreviewSlot === 'supporting' && !supportingFile}
              replacedByLocalFile={supportingFile}
              onPreview={() => setActivePreviewSlot('supporting')}
            />
          )}

          {canSubmit && (
            <FileUploadField
              label={
                supportingDoc
                  ? 'Ganti Bukti Persyaratan Administrasi (PDF/Gambar)'
                  : 'Bukti Persyaratan Administrasi / Kartu Bimbingan (PDF/Gambar)'
              }
              accept=".pdf,.png,.jpg,.jpeg"
              maxMb={systemSettings?.max_upload_mb || 25}
              selectedFile={supportingFile}
              onSelectFile={handleSelectSupportingFile}
              helperText={
                supportingDoc
                  ? 'Berkas tersimpan tetap aman jika Anda tidak memilih file baru.'
                  : undefined
              }
            />
          )}

          {!canSubmit && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 px-3 py-2">
              Pendaftaran seminar telah dikirim. Berkas Anda tetap tersimpan dan dapat dipratinjau di panel sebelah kanan.
            </p>
          )}

          {canSubmit && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={submitting || !isChapters1to3Ready}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Ajukan Seminar Proposal
              </button>
            </div>
          )}
        </form>

        <div className="lg:col-span-7">
          <RealtimeDocumentPreviewPanel
            title="Realtime Preview Dokumen Seminar"
            activeSlotId={activePreviewSlot}
            onSelectSlot={(id) => setActivePreviewSlot(id as 'proposal' | 'supporting')}
            slots={[
              {
                id: 'proposal',
                label: 'Naskah Proposal',
                localFile: proposalFile,
                savedDoc: proposalDoc,
              },
              {
                id: 'supporting',
                label: 'Bukti Persyaratan',
                localFile: supportingFile,
                savedDoc: supportingDoc,
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
