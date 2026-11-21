import type { LucideIcon } from 'lucide-react';
import {
  Award,
  Bell,
  BookCheck,
  BookOpen,
  Building2,
  Calendar,
  CalendarClock,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  FileSearch,
  FileText,
  FolderArchive,
  GraduationCap,
  History,
  LayoutDashboard,
  MessageSquareText,
  PieChart,
  Settings,
  ShieldCheck,
  Sliders,
  UserCheck,
  UserCog,
  Users,
} from 'lucide-react';
import type { RoleCode } from '../types/database';

export interface NavItem {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  roles: RoleCode[];
  breadcrumb: string[];
}

export const NAV_ITEMS: NavItem[] = [
  // Overview
  {
    id: 'dashboard',
    label: 'Dashboard',
    group: 'Ringkasan',
    icon: LayoutDashboard,
    roles: ['super_admin', 'program_admin', 'supervisor', 'examiner', 'student'],
    breadcrumb: ['TAFlow', 'Dashboard'],
  },

  // Student Workflow
  {
    id: 'title-submission',
    label: 'Pengajuan Judul',
    group: 'Alur Tugas Akhir',
    icon: FileText,
    roles: ['student'],
    breadcrumb: ['Alur Tugas Akhir', 'Pengajuan Judul'],
  },
  {
    id: 'guidance',
    label: 'Bimbingan TA',
    group: 'Alur Tugas Akhir',
    icon: MessageSquareText,
    roles: ['student'],
    breadcrumb: ['Alur Tugas Akhir', 'Bimbingan TA'],
  },
  {
    id: 'chapters',
    label: 'Progres Bab 1–5',
    group: 'Alur Tugas Akhir',
    icon: BookOpen,
    roles: ['student'],
    breadcrumb: ['Alur Tugas Akhir', 'Progres Bab'],
  },
  {
    id: 'documents',
    label: 'Document Center',
    group: 'Alur Tugas Akhir',
    icon: FolderArchive,
    roles: ['student'],
    breadcrumb: ['Alur Tugas Akhir', 'Document Center'],
  },
  {
    id: 'seminar',
    label: 'Seminar Proposal',
    group: 'Ujian & Kelulusan',
    icon: Calendar,
    roles: ['student'],
    breadcrumb: ['Ujian & Kelulusan', 'Seminar Proposal'],
  },
  {
    id: 'defense',
    label: 'Sidang Akhir',
    group: 'Ujian & Kelulusan',
    icon: Award,
    roles: ['student'],
    breadcrumb: ['Ujian & Kelulusan', 'Pendaftaran Sidang'],
  },
  {
    id: 'plagiarism',
    label: 'Cek Plagiasi',
    group: 'Ujian & Kelulusan',
    icon: FileSearch,
    roles: ['student'],
    breadcrumb: ['Ujian & Kelulusan', 'Verifikasi Plagiasi'],
  },
  {
    id: 'yudisium',
    label: 'Yudisium',
    group: 'Ujian & Kelulusan',
    icon: GraduationCap,
    roles: ['student'],
    breadcrumb: ['Ujian & Kelulusan', 'Yudisium'],
  },

  // Lecturer Workflow
  {
    id: 'supervisees',
    label: 'Mahasiswa Bimbingan',
    group: 'Pembimbingan',
    icon: Users,
    roles: ['supervisor', 'examiner'],
    breadcrumb: ['Pembimbingan', 'Mahasiswa & Judul'],
  },
  {
    id: 'guidance-management',
    label: 'Sesi Bimbingan',
    group: 'Pembimbingan',
    icon: MessageSquareText,
    roles: ['supervisor', 'examiner'],
    breadcrumb: ['Pembimbingan', 'Sesi Bimbingan'],
  },
  {
    id: 'chapter-review',
    label: 'Review Bab & Dokumen',
    group: 'Pembimbingan',
    icon: BookCheck,
    roles: ['supervisor', 'examiner'],
    breadcrumb: ['Pembimbingan', 'Review Bab'],
  },
  {
    id: 'examiner-schedule',
    label: 'Jadwal & Penilaian Ujian',
    group: 'Pengujian',
    icon: ClipboardCheck,
    roles: ['supervisor', 'examiner'],
    breadcrumb: ['Pengujian', 'Jadwal & Penilaian'],
  },

  // Admin: User Management
  {
    id: 'students',
    label: 'Student Management',
    group: 'Manajemen Pengguna',
    icon: Users,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Manajemen Pengguna', 'Mahasiswa'],
  },
  {
    id: 'lecturers',
    label: 'Lecturer Management',
    group: 'Manajemen Pengguna',
    icon: UserCheck,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Manajemen Pengguna', 'Dosen'],
  },
  {
    id: 'admins',
    label: 'Admin & Role Access',
    group: 'Manajemen Pengguna',
    icon: ShieldCheck,
    roles: ['super_admin'],
    breadcrumb: ['Manajemen Pengguna', 'Admin & Role'],
  },

  // Admin: Thesis & Supervision
  {
    id: 'submissions',
    label: 'Thesis Submission',
    group: 'Operasional TA',
    icon: FileText,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Operasional TA', 'Pengajuan Judul'],
  },
  {
    id: 'supervisors',
    label: 'Supervisor Assignment',
    group: 'Operasional TA',
    icon: UserCog,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Operasional TA', 'Penetapan Pembimbing'],
  },
  {
    id: 'admin-guidance',
    label: 'Guidance Management',
    group: 'Operasional TA',
    icon: MessageSquareText,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Operasional TA', 'Monitoring Bimbingan'],
  },
  {
    id: 'document-verification',
    label: 'Document Verification',
    group: 'Operasional TA',
    icon: FileCheck2,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Operasional TA', 'Verifikasi Dokumen'],
  },

  // Admin: Exam & Graduation
  {
    id: 'admin-seminar',
    label: 'Seminar Proposal',
    group: 'Sidang & Yudisium',
    icon: Calendar,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Sidang & Yudisium', 'Seminar Proposal'],
  },
  {
    id: 'admin-defense',
    label: 'Defense Registration',
    group: 'Sidang & Yudisium',
    icon: Award,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Sidang & Yudisium', 'Pendaftaran Sidang'],
  },
  {
    id: 'exam-scheduling',
    label: 'Exam Scheduling',
    group: 'Sidang & Yudisium',
    icon: CalendarClock,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Sidang & Yudisium', 'Jadwal Ujian'],
  },
  {
    id: 'examiners',
    label: 'Examiner Management',
    group: 'Sidang & Yudisium',
    icon: ClipboardList,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Sidang & Yudisium', 'Dosen Penguji'],
  },
  {
    id: 'scores',
    label: 'Score Management',
    group: 'Sidang & Yudisium',
    icon: ClipboardCheck,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Sidang & Yudisium', 'Manajemen Nilai'],
  },
  {
    id: 'admin-plagiarism',
    label: 'Plagiarism Verification',
    group: 'Sidang & Yudisium',
    icon: FileSearch,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Sidang & Yudisium', 'Verifikasi Plagiasi'],
  },
  {
    id: 'admin-yudisium',
    label: 'Graduation Management',
    group: 'Sidang & Yudisium',
    icon: GraduationCap,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Sidang & Yudisium', 'Yudisium'],
  },

  // Admin: Configuration & Analytics
  {
    id: 'academic-periods',
    label: 'Academic Period',
    group: 'Konfigurasi & Laporan',
    icon: Calendar,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Konfigurasi', 'Periode Akademik'],
  },
  {
    id: 'programs',
    label: 'Program Management',
    group: 'Konfigurasi & Laporan',
    icon: Building2,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Konfigurasi', 'Fakultas & Prodi'],
  },
  {
    id: 'requirements',
    label: 'Requirements Management',
    group: 'Konfigurasi & Laporan',
    icon: CheckSquare,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Konfigurasi', 'Persyaratan TA'],
  },
  {
    id: 'reports',
    label: 'Reports',
    group: 'Konfigurasi & Laporan',
    icon: PieChart,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Laporan', 'Laporan Akademik'],
  },
  {
    id: 'activity-logs',
    label: 'Activity Logs',
    group: 'Konfigurasi & Laporan',
    icon: History,
    roles: ['super_admin', 'program_admin'],
    breadcrumb: ['Audit', 'Activity Logs'],
  },
  {
    id: 'system-settings',
    label: 'System Settings',
    group: 'Konfigurasi & Laporan',
    icon: Sliders,
    roles: ['super_admin'],
    breadcrumb: ['Konfigurasi', 'System Settings'],
  },

  // Shared Account Pages
  {
    id: 'notifications',
    label: 'Notifications',
    group: 'Akun',
    icon: Bell,
    roles: ['super_admin', 'program_admin', 'supervisor', 'examiner', 'student'],
    breadcrumb: ['Akun', 'Notifikasi'],
  },
  {
    id: 'profile',
    label: 'Profile Settings',
    group: 'Akun',
    icon: Settings,
    roles: ['super_admin', 'program_admin', 'supervisor', 'examiner', 'student'],
    breadcrumb: ['Akun', 'Pengaturan Profil'],
  },
];

export function getNavItemsForRole(role: RoleCode): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
