import React, { useCallback, useEffect, useState } from 'react';
import { Download, Edit3, Eye, Loader2, Power, Upload, UserPlus } from 'lucide-react';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { Drawer, Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getSignedAvatarUrls, logActivity, supabase } from '../../lib/supabase';
import { exportToCsv, formatDateTime } from '../../lib/utils';
import type { AcademicStatus, Department, Profile, Program, ThesisSubmission } from '../../types/database';

export function StudentManagementPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Profile[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);

  // Photo lightbox preview
  const [previewAvatar, setPreviewAvatar] = useState<{ name: string; src: string; sub?: string } | null>(null);

  // Filters
  const [programFilter, setProgramFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Edit/Add Modal
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState('');
  const [nim, setNim] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [deptId, setDeptId] = useState('');
  const [progId, setProgId] = useState('');
  const [entryYear, setEntryYear] = useState(2023);
  const [semester, setSemester] = useState(7);
  const [sks, setSks] = useState(110);
  const [gpa, setGpa] = useState(3.25);
  const [acadStatus, setAcadStatus] = useState<AcademicStatus>('active');
  const [saving, setSaving] = useState(false);

  // Detail Progress Drawer
  const [inspectStudent, setInspectStudent] = useState<Profile | null>(null);
  const [studentTheses, setStudentTheses] = useState<ThesisSubmission[]>([]);

  const loadData = useCallback(async (withLoader = true) => {
    if (withLoader) setLoading(true);
    let query = supabase
      .from('profiles')
      .select('*, department:departments(*), program:programs(*)')
      .eq('role_code', 'student')
      .order('created_at', { ascending: false });

    if (profile?.role_code === 'program_admin' && profile.program_id) {
      query = query.eq('program_id', profile.program_id);
    }

    const [{ data: stuData }, { data: deptData }, { data: progData }] = await Promise.all([
      query,
      supabase.from('departments').select('*').order('name'),
      supabase.from('programs').select('*').order('name'),
    ]);

    const list = (stuData || []) as Profile[];
    setStudents(list);
    setDepartments((deptData || []) as Department[]);
    setPrograms((progData || []) as Program[]);

    // Resolve signed URLs for all student avatars
    const paths = list.map((s) => s.avatar_url).filter((p): p is string => Boolean(p));
    if (paths.length > 0) {
      const signedMap = await getSignedAvatarUrls(paths);
      const byUser: Record<string, string> = {};
      for (const s of list) {
        if (s.avatar_url && signedMap[s.avatar_url]) {
          byUser[s.id] = signedMap[s.avatar_url];
        }
      }
      setAvatarUrls(byUser);
    } else {
      setAvatarUrls({});
    }

    if (withLoader) setLoading(false);
  }, [profile?.role_code, profile?.program_id]);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel('realtime-students-profiles')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          loadData(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  const openAdd = () => {
    setEditing(null);
    setFullName('');
    setNim('');
    setEmail('');
    setPassword('');
    setDeptId(departments[0]?.id || '');
    setProgId(profile?.program_id || programs[0]?.id || '');
    setEntryYear(new Date().getFullYear() - 3);
    setSemester(7);
    setSks(110);
    setGpa(3.0);
    setAcadStatus('active');
    setEditOpen(true);
  };

  const openEdit = (s: Profile) => {
    setEditing(s);
    setFullName(s.full_name);
    setNim(s.nim_nip || '');
    setEmail(s.email || '');
    setDeptId(s.department_id || '');
    setProgId(s.program_id || '');
    setEntryYear(s.entry_year || 2023);
    setSemester(s.semester || 7);
    setSks(s.completed_sks || 0);
    setGpa(Number(s.gpa || 0));
    setAcadStatus(s.academic_status);
    setEditOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (editing) {
      const normalizedNewEmail = email.trim().toLowerCase();
      const normalizedOldEmail = (editing.email || '').trim().toLowerCase();

      if (normalizedNewEmail && normalizedNewEmail !== normalizedOldEmail) {
        const { error: emailErr } = await supabase.rpc('admin_update_user_email', {
          p_target_user_id: editing.id,
          p_new_email: normalizedNewEmail,
        });
        if (emailErr) {
          setSaving(false);
          showToast('Gagal memperbarui email mahasiswa', 'error', emailErr.message);
          return;
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          nim_nip: nim.trim() || null,
          department_id: deptId || null,
          program_id: progId || null,
          entry_year: entryYear,
          semester,
          completed_sks: sks,
          gpa,
          academic_status: acadStatus,
        })
        .eq('id', editing.id);

      setSaving(false);
      if (error) {
        showToast('Gagal memperbarui mahasiswa', 'error', error.message);
        return;
      }
      await logActivity('update_student', 'profiles', editing.id, { nim, email: normalizedNewEmail });
      showToast('Data & email mahasiswa diperbarui', 'success');
      setEditOpen(false);
      loadData(false);
    } else {
      const { data: created, error: createErr } = await supabase.rpc('admin_create_user_account', {
        p_full_name: fullName.trim(),
        p_nim_nip: nim.trim(),
        p_password: password || 'Taflow1234!',
        p_role_code: 'student',
        p_department_id: deptId || null,
        p_program_id: progId || null,
        p_entry_year: entryYear,
        p_email: email.trim() || null,
        p_semester: semester,
        p_completed_sks: sks,
        p_gpa: gpa,
        p_academic_status: acadStatus,
      });
      setSaving(false);
      if (createErr) {
        showToast('Gagal menambahkan mahasiswa', 'error', createErr.message);
        return;
      }
      const userId = (created as { user_id?: string } | null)?.user_id;
      if (userId) {
        await logActivity('create_student', 'profiles', userId, { nim });
      }
      showToast('Mahasiswa berhasil didaftarkan', 'success');
      setEditOpen(false);
      loadData(false);
    }
  };

  const toggleActive = async (s: Profile) => {
    const next = !s.is_active;
    const { error } = await supabase.from('profiles').update({ is_active: next }).eq('id', s.id);
    if (error) {
      showToast('Gagal mengubah status akun', 'error', error.message);
      return;
    }
    await logActivity(next ? 'activate_account' : 'deactivate_account', 'profiles', s.id, {});
    showToast(next ? 'Akun diaktifkan' : 'Akun dinonaktifkan', 'success');
    loadData(false);
  };

  const inspectProgress = async (s: Profile) => {
    setInspectStudent(s);
    const { data } = await supabase
      .from('thesis_submissions')
      .select('*')
      .eq('student_id', s.id)
      .order('created_at', { ascending: false });
    setStudentTheses((data || []) as ThesisSubmission[]);
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      showToast('File CSV kosong atau format tidak valid', 'warning');
      return;
    }

    let updated = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
      const [rowNim, rowName, rowSks, rowGpa] = cols;
      if (!rowNim) continue;
      const match = students.find((s) => s.nim_nip === rowNim);
      if (match) {
        await supabase
          .from('profiles')
          .update({
            full_name: rowName || match.full_name,
            completed_sks: Number(rowSks) || match.completed_sks,
            gpa: Number(rowGpa) || match.gpa,
          })
          .eq('id', match.id);
        updated++;
      }
    }
    showToast(`Import CSV selesai (${updated} profil mahasiswa diperbarui)`, 'success');
    loadData(false);
  };

  const filtered = students.filter((s) => {
    if (programFilter !== 'all' && s.program_id !== programFilter) return false;
    if (yearFilter !== 'all' && String(s.entry_year) !== yearFilter) return false;
    if (statusFilter !== 'all' && (statusFilter === 'active' ? !s.is_active : s.is_active)) return false;
    return true;
  });

  const years = Array.from(new Set(students.map((s) => s.entry_year).filter(Boolean))).sort();

  const columns: ColumnDef<Profile>[] = [
    {
      key: 'name',
      header: 'Mahasiswa',
      sortValue: (r) => r.full_name,
      render: (r) => {
        const photoUrl = avatarUrls[r.id];
        return (
          <div className="flex items-center gap-3">
            <UserAvatar
              name={r.full_name}
              src={photoUrl}
              size="md"
              onClick={
                photoUrl
                  ? () => setPreviewAvatar({ name: r.full_name, src: photoUrl, sub: r.nim_nip || r.email })
                  : undefined
              }
            />
            <div className="min-w-0">
              <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{r.full_name}</p>
              <p className="text-[11px] font-mono text-slate-500 truncate">
                {r.nim_nip || '—'} · {r.email}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'program',
      header: 'Program Studi',
      render: (r) => (
        <div>
          <p>{r.program?.name || '—'}</p>
          <p className="text-[11px] text-slate-500">Angkatan {r.entry_year || '—'}</p>
        </div>
      ),
    },
    {
      key: 'academic',
      header: 'SKS / IPK',
      align: 'right',
      render: (r) => (
        <span className="font-mono tabular-nums">
          {r.completed_sks ?? 0} SKS · {(r.gpa ?? 0).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status Akun',
      render: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} />,
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (r) => (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            title="Progres TA & Profil"
            onClick={() => inspectProgress(r)}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Edit Mahasiswa & Email"
            onClick={() => openEdit(r)}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title={r.is_active ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
            onClick={() => toggleActive(r)}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Power className={`w-3.5 h-3.5 ${r.is_active ? 'text-emerald-600' : 'text-slate-400'}`} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Student Management</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Kelola data mahasiswa, email akun, foto profil, SKS, IPK, status keaktifan, serta ekspor/impor CSV.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
            <Upload className="w-3.5 h-3.5" />
            Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleImportCsv} />
          </label>
          <button
            type="button"
            onClick={() =>
              exportToCsv(
                'taflow_students.csv',
                filtered.map((s) => ({
                  NIM: s.nim_nip || '',
                  Nama: s.full_name,
                  Email: s.email,
                  Prodi: s.program?.name || '',
                  Angkatan: s.entry_year || '',
                  SKS: s.completed_sks || 0,
                  IPK: s.gpa || 0,
                  Status: s.is_active ? 'Aktif' : 'Nonaktif',
                }))
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Tambah Mahasiswa
          </button>
        </div>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        keyField={(r) => r.id}
        loading={loading}
        searchPlaceholder="Cari NIM, email, atau nama mahasiswa..."
        searchFilter={(r, q) =>
          r.full_name.toLowerCase().includes(q) ||
          (r.nim_nip || '').toLowerCase().includes(q) ||
          (r.email || '').toLowerCase().includes(q)
        }
        toolbarExtra={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={programFilter}
              onChange={(e) => setProgramFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <option value="all">Semua Prodi</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <option value="all">Semua Angkatan</option>
              {years.map((y) => (
                <option key={String(y)} value={String(y)}>{y}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <option value="all">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
          </div>
        }
      />

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={editing ? 'Edit Data Mahasiswa' : 'Tambah Mahasiswa Baru'}
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {editing && (
            <div className="flex items-center gap-3.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <UserAvatar
                name={editing.full_name}
                src={avatarUrls[editing.id]}
                size="lg"
                onClick={
                  avatarUrls[editing.id]
                    ? () =>
                        setPreviewAvatar({
                          name: editing.full_name,
                          src: avatarUrls[editing.id],
                          sub: editing.nim_nip || editing.email,
                        })
                    : undefined
                }
              />
              <div className="min-w-0">
                <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                  {editing.full_name}
                </p>
                <p className="font-mono text-[11px] text-slate-500">
                  {editing.nim_nip || '—'} ·{' '}
                  {avatarUrls[editing.id] ? 'Klik foto untuk memperbesar' : 'Belum mengunggah foto profil'}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Nama Lengkap *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">NIM *</label>
              <input
                type="text"
                required
                value={nim}
                onChange={(e) => setNim(e.target.value)}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">
                {editing ? 'Email Akun *' : 'Email (Opsional)'}
              </label>
              <input
                type="text"
                inputMode="email"
                required={Boolean(editing)}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={editing ? 'nama@mahasiswa.kampus.ac.id' : 'Boleh kosong / dummy'}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            {!editing && (
              <div className="sm:col-span-2">
                <label className="block font-medium mb-1">Kata Sandi Awal *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            )}
            <div>
              <label className="block font-medium mb-1">Fakultas</label>
              <select
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Program Studi</label>
              <select
                value={progId}
                onChange={(e) => setProgId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">SKS Lulus</label>
              <input
                type="number"
                value={sks}
                onChange={(e) => setSks(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">IPK</label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={4}
                value={gpa}
                onChange={(e) => setGpa(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Tahun Masuk</label>
              <input
                type="number"
                value={entryYear}
                onChange={(e) => setEntryYear(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Status Akademik</label>
              <select
                value={acadStatus}
                onChange={(e) => setAcadStatus(e.target.value as AcademicStatus)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="active">Active</option>
                <option value="leave">Leave (Cuti)</option>
                <option value="graduated">Graduated</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Simpan
            </button>
          </div>
        </form>
      </Modal>

      <Drawer
        open={Boolean(inspectStudent)}
        onClose={() => setInspectStudent(null)}
        title={`Progres Tugas Akhir — ${inspectStudent?.full_name || ''}`}
        subtitle={`NIM: ${inspectStudent?.nim_nip || '—'} · ${inspectStudent?.email || ''}`}
      >
        <div className="space-y-4 text-xs">
          {inspectStudent && (
            <div className="flex items-center gap-3.5 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <UserAvatar
                name={inspectStudent.full_name}
                src={avatarUrls[inspectStudent.id]}
                size="lg"
                onClick={
                  avatarUrls[inspectStudent.id]
                    ? () =>
                        setPreviewAvatar({
                          name: inspectStudent.full_name,
                          src: avatarUrls[inspectStudent.id],
                          sub: inspectStudent.nim_nip || inspectStudent.email,
                        })
                    : undefined
                }
              />
              <div className="min-w-0">
                <p className="font-semibold text-sm">{inspectStudent.full_name}</p>
                <p className="font-mono text-[11px] text-slate-500 truncate">{inspectStudent.email}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {inspectStudent.program?.name || '—'} · {inspectStudent.completed_sks ?? 0} SKS · IPK {(inspectStudent.gpa ?? 0).toFixed(2)}
                </p>
              </div>
            </div>
          )}

          {studentTheses.length === 0 ? (
            <p className="text-slate-500 py-8 text-center">Mahasiswa ini belum memiliki pengajuan tugas akhir.</p>
          ) : (
            studentTheses.map((t) => (
              <div key={t.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <StatusBadge status={t.status} />
                  <span className="font-mono text-[11px] text-slate-400">{formatDateTime(t.created_at)}</span>
                </div>
                <p className="font-semibold text-sm">{t.title}</p>
                <p className="text-slate-500">Tahap Saat Ini: {t.current_stage.replace(/_/g, ' ')}</p>
              </div>
            ))
          )}
        </div>
      </Drawer>

      <Modal
        open={Boolean(previewAvatar)}
        onClose={() => setPreviewAvatar(null)}
        title={previewAvatar?.name || 'Foto Profil'}
        subtitle={previewAvatar?.sub}
        maxWidth="sm"
      >
        {previewAvatar && (
          <div className="flex justify-center">
            <img
              src={previewAvatar.src}
              alt={previewAvatar.name}
              className="max-h-[60vh] w-auto rounded-lg object-contain border border-slate-200 dark:border-slate-800"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
