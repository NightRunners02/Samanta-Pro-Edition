import React, { useCallback, useEffect, useState } from 'react';
import { Download, Image as ImageIcon, Loader2, Printer, RotateCcw, Save, Upload } from 'lucide-react';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  APP_ICON_PRESETS,
  DEFAULT_APP_ICON_URL,
  applyDocumentFavicon,
  processImageFileToIconDataUrl,
} from '../../lib/appIcons';
import { logActivity, supabase } from '../../lib/supabase';
import { exportToCsv, formatDateTime } from '../../lib/utils';
import type { AcademicPeriod, ActivityLog, Program, SystemSettings } from '../../types/database';

type ReportType =
  | 'submissions'
  | 'supervisees'
  | 'progress'
  | 'seminars'
  | 'defenses'
  | 'scores'
  | 'plagiarism'
  | 'yudisium'
  | 'graduations'
  | 'delayed';

const REPORT_TYPES: Array<{ id: ReportType; label: string }> = [
  { id: 'submissions', label: '1. Laporan Pengajuan TA' },
  { id: 'supervisees', label: '2. Laporan Mahasiswa Bimbingan' },
  { id: 'progress', label: '3. Laporan Progres TA' },
  { id: 'seminars', label: '4. Laporan Seminar Proposal' },
  { id: 'defenses', label: '5. Laporan Sidang Akhir' },
  { id: 'scores', label: '6. Laporan Nilai Sidang' },
  { id: 'plagiarism', label: '7. Laporan Plagiasi' },
  { id: 'yudisium', label: '8. Laporan Yudisium' },
  { id: 'graduations', label: '9. Laporan Kelulusan' },
  { id: 'delayed', label: '10. Laporan Mahasiswa Terlambat' },
];

// ==========================================
// 1. Academic Reports Page
// ==========================================
export function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('submissions');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [programFilter, setProgramFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Array<Record<string, string | number>>>([]);

  useEffect(() => {
    Promise.all([
      supabase.from('programs').select('*').order('name'),
      supabase.from('academic_periods').select('*').order('start_date', { ascending: false }),
    ]).then(([{ data: pData }, { data: perData }]) => {
      setPrograms((pData || []) as Program[]);
      setPeriods((perData || []) as AcademicPeriod[]);
    });
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    let result: Array<Record<string, string | number>> = [];

    if (reportType === 'submissions' || reportType === 'progress' || reportType === 'delayed') {
      const { data } = await supabase
        .from('thesis_submissions')
        .select('*, student:profiles!thesis_submissions_student_id_fkey(*), program:programs(*)')
        .order('created_at', { ascending: false });

      const now = Date.now();
      result = (data || [])
        .filter((d) => (programFilter === 'all' ? true : d.program_id === programFilter))
        .filter((d) => (periodFilter === 'all' ? true : d.period_id === periodFilter))
        .filter((d) => (statusFilter === 'all' ? true : d.status === statusFilter))
        .filter((d) => {
          if (reportType === 'delayed') {
            const ageDays = (now - new Date(d.created_at).getTime()) / (1000 * 3600 * 24);
            return ageDays > 180 && d.current_stage !== 'completed';
          }
          return true;
        })
        .map((d) => ({
          id: d.id,
          NIM: d.student?.nim_nip || '—',
          Mahasiswa: d.student?.full_name || '—',
          Prodi: d.program?.name || '—',
          Judul: d.title,
          Tahap: d.current_stage,
          Status: d.status,
          Tanggal: formatDateTime(d.created_at),
          _rawDate: d.created_at,
        }));
    } else if (reportType === 'supervisees') {
      const { data } = await supabase
        .from('thesis_supervisors')
        .select('*, student:profiles!thesis_supervisors_student_id_fkey(*), lecturer:profiles!thesis_supervisors_lecturer_id_fkey(*), thesis:thesis_submissions(title, program_id)')
        .eq('status', 'active');
      result = (data || [])
        .filter((d) => (programFilter === 'all' ? true : d.thesis?.program_id === programFilter))
        .map((d) => ({
          id: d.id,
          NIM: d.student?.nim_nip || '—',
          Mahasiswa: d.student?.full_name || '—',
          Pembimbing: d.lecturer?.full_name || '—',
          Peran: d.supervisor_role === 'primary' ? 'Pembimbing 1' : 'Pembimbing 2',
          Judul: d.thesis?.title || '—',
          Tanggal: formatDateTime(d.assigned_at),
          _rawDate: d.assigned_at,
        }));
    } else if (reportType === 'seminars') {
      const { data } = await supabase
        .from('seminar_registrations')
        .select('*, student:profiles!seminar_registrations_student_id_fkey(*), thesis:thesis_submissions(title, program_id)');
      result = (data || [])
        .filter((d) => (programFilter === 'all' ? true : d.thesis?.program_id === programFilter))
        .filter((d) => (statusFilter === 'all' ? true : d.status === statusFilter))
        .map((d) => ({
          id: d.id,
          NIM: d.student?.nim_nip || '—',
          Mahasiswa: d.student?.full_name || '—',
          Judul: d.thesis?.title || '—',
          Status: d.status,
          Tanggal: formatDateTime(d.submitted_at || d.created_at),
          _rawDate: d.created_at,
        }));
    } else if (reportType === 'defenses') {
      const { data } = await supabase
        .from('defense_registrations')
        .select('*, student:profiles!defense_registrations_student_id_fkey(*), thesis:thesis_submissions(title, program_id)');
      result = (data || [])
        .filter((d) => (programFilter === 'all' ? true : d.thesis?.program_id === programFilter))
        .filter((d) => (statusFilter === 'all' ? true : d.status === statusFilter))
        .map((d) => ({
          id: d.id,
          NIM: d.student?.nim_nip || '—',
          Mahasiswa: d.student?.full_name || '—',
          Judul: d.thesis?.title || '—',
          Status: d.status,
          Tanggal: formatDateTime(d.submitted_at || d.created_at),
          _rawDate: d.created_at,
        }));
    } else if (reportType === 'scores') {
      const { data } = await supabase
        .from('exam_scores')
        .select('*, examiner:profiles!exam_scores_examiner_id_fkey(*), thesis:thesis_submissions(title, program_id, student:profiles!thesis_submissions_student_id_fkey(*))');
      result = (data || [])
        .filter((d) => (programFilter === 'all' ? true : d.thesis?.program_id === programFilter))
        .map((d) => ({
          id: d.id,
          NIM: d.thesis?.student?.nim_nip || '—',
          Mahasiswa: d.thesis?.student?.full_name || '—',
          Penguji: d.examiner?.full_name || '—',
          Nilai_Akhir: d.weighted_total,
          Tanggal: formatDateTime(d.created_at),
          _rawDate: d.created_at,
        }));
    } else if (reportType === 'plagiarism') {
      const { data } = await supabase
        .from('plagiarism_checks')
        .select('*, student:profiles!plagiarism_checks_student_id_fkey(*), thesis:thesis_submissions(program_id)');
      result = (data || [])
        .filter((d) => (programFilter === 'all' ? true : d.thesis?.program_id === programFilter))
        .filter((d) => (statusFilter === 'all' ? true : d.status === statusFilter))
        .map((d) => ({
          id: d.id,
          NIM: d.student?.nim_nip || '—',
          Mahasiswa: d.student?.full_name || '—',
          Persentase: d.similarity_percent !== null ? `${d.similarity_percent}%` : '—',
          Batas: `${d.max_allowed_percent}%`,
          Status: d.status,
          Tanggal: formatDateTime(d.created_at),
          _rawDate: d.created_at,
        }));
    } else {
      const { data } = await supabase
        .from('graduation_records')
        .select('*, student:profiles!graduation_records_student_id_fkey(*), thesis:thesis_submissions(program_id)');
      result = (data || [])
        .filter((d) => (programFilter === 'all' ? true : d.thesis?.program_id === programFilter))
        .filter((d) => (reportType === 'graduations' ? d.status === 'graduated' : true))
        .filter((d) => (statusFilter === 'all' ? true : d.status === statusFilter))
        .map((d) => ({
          id: d.id,
          NIM: d.student?.nim_nip || '—',
          Mahasiswa: d.student?.full_name || '—',
          Periode: d.yudisium_period || '—',
          Nilai: d.final_score ?? '—',
          Grade: d.final_grade || '—',
          Status: d.status,
          Tanggal: formatDateTime(d.created_at),
          _rawDate: d.created_at,
        }));
    }

    if (dateFrom || dateTo) {
      result = result.filter((r) => {
        const dt = new Date(String(r._rawDate)).getTime();
        if (dateFrom && dt < new Date(dateFrom).getTime()) return false;
        if (dateTo && dt > new Date(dateTo).getTime() + 86400000) return false;
        return true;
      });
    }

    setRows(result);
    setLoading(false);
  }, [reportType, programFilter, periodFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const keys = rows.length > 0 ? Object.keys(rows[0]).filter((k) => k !== 'id' && k !== '_rawDate') : ['Info'];

  const columns: ColumnDef<Record<string, string | number>>[] = keys.map((k) => ({
    key: k,
    header: k.replace(/_/g, ' '),
    render: (r) => <span className="max-w-xs block truncate">{String(r[k] ?? '—')}</span>,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Laporan Akademik</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Ekspor CSV/Excel atau cetak laporan resmi untuk 10 kategori proses tugas akhir.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportToCsv(
                `taflow_report_${reportType}.csv`,
                rows.map(({ id: _i, _rawDate: _r, ...rest }) => rest)
              )
            }
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-700 text-white"
          >
            <Printer className="w-3.5 h-3.5" />
            Cetak / Export PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs no-print">
        <div className="lg:col-span-2">
          <label className="block font-medium mb-1">Jenis Laporan</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportType)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            {REPORT_TYPES.map((rt) => (
              <option key={rt.id} value={rt.id}>{rt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-medium mb-1">Program Studi</label>
          <select
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            <option value="all">Semua Prodi</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block font-medium mb-1">Periode / Semester</label>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            <option value="all">Semua Periode</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block font-medium mb-1">Dari Tanggal</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950" />
        </div>
        <div>
          <label className="block font-medium mb-1">Sampai Tanggal</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950" />
        </div>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        keyField={(r) => String(r.id)}
        loading={loading}
        emptyTitle="Tidak ada data laporan"
        emptyDescription="Sesuaikan filter tanggal, program studi, atau periode akademik."
      />
    </div>
  );
}

// ==========================================
// 2. Activity Logs (Immutable Audit Trail)
// ==========================================
export function ActivityLogsPage() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      setLogs((data || []) as ActivityLog[]);
      setLoading(false);
    };
    load();
  }, []);

  const columns: ColumnDef<ActivityLog>[] = [
    {
      key: 'time',
      header: 'Timestamp',
      sortValue: (r) => r.created_at,
      render: (r) => <span className="font-mono text-xs tabular-nums">{formatDateTime(r.created_at)}</span>,
    },
    {
      key: 'actor',
      header: 'Aktor',
      render: (r) => (
        <div>
          <p className="font-medium">{r.actor_name}</p>
          <p className="text-[11px] text-slate-500">{r.actor_role}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Aksi',
      render: (r) => <span className="font-mono text-xs font-medium">{r.action}</span>,
    },
    {
      key: 'entity',
      header: 'Entitas',
      render: (r) => <span className="font-mono text-xs text-slate-500">{r.entity}</span>,
    },
    {
      key: 'meta',
      header: 'Metadata',
      render: (r) => (
        <span className="font-mono text-[11px] text-slate-500 max-w-xs block truncate">
          {JSON.stringify(r.metadata)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Activity Logs</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Jejak audit permanen seluruh aktivitas pengguna (tidak dapat diubah oleh pengguna biasa).
        </p>
      </div>
      <DataTable
        data={logs}
        columns={columns}
        keyField={(r) => r.id}
        loading={loading}
        searchPlaceholder="Cari aktor, aksi, atau entitas..."
        searchFilter={(r, q) =>
          r.actor_name.toLowerCase().includes(q) ||
          r.action.toLowerCase().includes(q) ||
          r.entity.toLowerCase().includes(q)
        }
      />
    </div>
  );
}

// ==========================================
// 3. System Settings Page
// ==========================================
export function SystemSettingsPage() {
  const { profile, systemSettings, refreshSettings } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState<SystemSettings | null>(null);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [formatsInput, setFormatsInput] = useState('pdf, docx, png, jpg');
  const [saving, setSaving] = useState(false);
  const [processingIcon, setProcessingIcon] = useState(false);
  const [iconPreviewError, setIconPreviewError] = useState(false);

  useEffect(() => {
    supabase.from('academic_periods').select('*').order('start_date', { ascending: false }).then(({ data }) => {
      setPeriods((data || []) as AcademicPeriod[]);
    });
  }, []);

  useEffect(() => {
    if (systemSettings) {
      setForm(systemSettings);
      setFormatsInput((systemSettings.allowed_file_formats || ['pdf', 'docx']).join(', '));
      setIconPreviewError(false);
    }
  }, [systemSettings]);

  const handleIconFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !form) return;

    const validMime = [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/svg+xml',
      'image/x-icon',
      'image/vnd.microsoft.icon',
    ].includes(file.type);
    const validExt = /\.(png|jpe?g|webp|svg|ico)$/i.test(file.name);

    if (!validMime && !validExt) {
      showToast('Format icon tidak didukung', 'warning', 'Pilih file PNG, JPG, WEBP, SVG, atau ICO dari perangkat Anda.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Ukuran file terlalu besar', 'warning', 'Maksimal ukuran file gambar adalah 5 MB.');
      return;
    }

    setProcessingIcon(true);
    try {
      const iconDataUrl = await processImageFileToIconDataUrl(file, 192);
      setIconPreviewError(false);
      setForm({ ...form, favicon_url: iconDataUrl });
      showToast('Icon berhasil dimuat', 'success', 'Klik "Simpan Konfigurasi Sistem" untuk menerapkan ke seluruh aplikasi.');
    } catch (err) {
      showToast(
        'Gagal memproses file icon',
        'error',
        err instanceof Error ? err.message : 'Pastikan file gambar valid.'
      );
    } finally {
      setProcessingIcon(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !profile) return;
    setSaving(true);

    const formats = formatsInput
      .split(',')
      .map((s) => s.trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean);

    const { error } = await supabase
      .from('system_settings')
      .update({
        app_name: form.app_name,
        logo_url: form.logo_url,
        favicon_url: form.favicon_url,
        active_period_id: form.active_period_id,
        max_supervisors: form.max_supervisors,
        max_examiners: form.max_examiners,
        default_min_sks: form.default_min_sks,
        default_min_gpa: form.default_min_gpa,
        default_max_plagiarism_pct: form.default_max_plagiarism_pct,
        max_upload_mb: form.max_upload_mb,
        allowed_file_formats: formats,
        email_config: form.email_config,
        notification_settings: form.notification_settings,
        maintenance_mode: form.maintenance_mode,
        updated_by: profile.id,
      })
      .eq('id', form.id);

    setSaving(false);
    if (error) {
      showToast('Gagal menyimpan pengaturan sistem', 'error', error.message);
      return;
    }

    applyDocumentFavicon(form.favicon_url);
    await refreshSettings();
    await logActivity('update_system_settings', 'system_settings', form.id, { app_name: form.app_name });
    showToast('System settings berhasil diterapkan', 'success');
  };

  if (!form) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight">System Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Konfigurasi identitas aplikasi, periode akademik aktif, ambang batas kelayakan TA, unggahan berkas, email, dan mode pemeliharaan.
        </p>
      </div>

      <form onSubmit={handleSave} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-medium mb-1">Application Name</label>
            <input type="text" required value={form.app_name} onChange={(e) => setForm({ ...form, app_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div>
            <label className="block font-medium mb-1">Periode Akademik Aktif</label>
            <select value={form.active_period_id || ''} onChange={(e) => setForm({ ...form, active_period_id: e.target.value || null })} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
              <option value="">-- Pilih Periode --</option>
              {periods.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.academic_year})</option>)}
            </select>
          </div>
          <div>
            <label className="block font-medium mb-1">Logo URL (Opsional)</label>
            <input type="text" value={form.logo_url || ''} onChange={(e) => setForm({ ...form, logo_url: e.target.value || null })} placeholder="/src/assets/images/..." className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div>
            <label className="block font-medium mb-1.5">Icon / Favicon Aplikasi (Opsional)</label>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-3">
              {/* Live Icon Preview + File/Media Picker */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                  {!iconPreviewError ? (
                    <img
                      src={form.favicon_url || DEFAULT_APP_ICON_URL}
                      alt="Preview Icon Aplikasi"
                      referrerPolicy="no-referrer"
                      onError={() => setIconPreviewError(true)}
                      className="w-full h-full object-contain p-1"
                    />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-slate-400" />
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 max-w-full">
                    {!iconPreviewError ? (
                      <img
                        src={form.favicon_url || DEFAULT_APP_ICON_URL}
                        alt=""
                        className="w-3.5 h-3.5 rounded-xs object-contain shrink-0"
                      />
                    ) : (
                      <ImageIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate">
                      {form.app_name || 'TAFlow'} — Tab Browser
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-blue-700 hover:bg-blue-800 text-white text-[11px] font-medium cursor-pointer transition-colors">
                      {processingIcon ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Upload className="w-3 h-3" />
                      )}
                      <span>{processingIcon ? 'Memproses...' : 'Pilih File / Media'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico"
                        className="hidden"
                        onChange={handleIconFileSelect}
                        disabled={processingIcon}
                      />
                    </label>
                    {form.favicon_url && (
                      <button
                        type="button"
                        onClick={() => {
                          setIconPreviewError(false);
                          setForm({ ...form, favicon_url: null });
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Built-in Custom TAFlow Icons */}
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
                  Atau pilih icon bawaan TAFlow:
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {APP_ICON_PRESETS.map((preset) => {
                    const isSelected =
                      form.favicon_url === preset.dataUrl ||
                      (!form.favicon_url && preset.dataUrl === DEFAULT_APP_ICON_URL);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        title={preset.label}
                        onClick={() => {
                          setIconPreviewError(false);
                          setForm({ ...form, favicon_url: preset.dataUrl });
                        }}
                        className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-colors ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 dark:border-cyan-400'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <img
                          src={preset.dataUrl}
                          alt={preset.label}
                          className="w-7 h-7 rounded-md object-contain"
                        />
                        <span className="text-[10px] text-slate-600 dark:text-slate-300 truncate w-full text-center">
                          {preset.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Manual URL Input */}
              <div>
                <input
                  type="text"
                  value={form.favicon_url?.startsWith('data:') ? '' : form.favicon_url || ''}
                  onChange={(e) => {
                    setIconPreviewError(false);
                    setForm({ ...form, favicon_url: e.target.value || null });
                  }}
                  placeholder={
                    form.favicon_url?.startsWith('data:')
                      ? 'Icon lokal/preset aktif (tempel URL jika ingin mengganti)'
                      : 'Atau masukkan URL icon (https://...)'
                  }
                  className="w-full px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px]"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block font-medium mb-1">Maksimal Pembimbing</label>
            <input type="number" min={1} max={3} value={form.max_supervisors} onChange={(e) => setForm({ ...form, max_supervisors: Number(e.target.value) })} className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div>
            <label className="block font-medium mb-1">Maksimal Penguji</label>
            <input type="number" min={1} max={5} value={form.max_examiners} onChange={(e) => setForm({ ...form, max_examiners: Number(e.target.value) })} className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div>
            <label className="block font-medium mb-1">Default Minimum SKS</label>
            <input type="number" value={form.default_min_sks} onChange={(e) => setForm({ ...form, default_min_sks: Number(e.target.value) })} className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div>
            <label className="block font-medium mb-1">Default Minimum IPK</label>
            <input type="number" step="0.01" value={form.default_min_gpa} onChange={(e) => setForm({ ...form, default_min_gpa: Number(e.target.value) })} className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div>
            <label className="block font-medium mb-1">Default Batas Plagiasi (%)</label>
            <input type="number" value={form.default_max_plagiarism_pct} onChange={(e) => setForm({ ...form, default_max_plagiarism_pct: Number(e.target.value) })} className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div>
            <label className="block font-medium mb-1">Batas Ukuran Upload (MB)</label>
            <input type="number" min={1} max={100} value={form.max_upload_mb} onChange={(e) => setForm({ ...form, max_upload_mb: Number(e.target.value) })} className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div className="sm:col-span-2">
            <label className="block font-medium mb-1">Format Berkas Diizinkan (pisahkan dengan koma)</label>
            <input type="text" value={formatsInput} onChange={(e) => setFormatsInput(e.target.value)} className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div>
            <label className="block font-medium mb-1">Email Pengirim Sistem</label>
            <input type="email" value={form.email_config?.sender_email || ''} onChange={(e) => setForm({ ...form, email_config: { ...form.email_config, sender_email: e.target.value } })} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div>
            <label className="block font-medium mb-1">Nama Pengirim Email</label>
            <input type="text" value={form.email_config?.sender_name || ''} onChange={(e) => setForm({ ...form, email_config: { ...form.email_config, sender_name: e.target.value } })} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.notification_settings?.notify_on_schedule ?? true}
              onChange={(e) => setForm({ ...form, notification_settings: { ...form.notification_settings, notify_on_schedule: e.target.checked } })}
            />
            <span>Kirim notifikasi otomatis saat jadwal seminar/sidang dibuat atau diubah</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-amber-700 dark:text-amber-400 font-medium">
            <input
              type="checkbox"
              checked={form.maintenance_mode}
              onChange={(e) => setForm({ ...form, maintenance_mode: e.target.checked })}
            />
            <span>Aktifkan Maintenance Mode (menahan akses mahasiswa dan dosen sementara)</span>
          </label>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Simpan Konfigurasi Sistem
          </button>
        </div>
      </form>
    </div>
  );
}
