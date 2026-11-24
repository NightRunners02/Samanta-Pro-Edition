import type { ReportSummaryStat, ReportType } from './academicReportPdf';
import { formatLecturerAcademicName } from './decreeService';
import { supabase } from './supabase';
import { formatDate, formatDateTime, getLetterGrade } from './utils';
import type {
  DefenseRegistration,
  ExamSchedule,
  ExaminerAssignment,
  ExamScore,
  GraduationRecord,
  PlagiarismCheck,
  Profile,
  Program,
  SeminarRegistration,
  SupervisionSession,
  ThesisProgress,
  ThesisSubmission,
  ThesisSupervisor,
} from '../types/database';

export interface ReportFilterParams {
  reportType: ReportType;
  programFilter: string;
  periodFilter: string;
  statusFilter: string;
  dateFrom: string;
  dateTo: string;
}

export interface AcademicReportDataset {
  rows: Array<Record<string, string | number>>;
  stats: ReportSummaryStat[];
  title: string;
  subtitle: string;
  availableStatuses: string[];
}

function formatStageLabel(stage?: string | null): string {
  switch (stage) {
    case 'title_submission':
      return 'Pengajuan Judul';
    case 'supervisor_assignment':
      return 'Penetapan Pembimbing';
    case 'consultation':
      return 'Bimbingan & Progres';
    case 'proposal_seminar':
      return 'Seminar Proposal';
    case 'defense_registration':
      return 'Pendaftaran Sidang';
    case 'final_defense':
      return 'Sidang Akhir';
    case 'final_assessment':
      return 'Penilaian Akhir';
    case 'plagiarism_verification':
      return 'Verifikasi Plagiasi';
    case 'yudisium':
      return 'Yudisium';
    case 'completed':
      return 'Selesai / Lulus';
    default:
      return stage ? stage.replace(/_/g, ' ') : '—';
  }
}

function formatStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const REPORT_TITLES: Record<ReportType, { title: string; subtitle: string }> = {
  submissions: {
    title: 'Laporan Pengajuan Judul Tugas Akhir',
    subtitle: 'Rekapitulasi pengajuan judul tugas akhir mahasiswa, status verifikasi prodi, dan catatan peninjauan.',
  },
  supervisees: {
    title: 'Laporan Mahasiswa Bimbingan',
    subtitle: 'Distribusi dosen pembimbing aktif, mahasiswa bimbingan, jumlah sesi bimbingan, dan status pembimbingan.',
  },
  progress: {
    title: 'Laporan Progres Tugas Akhir',
    subtitle: 'Pemantauan tahapan pengerjaan, persentase penyelesaian Bab 1–5, dan pembaruan progres terkini.',
  },
  seminars: {
    title: 'Laporan Seminar Proposal',
    subtitle: 'Rekap pendaftaran seminar proposal, pembimbing, dewan penguji, jadwal pelaksanaan, dan status seminar.',
  },
  defenses: {
    title: 'Laporan Sidang Akhir Tugas Akhir',
    subtitle: 'Rekap pendaftaran sidang akhir, pembimbing, dewan penguji, jadwal sidang, dan status pelaksanaan.',
  },
  scores: {
    title: 'Laporan Nilai Sidang Tugas Akhir',
    subtitle: 'Rincian komponen penilaian penguji, nilai akhir terbobot, huruf mutu, dan status finalisasi nilai.',
  },
  plagiarism: {
    title: 'Laporan Pemeriksaan Plagiasi',
    subtitle: 'Hasil uji kemiripan dokumen tugas akhir mahasiswa terhadap ambang batas maksimum program studi.',
  },
  yudisium: {
    title: 'Laporan Pengajuan Yudisium',
    subtitle: 'Rekapitulasi kelengkapan berkas persyaratan yudisium, nilai akhir, status verifikasi, dan tanggal yudisium.',
  },
  graduations: {
    title: 'Laporan Kelulusan Tugas Akhir',
    subtitle: 'Daftar mahasiswa yang telah dinyatakan lulus yudisium beserta judul TA, predikat nilai, dan tanggal penyelesaian.',
  },
  delayed: {
    title: 'Laporan Mahasiswa Terlambat (> 180 Hari)',
    subtitle: 'Identifikasi mahasiswa dengan durasi pengerjaan TA melewati batas 180 hari untuk tindak lanjut pembinaan akademik.',
  },
};

export async function fetchAcademicReportData(
  params: ReportFilterParams
): Promise<AcademicReportDataset> {
  const { reportType, programFilter, periodFilter, statusFilter, dateFrom, dateTo } = params;
  let rows: Array<Record<string, string | number>> = [];
  let stats: ReportSummaryStat[] = [];
  const availableStatusesSet = new Set<string>();

  const applyDateRange = (list: Array<Record<string, string | number>>) => {
    if (!dateFrom && !dateTo) return list;
    return list.filter((r) => {
      const raw = r._rawDate;
      if (!raw) return true;
      const dt = new Date(String(raw)).getTime();
      if (Number.isNaN(dt)) return true;
      if (dateFrom && dt < new Date(dateFrom).getTime()) return false;
      if (dateTo && dt > new Date(dateTo).getTime() + 86400000) return false;
      return true;
    });
  };

  if (reportType === 'submissions') {
    const { data } = await supabase
      .from('thesis_submissions')
      .select(
        '*, student:profiles!thesis_submissions_student_id_fkey(*), program:programs(*)'
      )
      .order('created_at', { ascending: false });

    const base = ((data || []) as Array<ThesisSubmission & { student?: Profile; program?: Program }>)
      .filter((d) => (programFilter === 'all' ? true : d.program_id === programFilter))
      .filter((d) => (periodFilter === 'all' ? true : d.period_id === periodFilter));

    base.forEach((d) => availableStatusesSet.add(d.status));

    rows = applyDateRange(
      base
        .filter((d) => (statusFilter === 'all' ? true : d.status === statusFilter))
        .map((d) => ({
          id: d.id,
          NIM: d.student?.nim_nip || '—',
          Nama_Mahasiswa: d.student?.full_name || '—',
          Prodi: d.program?.name || '—',
          Judul_TA: d.title,
          Tanggal_Pengajuan: formatDate(d.submitted_at || d.created_at),
          Status_Persetujuan: formatStatusLabel(d.status),
          Catatan_Admin: d.reviewer_notes?.trim() || '—',
          _rawStatus: d.status,
          _rawDate: d.submitted_at || d.created_at,
        }))
    );

    const approvedCount = rows.filter((r) => r._rawStatus === 'approved').length;
    const reviewCount = rows.filter((r) => ['submitted', 'under_review'].includes(String(r._rawStatus))).length;
    const revRejectCount = rows.filter((r) => ['revision_required', 'rejected'].includes(String(r._rawStatus))).length;

    stats = [
      { label: 'Total Pengajuan', value: String(rows.length), hint: 'Sesuai filter aktif', accent: 'blue' },
      { label: 'Disetujui', value: String(approvedCount), hint: 'Judul berstatus Approved', accent: 'emerald' },
      { label: 'Menunggu / Review', value: String(reviewCount), hint: 'Submitted & Under Review', accent: 'cyan' },
      { label: 'Revisi / Ditolak', value: String(revRejectCount), hint: 'Perlu perbaikan atau ditolak', accent: 'amber' },
    ];
  } else if (reportType === 'supervisees') {
    const [{ data: supData }, { data: sessData }] = await Promise.all([
      supabase
        .from('thesis_supervisors')
        .select(
          '*, student:profiles!thesis_supervisors_student_id_fkey(*), lecturer:profiles!thesis_supervisors_lecturer_id_fkey(*), thesis:thesis_submissions(id, title, program_id, period_id, current_stage, status)'
        )
        .eq('status', 'active')
        .order('assigned_at', { ascending: false }),
      supabase.from('supervision_sessions').select('thesis_id, lecturer_id, status'),
    ]);

    const sessions = (sessData || []) as Array<Pick<SupervisionSession, 'thesis_id' | 'lecturer_id' | 'status'>>;
    const base = ((supData || []) as ThesisSupervisor[])
      .filter((d) => (programFilter === 'all' ? true : d.thesis?.program_id === programFilter))
      .filter((d) => (periodFilter === 'all' ? true : d.thesis?.period_id === periodFilter));

    base.forEach((d) => {
      if (d.thesis?.status) availableStatusesSet.add(d.thesis.status);
    });

    rows = applyDateRange(
      base
        .filter((d) => (statusFilter === 'all' ? true : d.thesis?.status === statusFilter))
        .map((d) => {
          const matchingSess = sessions.filter(
            (s) => s.thesis_id === d.thesis_id && s.lecturer_id === d.lecturer_id
          );
          const completedSess = matchingSess.filter((s) => s.status === 'completed').length;
          const stageLabel = formatStageLabel(d.thesis?.current_stage);
          return {
            id: d.id,
            Dosen_Pembimbing: formatLecturerAcademicName(d.lecturer),
            Peran: d.supervisor_role === 'primary' ? 'Pembimbing 1' : 'Pembimbing 2',
            NIM: d.student?.nim_nip || '—',
            Mahasiswa_Bimbingan: d.student?.full_name || '—',
            Judul_TA: d.thesis?.title || '—',
            Jumlah_Bimbingan: `${completedSess}/${matchingSess.length}`,
            Status_Bimbingan: stageLabel,
            _lecturerId: d.lecturer_id,
            _studentId: d.student_id,
            _completedSess: completedSess,
            _rawDate: d.assigned_at,
          };
        })
    );

    const uniqueLecturers = new Set(rows.map((r) => String(r._lecturerId))).size;
    const uniqueStudents = new Set(rows.map((r) => String(r._studentId))).size;
    const totalCompletedSessions = rows.reduce((acc, r) => acc + Number(r._completedSess || 0), 0);

    stats = [
      { label: 'Total Penugasan', value: String(rows.length), hint: 'Slot pembimbingan aktif', accent: 'blue' },
      { label: 'Dosen Pembimbing', value: String(uniqueLecturers), hint: 'Dosen aktif membimbing', accent: 'cyan' },
      { label: 'Mahasiswa Bimbingan', value: String(uniqueStudents), hint: 'Mahasiswa unik terbimbing', accent: 'emerald' },
      { label: 'Sesi Selesai', value: String(totalCompletedSessions), hint: 'Total bimbingan completed', accent: 'amber' },
    ];
  } else if (reportType === 'progress') {
    const [{ data: thData }, { data: progData }] = await Promise.all([
      supabase
        .from('thesis_submissions')
        .select('*, student:profiles!thesis_submissions_student_id_fkey(*), program:programs(*)')
        .order('updated_at', { ascending: false }),
      supabase.from('thesis_progress').select('*'),
    ]);

    const progressRows = (progData || []) as ThesisProgress[];
    const base = ((thData || []) as Array<ThesisSubmission & { student?: Profile; program?: Program }>)
      .filter((d) => (programFilter === 'all' ? true : d.program_id === programFilter))
      .filter((d) => (periodFilter === 'all' ? true : d.period_id === periodFilter));

    base.forEach((d) => availableStatusesSet.add(d.status));

    rows = applyDateRange(
      base
        .filter((d) => (statusFilter === 'all' ? true : d.status === statusFilter))
        .map((d) => {
          const chaps = progressRows.filter((p) => p.thesis_id === d.id);
          const avgPct =
            chaps.length > 0
              ? Math.round(chaps.reduce((s, c) => s + (c.progress_percent || 0), 0) / 5)
              : 0;
          const approvedCount = chaps.filter((c) => c.status === 'approved').length;
          const latestChapUpdate = chaps.reduce(
            (latest, c) => (c.updated_at > latest ? c.updated_at : latest),
            d.updated_at
          );
          return {
            id: d.id,
            NIM: d.student?.nim_nip || '—',
            Nama_Mahasiswa: d.student?.full_name || '—',
            Judul_TA: d.title,
            Tahapan_Pengerjaan: `${formatStageLabel(d.current_stage)} (${approvedCount}/5 Bab)`,
            Progres: `${avgPct}%`,
            Status: formatStatusLabel(d.status),
            Tanggal_Pembaruan: formatDateTime(latestChapUpdate),
            _avgPct: avgPct,
            _approvedCount: approvedCount,
            _rawDate: latestChapUpdate,
          };
        })
    );

    const avgAll =
      rows.length > 0
        ? Math.round(rows.reduce((s, r) => s + Number(r._avgPct || 0), 0) / rows.length)
        : 0;
    const bab13Done = rows.filter((r) => Number(r._approvedCount || 0) >= 3).length;
    const bab15Done = rows.filter((r) => Number(r._approvedCount || 0) === 5).length;

    stats = [
      { label: 'Total Mahasiswa TA', value: String(rows.length), hint: 'Data tugas akhir tercatat', accent: 'blue' },
      { label: 'Rata-Rata Progres', value: `${avgAll}%`, hint: 'Akumulasi Bab 1 sampai Bab 5', accent: 'cyan' },
      { label: 'Lulus Bab 1–3', value: String(bab13Done), hint: 'Siap Seminar Proposal', accent: 'amber' },
      { label: 'Selesai Bab 1–5', value: String(bab15Done), hint: 'Seluruh bab disetujui', accent: 'emerald' },
    ];
  } else if (reportType === 'seminars') {
    const [{ data: semData }, { data: supData }, { data: schedData }] = await Promise.all([
      supabase
        .from('seminar_registrations')
        .select('*, student:profiles!seminar_registrations_student_id_fkey(*), thesis:thesis_submissions(id, title, program_id, period_id)')
        .order('created_at', { ascending: false }),
      supabase
        .from('thesis_supervisors')
        .select('*, lecturer:profiles!thesis_supervisors_lecturer_id_fkey(*)')
        .eq('status', 'active'),
      supabase
        .from('exam_schedules')
        .select('*, examiners:examiner_assignments(*, lecturer:profiles!examiner_assignments_lecturer_id_fkey(*))')
        .eq('exam_type', 'seminar')
        .neq('status', 'cancelled'),
    ]);

    const sups = (supData || []) as ThesisSupervisor[];
    const scheds = (schedData || []) as Array<ExamSchedule & { examiners?: ExaminerAssignment[] }>;

    const base = ((semData || []) as SeminarRegistration[])
      .filter((d) => (programFilter === 'all' ? true : d.thesis?.program_id === programFilter))
      .filter((d) => (periodFilter === 'all' ? true : (d.period_id || d.thesis?.period_id) === periodFilter));

    base.forEach((d) => availableStatusesSet.add(d.status));

    rows = applyDateRange(
      base
        .filter((d) => (statusFilter === 'all' ? true : d.status === statusFilter))
        .map((d) => {
          const thesisSups = sups
            .filter((s) => s.thesis_id === d.thesis_id)
            .sort((a, b) => a.supervisor_role.localeCompare(b.supervisor_role))
            .map((s) => formatLecturerAcademicName(s.lecturer));
          const sched = scheds.find((s) => s.thesis_id === d.thesis_id);
          const examiners = (sched?.examiners || []).map((e) => formatLecturerAcademicName(e.lecturer));
          const schedText = sched
            ? `${formatDate(sched.exam_date)}, ${sched.start_time.slice(0, 5)}–${sched.end_time.slice(0, 5)} (${sched.room_name})`
            : 'Belum Dijadwalkan';
          const effectiveStatus = sched?.status === 'completed' ? 'Completed' : formatStatusLabel(d.status);
          return {
            id: d.id,
            NIM: d.student?.nim_nip || '—',
            Mahasiswa: d.student?.full_name || '—',
            Judul_TA: d.thesis?.title || '—',
            Dosen_Pembimbing: thesisSups.length > 0 ? thesisSups.join('; ') : 'Belum Ditetapkan',
            Dosen_Penguji: examiners.length > 0 ? examiners.join('; ') : 'Belum Ditetapkan',
            Jadwal_Seminar: schedText,
            Status_Seminar: effectiveStatus,
            _rawStatus: sched?.status === 'completed' ? 'completed' : d.status,
            _rawDate: d.submitted_at || d.created_at,
          };
        })
    );

    const scheduledOrApproved = rows.filter((r) => ['approved', 'scheduled'].includes(String(r._rawStatus))).length;
    const completed = rows.filter((r) => r._rawStatus === 'completed').length;
    const pending = rows.filter((r) => ['draft', 'submitted', 'verification', 'revision_required'].includes(String(r._rawStatus))).length;

    stats = [
      { label: 'Total Pendaftar', value: String(rows.length), hint: 'Pendaftaran seminar proposal', accent: 'blue' },
      { label: 'Terjadwal / Approved', value: String(scheduledOrApproved), hint: 'Siap atau sudah terjadwal', accent: 'cyan' },
      { label: 'Selesai Seminar', value: String(completed), hint: 'Seminar telah terlaksana', accent: 'emerald' },
      { label: 'Menunggu / Revisi', value: String(pending), hint: 'Proses verifikasi atau revisi', accent: 'amber' },
    ];
  } else if (reportType === 'defenses') {
    const [{ data: defData }, { data: supData }, { data: schedData }] = await Promise.all([
      supabase
        .from('defense_registrations')
        .select('*, student:profiles!defense_registrations_student_id_fkey(*), thesis:thesis_submissions(id, title, program_id, period_id)')
        .order('created_at', { ascending: false }),
      supabase
        .from('thesis_supervisors')
        .select('*, lecturer:profiles!thesis_supervisors_lecturer_id_fkey(*)')
        .eq('status', 'active'),
      supabase
        .from('exam_schedules')
        .select('*, examiners:examiner_assignments(*, lecturer:profiles!examiner_assignments_lecturer_id_fkey(*))')
        .eq('exam_type', 'defense')
        .neq('status', 'cancelled'),
    ]);

    const sups = (supData || []) as ThesisSupervisor[];
    const scheds = (schedData || []) as Array<ExamSchedule & { examiners?: ExaminerAssignment[] }>;

    const base = ((defData || []) as DefenseRegistration[])
      .filter((d) => (programFilter === 'all' ? true : d.thesis?.program_id === programFilter))
      .filter((d) => (periodFilter === 'all' ? true : (d.period_id || d.thesis?.period_id) === periodFilter));

    base.forEach((d) => availableStatusesSet.add(d.status));

    rows = applyDateRange(
      base
        .filter((d) => (statusFilter === 'all' ? true : d.status === statusFilter))
        .map((d) => {
          const thesisSups = sups
            .filter((s) => s.thesis_id === d.thesis_id)
            .sort((a, b) => a.supervisor_role.localeCompare(b.supervisor_role))
            .map((s) => formatLecturerAcademicName(s.lecturer));
          const sched = scheds.find((s) => s.thesis_id === d.thesis_id);
          const examiners = (sched?.examiners || []).map((e) => formatLecturerAcademicName(e.lecturer));
          const schedText = sched
            ? `${formatDate(sched.exam_date)}, ${sched.start_time.slice(0, 5)}–${sched.end_time.slice(0, 5)} (${sched.room_name})`
            : 'Belum Dijadwalkan';
          const effectiveStatus = sched?.status === 'completed' ? 'Completed' : formatStatusLabel(d.status);
          return {
            id: d.id,
            NIM: d.student?.nim_nip || '—',
            Mahasiswa: d.student?.full_name || '—',
            Judul_TA: d.thesis?.title || '—',
            Dosen_Pembimbing: thesisSups.length > 0 ? thesisSups.join('; ') : 'Belum Ditetapkan',
            Dosen_Penguji: examiners.length > 0 ? examiners.join('; ') : 'Belum Ditetapkan',
            Jadwal_Sidang: schedText,
            Status_Pelaksanaan: effectiveStatus,
            _rawStatus: sched?.status === 'completed' ? 'completed' : d.status,
            _rawDate: d.submitted_at || d.created_at,
          };
        })
    );

    const scheduledOrApproved = rows.filter((r) => ['approved', 'scheduled'].includes(String(r._rawStatus))).length;
    const completed = rows.filter((r) => r._rawStatus === 'completed').length;
    const pending = rows.filter((r) => ['draft', 'submitted', 'verification', 'revision_required'].includes(String(r._rawStatus))).length;

    stats = [
      { label: 'Total Pendaftar', value: String(rows.length), hint: 'Pendaftaran sidang akhir', accent: 'blue' },
      { label: 'Terjadwal / Approved', value: String(scheduledOrApproved), hint: 'Siap atau sedang dijadwalkan', accent: 'cyan' },
      { label: 'Selesai Sidang', value: String(completed), hint: 'Sidang telah dilaksanakan', accent: 'emerald' },
      { label: 'Menunggu / Revisi', value: String(pending), hint: 'Proses verifikasi atau revisi', accent: 'amber' },
    ];
  } else if (reportType === 'scores') {
    const { data } = await supabase
      .from('exam_scores')
      .select(
        '*, examiner:profiles!exam_scores_examiner_id_fkey(*), thesis:thesis_submissions(title, program_id, period_id, student:profiles!thesis_submissions_student_id_fkey(*))'
      )
      .order('created_at', { ascending: false });

    const base = ((data || []) as Array<ExamScore & { thesis?: ThesisSubmission & { student?: Profile } }>)
      .filter((d) => (programFilter === 'all' ? true : d.thesis?.program_id === programFilter))
      .filter((d) => (periodFilter === 'all' ? true : d.thesis?.period_id === periodFilter));

    availableStatusesSet.add('finalized');
    availableStatusesSet.add('draft');

    rows = applyDateRange(
      base
        .filter((d) => {
          if (statusFilter === 'all') return true;
          if (statusFilter === 'finalized') return d.is_finalized;
          if (statusFilter === 'draft') return !d.is_finalized;
          return true;
        })
        .map((d) => {
          const comp = `Pres:${d.presentation_score} | Sub:${d.substance_score} | Met:${d.methodology_score} | Has:${d.results_score} | Peng:${d.mastery_score} | Rev:${d.revision_score}`;
          const total = Number(d.weighted_total || 0);
          return {
            id: d.id,
            NIM: d.thesis?.student?.nim_nip || '—',
            Mahasiswa: d.thesis?.student?.full_name || '—',
            Penguji: formatLecturerAcademicName(d.examiner),
            Komponen_Penilaian: comp,
            Nilai_Akhir: total.toFixed(2),
            Grade: getLetterGrade(total),
            Status_Penilaian: d.is_finalized ? 'Final' : 'Draft',
            _numScore: total,
            _isFinal: d.is_finalized ? 1 : 0,
            _rawDate: d.created_at,
          };
        })
    );

    const finalizedCount = rows.filter((r) => Number(r._isFinal) === 1).length;
    const avgScore =
      rows.length > 0
        ? (rows.reduce((s, r) => s + Number(r._numScore || 0), 0) / rows.length).toFixed(2)
        : '0.00';
    const maxScore =
      rows.length > 0 ? Math.max(...rows.map((r) => Number(r._numScore || 0))).toFixed(2) : '0.00';

    stats = [
      { label: 'Total Nilai Masuk', value: String(rows.length), hint: 'Rekaman evaluasi penguji', accent: 'blue' },
      { label: 'Nilai Final', value: String(finalizedCount), hint: 'Sudah dikunci penguji', accent: 'emerald' },
      { label: 'Rata-Rata Nilai', value: avgScore, hint: 'Rata-rata nilai terbobot', accent: 'cyan' },
      { label: 'Nilai Tertinggi', value: maxScore, hint: 'Skor tertinggi tercatat', accent: 'amber' },
    ];
  } else if (reportType === 'plagiarism') {
    const { data } = await supabase
      .from('plagiarism_checks')
      .select('*, student:profiles!plagiarism_checks_student_id_fkey(*), thesis:thesis_submissions(title, program_id, period_id)')
      .order('created_at', { ascending: false });

    const base = ((data || []) as PlagiarismCheck[])
      .filter((d) => (programFilter === 'all' ? true : d.thesis?.program_id === programFilter))
      .filter((d) => (periodFilter === 'all' ? true : d.thesis?.period_id === periodFilter));

    base.forEach((d) => availableStatusesSet.add(d.status));

    rows = applyDateRange(
      base
        .filter((d) => (statusFilter === 'all' ? true : d.status === statusFilter))
        .map((d) => ({
          id: d.id,
          NIM: d.student?.nim_nip || '—',
          Mahasiswa: d.student?.full_name || '—',
          Judul_TA: d.thesis?.title || '—',
          Persentase_Kemiripan:
            d.similarity_percent !== null
              ? `${d.similarity_percent}% (Maks ${d.max_allowed_percent}%)`
              : `Belum Diisi (Maks ${d.max_allowed_percent}%)`,
          Tanggal_Pemeriksaan: formatDate(d.verified_at || d.submitted_at || d.created_at),
          Status_Verifikasi: formatStatusLabel(d.status),
          _simPct: d.similarity_percent ?? -1,
          _rawStatus: d.status,
          _rawDate: d.verified_at || d.submitted_at || d.created_at,
        }))
    );

    const passedCount = rows.filter((r) => r._rawStatus === 'approved').length;
    const pendingCount = rows.filter((r) => r._rawStatus === 'pending_verification').length;
    const validSims = rows.filter((r) => Number(r._simPct) >= 0);
    const avgSim =
      validSims.length > 0
        ? `${(validSims.reduce((s, r) => s + Number(r._simPct), 0) / validSims.length).toFixed(1)}%`
        : '—';

    stats = [
      { label: 'Total Pemeriksaan', value: String(rows.length), hint: 'Rekaman cek plagiasi', accent: 'blue' },
      { label: 'Lolos Verifikasi', value: String(passedCount), hint: 'Status Approved', accent: 'emerald' },
      { label: 'Menunggu Verifikasi', value: String(pendingCount), hint: 'Belum diverifikasi admin', accent: 'amber' },
      { label: 'Rata-Rata Kemiripan', value: avgSim, hint: 'Similarity score aktual', accent: 'cyan' },
    ];
  } else if (reportType === 'yudisium') {
    const { data } = await supabase
      .from('graduation_records')
      .select('*, student:profiles!graduation_records_student_id_fkey(*), thesis:thesis_submissions(title, program_id, period_id)')
      .order('created_at', { ascending: false });

    const base = ((data || []) as GraduationRecord[])
      .filter((d) => (programFilter === 'all' ? true : d.thesis?.program_id === programFilter))
      .filter((d) => (periodFilter === 'all' ? true : (d.period_id || d.thesis?.period_id) === periodFilter));

    base.forEach((d) => availableStatusesSet.add(d.status));

    rows = applyDateRange(
      base
        .filter((d) => (statusFilter === 'all' ? true : d.status === statusFilter))
        .map((d) => {
          const checklistEntries = Object.entries(d.checklist || {});
          const metCount = checklistEntries.filter(([, ok]) => Boolean(ok)).length;
          const totalCount = checklistEntries.length;
          const metNames = checklistEntries
            .filter(([, ok]) => Boolean(ok))
            .map(([k]) => k.replace(/_/g, ' '))
            .slice(0, 4);
          const checklistText =
            totalCount > 0
              ? `${metCount}/${totalCount} Syarat Terpenuhi${metNames.length ? ` (${metNames.join(', ')})` : ''}`
              : 'Belum ada checklist tercatat';

          return {
            id: d.id,
            NIM: d.student?.nim_nip || '—',
            Mahasiswa: d.student?.full_name || '—',
            Periode: d.yudisium_period || '—',
            Persyaratan_Yudisium: checklistText,
            Status_Kelengkapan: formatStatusLabel(d.status),
            Tanggal_Yudisium: formatDate(d.graduation_date || d.validated_at || d.submitted_at || d.created_at),
            _rawStatus: d.status,
            _checklistComplete: totalCount > 0 && metCount === totalCount ? 1 : 0,
            _rawDate: d.graduation_date || d.validated_at || d.created_at,
          };
        })
    );

    const graduatedOrApproved = rows.filter((r) => ['approved', 'graduated'].includes(String(r._rawStatus))).length;
    const verifying = rows.filter((r) => ['submitted', 'under_verification'].includes(String(r._rawStatus))).length;
    const fullChecklist = rows.filter((r) => Number(r._checklistComplete) === 1).length;

    stats = [
      { label: 'Total Peserta Yudisium', value: String(rows.length), hint: 'Data pengajuan yudisium', accent: 'blue' },
      { label: 'Disetujui / Lulus', value: String(graduatedOrApproved), hint: 'Approved & Graduated', accent: 'emerald' },
      { label: 'Dalam Verifikasi', value: String(verifying), hint: 'Submitted / Under Verification', accent: 'cyan' },
      { label: 'Checklist Lengkap', value: String(fullChecklist), hint: 'Seluruh syarat terpenuhi', accent: 'amber' },
    ];
  } else if (reportType === 'graduations') {
    const { data } = await supabase
      .from('graduation_records')
      .select(
        '*, student:profiles!graduation_records_student_id_fkey(*), thesis:thesis_submissions(title, program_id, period_id, program:programs(*))'
      )
      .eq('status', 'graduated')
      .order('graduation_date', { ascending: false });

    const base = ((data || []) as Array<GraduationRecord & { thesis?: ThesisSubmission & { program?: Program } }>)
      .filter((d) => (programFilter === 'all' ? true : d.thesis?.program_id === programFilter))
      .filter((d) => (periodFilter === 'all' ? true : (d.period_id || d.thesis?.period_id) === periodFilter));

    availableStatusesSet.add('graduated');

    rows = applyDateRange(
      base.map((d) => {
        const gradeDisplay =
          d.final_score !== null && d.final_grade
            ? `${Number(d.final_score).toFixed(2)} (${d.final_grade})`
            : d.final_grade || (d.final_score !== null ? Number(d.final_score).toFixed(2) : '—');
        return {
          id: d.id,
          NIM: d.student?.nim_nip || '—',
          Mahasiswa: d.student?.full_name || '—',
          Prodi: d.thesis?.program?.name || '—',
          Judul_TA: d.thesis?.title || '—',
          Nilai_Grade: gradeDisplay,
          Tanggal_Penyelesaian: formatDate(d.graduation_date || d.validated_at || d.created_at),
          Status_Kelulusan: 'Lulus (Graduated)',
          _numScore: d.final_score ?? -1,
          _grade: d.final_grade || '',
          _rawDate: d.graduation_date || d.validated_at || d.created_at,
        };
      })
    );

    const scoredRows = rows.filter((r) => Number(r._numScore) >= 0);
    const avgFinal =
      scoredRows.length > 0
        ? (scoredRows.reduce((s, r) => s + Number(r._numScore), 0) / scoredRows.length).toFixed(2)
        : '—';
    const topGrades = rows.filter((r) => ['A', 'A-'].includes(String(r._grade))).length;

    stats = [
      { label: 'Total Lulusan', value: String(rows.length), hint: 'Mahasiswa berstatus Graduated', accent: 'emerald' },
      { label: 'Rata-Rata Nilai Akhir', value: avgFinal, hint: 'Dari lulusan bernilai final', accent: 'blue' },
      { label: 'Predikat A / A-', value: String(topGrades), hint: 'Capaian nilai sangat baik', accent: 'cyan' },
      { label: 'Periode Tercatat', value: String(new Set(rows.map((r) => r.Tanggal_Penyelesaian)).size), hint: 'Tanggal penyelesaian unik', accent: 'amber' },
    ];
  } else {
    // 10. delayed
    const { data } = await supabase
      .from('thesis_submissions')
      .select('*, student:profiles!thesis_submissions_student_id_fkey(*), program:programs(*)')
      .order('created_at', { ascending: true });

    const now = Date.now();
    const base = ((data || []) as Array<ThesisSubmission & { student?: Profile; program?: Program }>)
      .filter((d) => (programFilter === 'all' ? true : d.program_id === programFilter))
      .filter((d) => (periodFilter === 'all' ? true : d.period_id === periodFilter))
      .filter((d) => {
        const ageDays = (now - new Date(d.created_at).getTime()) / (1000 * 3600 * 24);
        return ageDays > 180 && d.current_stage !== 'completed';
      });

    base.forEach((d) => availableStatusesSet.add(d.status));

    rows = applyDateRange(
      base
        .filter((d) => (statusFilter === 'all' ? true : d.status === statusFilter))
        .map((d) => {
          const totalDays = Math.max(181, Math.floor((now - new Date(d.created_at).getTime()) / (1000 * 3600 * 24)));
          const lateDays = totalDays - 180;
          return {
            id: d.id,
            NIM: d.student?.nim_nip || '—',
            Mahasiswa: d.student?.full_name || '—',
            Semester: d.student?.semester ?? '—',
            Tahapan_Terlambat: formatStageLabel(d.current_stage),
            Durasi_Keterlambatan: `+${lateDays} hari (${totalDays} hari total)`,
            Status_Penyelesaian: formatStatusLabel(d.status),
            _lateDays: lateDays,
            _stage: formatStageLabel(d.current_stage),
            _rawDate: d.created_at,
          };
        })
    );

    const avgLate =
      rows.length > 0
        ? `${Math.round(rows.reduce((s, r) => s + Number(r._lateDays || 0), 0) / rows.length)} hr`
        : '0 hr';
    const maxLate =
      rows.length > 0 ? `${Math.max(...rows.map((r) => Number(r._lateDays || 0)))} hr` : '0 hr';

    stats = [
      { label: 'Mahasiswa Terlambat', value: String(rows.length), hint: 'Melewati batas 180 hari', accent: 'rose' },
      { label: 'Rata-Rata Keterlambatan', value: avgLate, hint: 'Di atas ambang 180 hari', accent: 'amber' },
      { label: 'Keterlambatan Maksimum', value: maxLate, hint: 'Durasi keterlambatan terlama', accent: 'blue' },
      { label: 'Tahapan Terdampak', value: String(new Set(rows.map((r) => String(r._stage))).size), hint: 'Variasi fase yang tertahan', accent: 'cyan' },
    ];
  }

  const meta = REPORT_TITLES[reportType];
  return {
    rows,
    stats,
    title: meta.title,
    subtitle: meta.subtitle,
    availableStatuses: Array.from(availableStatusesSet),
  };
}
