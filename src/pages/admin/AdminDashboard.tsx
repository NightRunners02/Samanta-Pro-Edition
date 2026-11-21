import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  GraduationCap,
  PieChart,
  UserCheck,
  Users,
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
import { CardGridSkeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type {
  ExamSchedule,
  GraduationRecord,
  Profile,
  Program,
  SeminarRegistration,
  ThesisSubmission,
  ThesisSupervisor,
} from '../../types/database';

export function AdminDashboard({ onNavigate }: { onNavigate: (pageId: string) => void }) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [submissions, setSubmissions] = useState<ThesisSubmission[]>([]);
  const [supervisors, setSupervisors] = useState<ThesisSupervisor[]>([]);
  const [seminars, setSeminars] = useState<SeminarRegistration[]>([]);
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [graduations, setGraduations] = useState<GraduationRecord[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const isScopedProdi = profile?.role_code === 'program_admin' && profile?.program_id;

    const [
      { data: pData },
      { data: subData },
      { data: supData },
      { data: semData },
      { data: schedData },
      { data: gradData },
      { data: progData },
    ] = await Promise.all([
      supabase.from('profiles').select('*'),
      isScopedProdi
        ? supabase.from('thesis_submissions').select('*').eq('program_id', profile!.program_id!)
        : supabase.from('thesis_submissions').select('*'),
      supabase.from('thesis_supervisors').select('*').eq('status', 'active'),
      supabase.from('seminar_registrations').select('*'),
      supabase.from('exam_schedules').select('*'),
      supabase.from('graduation_records').select('*'),
      supabase.from('programs').select('*'),
    ]);

    setProfiles((pData || []) as Profile[]);
    setSubmissions((subData || []) as ThesisSubmission[]);
    setSupervisors((supData || []) as ThesisSupervisor[]);
    setSeminars((semData || []) as SeminarRegistration[]);
    setSchedules((schedData || []) as ExamSchedule[]);
    setGraduations((gradData || []) as GraduationRecord[]);
    setPrograms((progData || []) as Program[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const students = profiles.filter((p) => p.role_code === 'student');
  const lecturers = profiles.filter((p) => ['supervisor', 'examiner'].includes(p.role_code));
  const pendingSubs = submissions.filter((s) => ['submitted', 'under_review'].includes(s.status));
  const approvedSubs = submissions.filter((s) => s.status === 'approved');
  const supervisedStudentIds = new Set(supervisors.map((s) => s.student_id));
  const scheduledDefenses = schedules.filter((s) => s.exam_type === 'defense' && s.status !== 'cancelled');
  const completedTheses = submissions.filter((s) => s.current_stage === 'completed');
  const graduatedCount = graduations.filter((g) => g.status === 'graduated').length;

  const monthlyData = useMemo(() => {
    const map = new Map<string, number>();
    for (const sub of submissions) {
      const d = new Date(sub.created_at);
      const label = d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
      map.set(label, (map.get(label) || 0) + 1);
    }
    return Array.from(map.entries()).map(([month, total]) => ({ month, total }));
  }, [submissions]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {
      Draft: 0,
      Submitted: 0,
      'Under Review': 0,
      Approved: 0,
      Revision: 0,
      Rejected: 0,
    };
    for (const s of submissions) {
      if (s.status === 'draft') counts.Draft++;
      else if (s.status === 'submitted') counts.Submitted++;
      else if (s.status === 'under_review') counts['Under Review']++;
      else if (s.status === 'approved') counts.Approved++;
      else if (s.status === 'revision_required') counts.Revision++;
      else if (s.status === 'rejected') counts.Rejected++;
    }
    return Object.entries(counts).map(([status, jumlah]) => ({ status, jumlah }));
  }, [submissions]);

  const programData = useMemo(() => {
    return programs.map((p) => {
      const pSubs = submissions.filter((s) => s.program_id === p.id);
      const pDone = pSubs.filter((s) => s.current_stage === 'completed').length;
      return {
        name: p.code,
        pengajuan: pSubs.length,
        selesai: pDone,
      };
    });
  }, [programs, submissions]);

  if (loading) return <CardGridSkeleton count={8} />;

  const kpis = [
    { label: 'Total Mahasiswa', value: students.length, icon: Users, page: 'students' },
    { label: 'Total Dosen', value: lecturers.length, icon: UserCheck, page: 'lecturers' },
    { label: 'Total Pengajuan TA', value: submissions.length, icon: FileText, page: 'submissions' },
    { label: 'Pengajuan Pending', value: pendingSubs.length, icon: Clock, page: 'submissions' },
    { label: 'Judul Approved', value: approvedSubs.length, icon: CheckCircle2, page: 'submissions' },
    { label: 'Mahasiswa Bimbingan', value: supervisedStudentIds.size, icon: Users, page: 'supervisors' },
    { label: 'Seminar Proposal', value: seminars.length, icon: Calendar, page: 'admin-seminar' },
    { label: 'Sidang Terjadwal', value: scheduledDefenses.length, icon: Award, page: 'exam-scheduling' },
    { label: 'TA Selesai', value: completedTheses.length, icon: FileCheck2, page: 'reports' },
    { label: 'Yudisium / Lulus', value: graduatedCount, icon: GraduationCap, page: 'admin-yudisium' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Dashboard Administrator TAFlow</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Ringkasan metrik akademik, progres pengajuan tugas akhir, jadwal sidang, dan performa program studi.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('students')}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            + Tambah Mahasiswa
          </button>
          <button
            type="button"
            onClick={() => onNavigate('submissions')}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Review Pengajuan
          </button>
          <button
            type="button"
            onClick={() => onNavigate('exam-scheduling')}
            className="px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
          >
            Buat Jadwal Sidang
          </button>
        </div>
      </div>

      {/* 10 Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <button
              key={k.label}
              type="button"
              onClick={() => onNavigate(k.page)}
              className="text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-500 transition-colors space-y-1.5"
            >
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="truncate">{k.label}</span>
                <Icon className="w-4 h-4 text-blue-600 dark:text-cyan-400 shrink-0" />
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {k.value}
              </p>
            </button>
          );
        })}
      </div>

      {/* Quick Actions Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Aksi Cepat Operasional</span>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { label: 'Tambah Dosen', page: 'lecturers' },
            { label: 'Assign Supervisor', page: 'supervisors' },
            { label: 'Verifikasi Dokumen', page: 'document-verification' },
            { label: 'Verifikasi Plagiasi', page: 'admin-plagiarism' },
            { label: 'Laporan Akademik', page: 'reports' },
          ].map((qa) => (
            <button
              key={qa.page}
              type="button"
              onClick={() => onNavigate(qa.page)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <span>{qa.label}</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          ))}
        </div>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Distribusi Status Pengajuan TA</h2>
              <p className="text-xs text-slate-500">Rekap status seluruh pengajuan judul</p>
            </div>
            <PieChart className="w-4 h-4 text-slate-400" />
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                <Bar dataKey="jumlah" fill="#1d4ed8" radius={[6, 6, 0, 0]} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Performa & Pengajuan Per Program Studi</h2>
            <p className="text-xs text-slate-500">Perbandingan total pengajuan vs tugas akhir selesai</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={programData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                <Bar dataKey="pengajuan" name="Pengajuan" fill="#0891b2" radius={[6, 6, 0, 0]} maxBarSize={32} />
                <Bar dataKey="selesai" name="Selesai" fill="#16a34a" radius={[6, 6, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Tren Pengajuan Tugas Akhir Per Bulan</h2>
            <p className="text-xs text-slate-500">Volume pengajuan judul baru berdasarkan waktu</p>
          </div>
          {monthlyData.length === 0 ? (
            <p className="py-12 text-center text-xs text-slate-500">
              Belum ada data pengajuan bulanan untuk ditampilkan pada grafik.
            </p>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                  <Bar dataKey="total" name="Pengajuan" fill="#1d4ed8" radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
