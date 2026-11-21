import { useCallback, useEffect, useState } from 'react';
import { BookCheck, CalendarClock, ClipboardCheck, MessageSquareText, Users } from 'lucide-react';
import { CardGridSkeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import type { ExaminerAssignment, SupervisionSession, ThesisSupervisor } from '../../types/database';

export function LecturerDashboard({ onNavigate }: { onNavigate: (pageId: string) => void }) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [supervisees, setSupervisees] = useState<ThesisSupervisor[]>([]);
  const [sessions, setSessions] = useState<SupervisionSession[]>([]);
  const [exams, setExams] = useState<Array<ExaminerAssignment & { schedule?: { exam_date: string; start_time: string; room_name: string; exam_type: string; status: string }; thesis?: { title: string; student?: { full_name: string; nim_nip: string } } }>>([]);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const [{ data: supData }, { data: sessData }, { data: exData }] = await Promise.all([
      supabase
        .from('thesis_supervisors')
        .select('*, student:profiles!thesis_supervisors_student_id_fkey(*), thesis:thesis_submissions(*)')
        .eq('lecturer_id', profile.id)
        .eq('status', 'active'),
      supabase
        .from('supervision_sessions')
        .select('*, student:profiles!supervision_sessions_student_id_fkey(*)')
        .eq('lecturer_id', profile.id)
        .order('scheduled_date', { ascending: true }),
      supabase
        .from('examiner_assignments')
        .select('*, schedule:exam_schedules(*), thesis:thesis_submissions(title, student:profiles!thesis_submissions_student_id_fkey(full_name, nim_nip))')
        .eq('lecturer_id', profile.id),
    ]);

    setSupervisees((supData || []) as ThesisSupervisor[]);
    setSessions((sessData || []) as SupervisionSession[]);
    setExams((exData || []) as typeof exams);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return <CardGridSkeleton count={4} />;

  const pendingSessions = sessions.filter((s) => s.status === 'requested');
  const upcomingExams = exams.filter((e) => e.schedule && ['scheduled', 'rescheduled'].includes(e.schedule.status));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">
          Dashboard Dosen — {profile?.full_name}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Ringkasan mahasiswa bimbingan, jadwal konsultasi, review bab, dan jadwal pengujian Anda.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('supervisees')}
          className="text-left p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 transition-colors space-y-1"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Mahasiswa Bimbingan</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums">
            {supervisees.length} / {profile?.max_supervisee_quota || 10}
          </p>
          <p className="text-[11px] text-slate-500">Kuota bimbingan aktif</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('guidance-management')}
          className="text-left p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 transition-colors space-y-1"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Permintaan Bimbingan</span>
            <MessageSquareText className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums">{pendingSessions.length}</p>
          <p className="text-[11px] text-slate-500">Menunggu persetujuan jadwal</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('chapter-review')}
          className="text-left p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 transition-colors space-y-1"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Review Bab & Dokumen</span>
            <BookCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums">{supervisees.length}</p>
          <p className="text-[11px] text-slate-500">Naskah bimbingan aktif</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('examiner-schedule')}
          className="text-left p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 transition-colors space-y-1"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Jadwal Pengujian</span>
            <ClipboardCheck className="w-4 h-4 text-cyan-600" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums">{upcomingExams.length}</p>
          <p className="text-[11px] text-slate-500">Seminar & sidang terjadwal</p>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Permintaan Bimbingan Terbaru</h2>
            <button
              type="button"
              onClick={() => onNavigate('guidance-management')}
              className="text-xs text-blue-700 dark:text-cyan-400 hover:underline"
            >
              Kelola Semua
            </button>
          </div>
          {sessions.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">Belum ada sesi bimbingan.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {sessions.slice(0, 5).map((s) => (
                <div key={s.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{s.student?.full_name} — Bab {s.chapter_number}</p>
                    <p className="text-slate-500 truncate">{s.topic}</p>
                    <p className="text-[11px] font-mono text-slate-400">
                      {formatDate(s.scheduled_date)} · {s.scheduled_time.slice(0, 5)}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Jadwal Pengujian Mendatang</h2>
            <button
              type="button"
              onClick={() => onNavigate('examiner-schedule')}
              className="text-xs text-blue-700 dark:text-cyan-400 hover:underline"
            >
              Buka Penilaian
            </button>
          </div>
          {upcomingExams.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">Belum ada jadwal ujian.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {upcomingExams.slice(0, 5).map((ex) => (
                <div key={ex.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {ex.thesis?.student?.full_name} ({ex.schedule?.exam_type === 'seminar' ? 'Seminar' : 'Sidang'})
                    </p>
                    <p className="text-slate-500 truncate">{ex.thesis?.title}</p>
                    <p className="text-[11px] font-mono text-slate-400 flex items-center gap-1 mt-0.5">
                      <CalendarClock className="w-3 h-3" />
                      {formatDate(ex.schedule?.exam_date)} · {ex.schedule?.start_time.slice(0, 5)} · {ex.schedule?.room_name}
                    </p>
                  </div>
                  <span className="text-[11px] font-medium capitalize text-blue-700 dark:text-cyan-400 shrink-0">
                    {ex.examiner_role.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
