import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquareText,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SupportingDecreesSection } from '../../components/student/SupportingDecreesSection';
import { CardGridSkeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import {
  ensureInitialDecreeIfEligible,
  isExaminerDecreeEligible,
  isSupervisorDecreeEligible,
} from '../../lib/decreeService';
import { supabase } from '../../lib/supabase';
import { cn, formatDate, formatDateTime } from '../../lib/utils';
import type {
  ActivityLog,
  AppNotification,
  DecreeType,
  DefenseRegistration,
  ExamSchedule,
  ExamScore,
  ExaminerAssignment,
  GraduationRecord,
  OfficialDecree,
  PlagiarismCheck,
  SeminarRegistration,
  SupervisionSession,
  ThesisProgress,
  ThesisSubmission,
  ThesisSupervisor,
} from '../../types/database';

interface StudentDashboardProps {
  onNavigate: (pageId: string) => void;
}

type StepState =
  | 'not_started'
  | 'pending'
  | 'in_progress'
  | 'needs_revision'
  | 'approved'
  | 'completed'
  | 'rejected';

export function StudentDashboard({ onNavigate }: StudentDashboardProps) {
  const { profile, activePeriod } = useAuth();
  const [loading, setLoading] = useState(true);
  const [thesis, setThesis] = useState<ThesisSubmission | null>(null);
  const [supervisors, setSupervisors] = useState<ThesisSupervisor[]>([]);
  const [chapters, setChapters] = useState<ThesisProgress[]>([]);
  const [sessions, setSessions] = useState<SupervisionSession[]>([]);
  const [seminar, setSeminar] = useState<SeminarRegistration | null>(null);
  const [defense, setDefense] = useState<DefenseRegistration | null>(null);
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [scores, setScores] = useState<ExamScore[]>([]);
  const [plagiarism, setPlagiarism] = useState<PlagiarismCheck | null>(null);
  const [graduation, setGraduation] = useState<GraduationRecord | null>(null);
  const [decrees, setDecrees] = useState<OfficialDecree[]>([]);
  const [defenseExaminers, setDefenseExaminers] = useState<ExaminerAssignment[]>([]);
  const [generatingDecreeType, setGeneratingDecreeType] = useState<DecreeType | null>(null);
  const bootstrappedRef = useRef<Record<string, boolean>>({});
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);

  const loadAll = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);

    const { data: thesisList } = await supabase
      .from('thesis_submissions')
      .select('*')
      .eq('student_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const currentThesis = (thesisList?.[0] as ThesisSubmission) || null;
    setThesis(currentThesis);

    const [
      { data: notifData },
      { data: actData },
      { data: schedData },
    ] = await Promise.all([
      supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('activity_logs')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('exam_schedules')
        .select('*')
        .eq('student_id', profile.id)
        .order('exam_date', { ascending: true }),
    ]);

    setNotifications((notifData || []) as AppNotification[]);
    setActivities((actData || []) as ActivityLog[]);
    setSchedules((schedData || []) as ExamSchedule[]);

    if (currentThesis) {
      const [
        { data: supData },
        { data: chapData },
        { data: sessData },
        { data: semData },
        { data: defData },
        { data: scoreData },
        { data: plagData },
        { data: gradData },
        { data: decreeData },
        { data: examinerData },
      ] = await Promise.all([
        supabase
          .from('thesis_supervisors')
          .select('*, lecturer:profiles!thesis_supervisors_lecturer_id_fkey(*)')
          .eq('thesis_id', currentThesis.id)
          .eq('status', 'active'),
        supabase
          .from('thesis_progress')
          .select('*')
          .eq('thesis_id', currentThesis.id)
          .order('chapter_number'),
        supabase
          .from('supervision_sessions')
          .select('*')
          .eq('thesis_id', currentThesis.id)
          .order('scheduled_date', { ascending: false }),
        supabase
          .from('seminar_registrations')
          .select('*')
          .eq('thesis_id', currentThesis.id)
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
          .from('graduation_records')
          .select('*')
          .eq('thesis_id', currentThesis.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('official_decrees')
          .select('*')
          .eq('thesis_id', currentThesis.id)
          .order('version_number', { ascending: false }),
        supabase
          .from('examiner_assignments')
          .select('*')
          .eq('thesis_id', currentThesis.id),
      ]);

      setSupervisors((supData || []) as ThesisSupervisor[]);
      setChapters((chapData || []) as ThesisProgress[]);
      setSessions((sessData || []) as SupervisionSession[]);
      setSeminar((semData as SeminarRegistration) || null);
      setDefense((defData as DefenseRegistration) || null);
      setScores((scoreData || []) as ExamScore[]);
      setPlagiarism((plagData as PlagiarismCheck) || null);
      setGraduation((gradData as GraduationRecord) || null);
      setDecrees((decreeData || []) as OfficialDecree[]);
      setDefenseExaminers((examinerData || []) as ExaminerAssignment[]);
    } else {
      setDecrees([]);
      setDefenseExaminers([]);
    }

    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    loadAll();
    if (!profile?.id) return;

    const channel = supabase
      .channel(`student_dashboard_${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'thesis_submissions', filter: `student_id=eq.${profile.id}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'thesis_supervisors', filter: `student_id=eq.${profile.id}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'thesis_progress', filter: `student_id=eq.${profile.id}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supervision_sessions', filter: `student_id=eq.${profile.id}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_schedules', filter: `student_id=eq.${profile.id}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'examiner_assignments' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seminar_registrations', filter: `student_id=eq.${profile.id}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'defense_registrations', filter: `student_id=eq.${profile.id}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_scores' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plagiarism_checks', filter: `student_id=eq.${profile.id}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'graduation_records', filter: `student_id=eq.${profile.id}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'official_decrees', filter: `student_id=eq.${profile.id}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, loadAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAll, profile?.id]);

  const latestDefenseSchedule = useMemo(
    () =>
      [...schedules]
        .reverse()
        .find((s) => s.exam_type === 'defense' && s.status !== 'cancelled') || null,
    [schedules]
  );

  const supervisorDecreeEligible = useMemo(
    () => isSupervisorDecreeEligible(thesis, supervisors),
    [thesis, supervisors]
  );

  const examinerDecreeEligible = useMemo(
    () => isExaminerDecreeEligible(thesis, defense, latestDefenseSchedule, defenseExaminers),
    [thesis, defense, latestDefenseSchedule, defenseExaminers]
  );

  // Automatically generate & archive initial v1 PDF when workflow requirements are satisfied
  useEffect(() => {
    if (loading || !thesis) return;

    const hasSupDecree = decrees.some((d) => d.decree_type === 'sk_pembimbing');
    const hasExDecree = decrees.some((d) => d.decree_type === 'sk_penguji');

    const runBootstrap = async () => {
      if (supervisorDecreeEligible && !hasSupDecree) {
        const key = `${thesis.id}:sk_pembimbing`;
        if (!bootstrappedRef.current[key]) {
          bootstrappedRef.current[key] = true;
          setGeneratingDecreeType('sk_pembimbing');
          const created = await ensureInitialDecreeIfEligible({
            thesisId: thesis.id,
            decreeType: 'sk_pembimbing',
            actorProfileId: profile?.id || null,
            isAdminAction: false,
          });
          setGeneratingDecreeType(null);
          if (created) {
            setDecrees((prev) => [created, ...prev.filter((d) => d.id !== created.id)]);
          }
        }
      }

      if (examinerDecreeEligible && !hasExDecree) {
        const key = `${thesis.id}:sk_penguji`;
        if (!bootstrappedRef.current[key]) {
          bootstrappedRef.current[key] = true;
          setGeneratingDecreeType('sk_penguji');
          const created = await ensureInitialDecreeIfEligible({
            thesisId: thesis.id,
            decreeType: 'sk_penguji',
            actorProfileId: profile?.id || null,
            isAdminAction: false,
          });
          setGeneratingDecreeType(null);
          if (created) {
            setDecrees((prev) => [created, ...prev.filter((d) => d.id !== created.id)]);
          }
        }
      }
    };

    runBootstrap();
  }, [loading, thesis, decrees, supervisorDecreeEligible, examinerDecreeEligible, profile?.id]);

  const approvedChaptersCount = chapters.filter((c) => c.status === 'approved').length;
  const pendingRevisionsCount = chapters.filter((c) => c.status === 'needs_revision').length;
  const completedSessionsCount = sessions.filter((s) => s.status === 'completed').length;

  const overallProgress = useMemo(() => {
    if (!thesis) return 0;
    if (graduation?.status === 'graduated') return 100;
    if (chapters.length === 0) return thesis.status === 'approved' ? 15 : 5;
    const chapterAvg =
      chapters.reduce((acc, c) => acc + (c.progress_percent || 0), 0) / 5;
    return Math.min(100, Math.round(15 + chapterAvg * 0.65 + (seminar?.status === 'completed' ? 10 : 0) + (defense?.status === 'completed' ? 10 : 0)));
  }, [thesis, chapters, seminar, defense, graduation]);

  const upcomingSeminar = schedules.find(
    (s) => s.exam_type === 'seminar' && ['scheduled', 'rescheduled', 'ongoing'].includes(s.status)
  );
  const upcomingDefense = schedules.find(
    (s) => s.exam_type === 'defense' && ['scheduled', 'rescheduled', 'ongoing'].includes(s.status)
  );

  const steps = useMemo((): Array<{
    num: number;
    label: string;
    status: StepState;
    pageId: string;
  }> => {
    const titleStatus: StepState = !thesis
      ? 'not_started'
      : thesis.status === 'approved'
        ? 'approved'
        : thesis.status === 'rejected'
          ? 'rejected'
          : thesis.status === 'revision_required'
            ? 'needs_revision'
            : thesis.status === 'under_review'
              ? 'in_progress'
              : 'pending';

    const supStatus: StepState =
      supervisors.length > 0
        ? 'completed'
        : thesis?.status === 'approved'
          ? 'pending'
          : 'not_started';

    const guidStatus: StepState =
      approvedChaptersCount === 5
        ? 'completed'
        : pendingRevisionsCount > 0
          ? 'needs_revision'
          : sessions.length > 0 || chapters.some((c) => c.status !== 'not_started')
            ? 'in_progress'
            : supervisors.length > 0
              ? 'pending'
              : 'not_started';

    const semStatus: StepState = !seminar
      ? 'not_started'
      : seminar.status === 'completed'
        ? 'completed'
        : seminar.status === 'approved' || seminar.status === 'scheduled'
          ? 'approved'
          : seminar.status === 'rejected'
            ? 'rejected'
            : seminar.status === 'revision_required'
              ? 'needs_revision'
              : 'pending';

    const defRegStatus: StepState = !defense
      ? 'not_started'
      : defense.status === 'approved' || defense.status === 'scheduled' || defense.status === 'completed'
        ? 'approved'
        : defense.status === 'rejected'
          ? 'rejected'
          : defense.status === 'revision_required'
            ? 'needs_revision'
            : 'pending';

    const defExecStatus: StepState = upcomingDefense
      ? upcomingDefense.status === 'completed'
        ? 'completed'
        : 'in_progress'
      : schedules.some((s) => s.exam_type === 'defense' && s.status === 'completed')
        ? 'completed'
        : defense?.status === 'approved'
          ? 'pending'
          : 'not_started';

    const scoreStatus: StepState =
      scores.some((s) => s.is_finalized)
        ? 'completed'
        : scores.length > 0
          ? 'in_progress'
          : defExecStatus === 'completed'
            ? 'pending'
            : 'not_started';

    const plagStatus: StepState = !plagiarism
      ? 'not_started'
      : plagiarism.status === 'approved'
        ? 'approved'
        : plagiarism.status === 'rejected'
          ? 'rejected'
          : plagiarism.status === 'revision_required'
            ? 'needs_revision'
            : plagiarism.status === 'pending_verification'
              ? 'pending'
              : 'not_started';

    const gradStatus: StepState = !graduation
      ? 'not_started'
      : graduation.status === 'graduated'
        ? 'completed'
        : graduation.status === 'approved'
          ? 'approved'
          : graduation.status === 'revision_required'
            ? 'needs_revision'
            : graduation.status === 'submitted' || graduation.status === 'under_verification'
              ? 'in_progress'
              : 'not_started';

    return [
      { num: 1, label: 'Title Submission', status: titleStatus, pageId: 'title-submission' },
      { num: 2, label: 'Supervisor Assignment', status: supStatus, pageId: 'guidance' },
      { num: 3, label: 'Consultation & Guidance', status: guidStatus, pageId: 'guidance' },
      { num: 4, label: 'Proposal Seminar', status: semStatus, pageId: 'seminar' },
      { num: 5, label: 'Final Defense Registration', status: defRegStatus, pageId: 'defense' },
      { num: 6, label: 'Final Defense', status: defExecStatus, pageId: 'defense' },
      { num: 7, label: 'Final Assessment', status: scoreStatus, pageId: 'defense' },
      { num: 8, label: 'Plagiarism Verification', status: plagStatus, pageId: 'plagiarism' },
      { num: 9, label: 'Graduation / Yudisium', status: gradStatus, pageId: 'yudisium' },
    ];
  }, [thesis, supervisors, approvedChaptersCount, pendingRevisionsCount, sessions, chapters, seminar, defense, upcomingDefense, schedules, scores, plagiarism, graduation]);

  const chapterChartData = useMemo(() => {
    const defaults = [1, 2, 3, 4, 5].map((num) => {
      const found = chapters.find((c) => c.chapter_number === num);
      return {
        name: `Bab ${num}`,
        progress: found?.progress_percent || 0,
      };
    });
    return defaults;
  }, [chapters]);

  if (loading) {
    return <CardGridSkeleton count={4} />;
  }

  return (
    <div className="space-y-6">
      {/* Overview Header Card */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono">{profile?.nim_nip || 'NIM belum diatur'}</span>
              <span aria-hidden="true">·</span>
              <span>{profile?.program?.name || 'Program Studi'}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">Semester {profile?.semester || 7}</span>
              <span aria-hidden="true">·</span>
              <span>{activePeriod?.academic_year || '2026/2027'}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Selamat datang, {profile?.full_name}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-3xl">
              {thesis ? thesis.title : 'Anda belum mengajukan judul tugas akhir pada periode akademik ini.'}
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 dark:text-slate-400">Status TA:</span>
                <StatusBadge status={thesis?.status || 'not_started'} />
              </div>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">|</span>
              <div className="text-slate-600 dark:text-slate-300">
                <span className="text-slate-500 dark:text-slate-400">Pembimbing: </span>
                {supervisors.length > 0
                  ? supervisors.map((s) => s.lecturer?.full_name).filter(Boolean).join(', ')
                  : 'Belum ditetapkan'}
              </div>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">|</span>
              <div className="text-slate-600 dark:text-slate-300 tabular-nums">
                <span className="text-slate-500 dark:text-slate-400">Deadline Terdekat: </span>
                {upcomingDefense
                  ? `Sidang ${formatDate(upcomingDefense.exam_date)}`
                  : upcomingSeminar
                    ? `Seminar ${formatDate(upcomingSeminar.exam_date)}`
                    : activePeriod?.submission_close
                      ? `Batas Periode ${formatDate(activePeriod.submission_close)}`
                      : 'Tidak ada tenggat mendesak'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 pt-4 lg:pt-0 lg:pl-6">
            <div className="text-right">
              <p className="text-xs text-slate-500 dark:text-slate-400">Progres Keseluruhan</p>
              <p className="text-3xl font-bold font-mono tabular-nums text-blue-700 dark:text-cyan-400">
                {overallProgress}%
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate(thesis ? 'chapters' : 'title-submission')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white transition-colors whitespace-nowrap"
            >
              <span>{thesis ? 'Lanjutkan Progres' : 'Ajukan Judul TA'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 9-Step Progress Stepper */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Tahapan Tugas Akhir (9 Fase)</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Status diperbarui otomatis berdasarkan proses verifikasi akademik.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {steps.filter((s) => s.status === 'approved' || s.status === 'completed').length}/9 Selesai
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-9 gap-2.5">
          {steps.map((step) => {
            const isDone = step.status === 'approved' || step.status === 'completed';
            const isError = step.status === 'rejected';
            const isWarn = step.status === 'needs_revision';
            const isActive = step.status === 'in_progress' || step.status === 'pending';

            return (
              <button
                key={step.num}
                type="button"
                onClick={() => onNavigate(step.pageId)}
                className={cn(
                  'text-left p-3 rounded-lg border transition-colors flex flex-col justify-between gap-2',
                  isDone
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : isError
                      ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20'
                      : isWarn
                        ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20'
                        : isActive
                          ? 'border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400">
                    0{step.num}
                  </span>
                  {isDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : isError ? (
                    <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  ) : isWarn ? (
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100 leading-snug">
                    {step.label}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 capitalize">
                    {step.status.replace(/_/g, ' ')}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Total Bimbingan</span>
            <MessageSquareText className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums">{completedSessionsCount}</p>
          <p className="text-[11px] text-slate-500">
            {sessions.length} total pengajuan sesi
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Revisi Menunggu</span>
            <FileText className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums">{pendingRevisionsCount}</p>
          <p className="text-[11px] text-slate-500">Bab memerlukan perbaikan</p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Bab Disetujui</span>
            <BookOpen className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums">{approvedChaptersCount} / 5</p>
          <p className="text-[11px] text-slate-500">Bab 1 hingga Bab 5</p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Jadwal Ujian</span>
            {upcomingDefense ? <Award className="w-4 h-4 text-blue-600" /> : <Calendar className="w-4 h-4 text-blue-600" />}
          </div>
          <p className="text-sm font-semibold mt-1">
            {upcomingDefense
              ? `Sidang: ${formatDate(upcomingDefense.exam_date)}`
              : upcomingSeminar
                ? `Seminar: ${formatDate(upcomingSeminar.exam_date)}`
                : 'Belum Terjadwal'}
          </p>
          <p className="text-[11px] text-slate-500">
            {upcomingDefense?.room_name || upcomingSeminar?.room_name || 'Menunggu penjadwalan prodi'}
          </p>
        </div>
      </div>

      {/* Berkas Pendukung (SK Pembimbing & SK Penguji) */}
      <SupportingDecreesSection
        decrees={decrees}
        supervisorEligible={supervisorDecreeEligible}
        examinerEligible={examinerDecreeEligible}
        generatingType={generatingDecreeType}
      />

      {/* Chart + Recent Notifications & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Progres Penyelesaian Per Bab</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Persentase progres penulisan Bab 1 sampai Bab 5
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('chapters')}
              className="text-xs font-medium text-blue-700 dark:text-cyan-400 hover:underline"
            >
              Kelola Bab
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chapterChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                <Tooltip
                  formatter={(value) => [`${value}%`, 'Progres']}
                  contentStyle={{ fontSize: '12px', borderRadius: '8px' }}
                />
                <Bar dataKey="progress" fill="#1d4ed8" radius={[6, 6, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Aktivitas & Notifikasi Terbaru</h3>
            <button
              type="button"
              onClick={() => onNavigate('notifications')}
              className="text-xs font-medium text-blue-700 dark:text-cyan-400 hover:underline"
            >
              Semua Notifikasi
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.length === 0 && activities.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                Belum ada aktivitas tercatat pada akun Anda.
              </p>
            ) : (
              <>
                {notifications.slice(0, 3).map((n) => (
                  <div key={n.id} className="py-2.5">
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100">{n.title}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">{n.message}</p>
                    <p className="text-[10px] font-mono text-slate-400 mt-0.5">{formatDateTime(n.created_at)}</p>
                  </div>
                ))}
                {activities.slice(0, 4).map((a) => (
                  <div key={a.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium capitalize truncate">
                        {a.action.replace(/_/g, ' ')}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">{a.entity}</p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {formatDateTime(a.created_at)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
