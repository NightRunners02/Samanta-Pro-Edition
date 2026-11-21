import React, { useCallback, useEffect, useState } from 'react';
import { Edit3, Eye, Loader2, Power, UserPlus } from 'lucide-react';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { Drawer, Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getSignedAvatarUrls, logActivity, supabase } from '../../lib/supabase';
import type { Profile, Program, ThesisSupervisor } from '../../types/database';

export function LecturerManagementPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [lecturers, setLecturers] = useState<Profile[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loads, setLoads] = useState<Record<string, number>>({});

  // Photo lightbox preview
  const [previewAvatar, setPreviewAvatar] = useState<{ name: string; src: string; sub?: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState('');
  const [nip, setNip] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleCode, setRoleCode] = useState<'supervisor' | 'examiner'>('supervisor');
  const [progId, setProgId] = useState('');
  const [position, setPosition] = useState('Lektor');
  const [researchField, setResearchField] = useState('');
  const [quota, setQuota] = useState(10);
  const [schedule, setSchedule] = useState('');
  const [saving, setSaving] = useState(false);

  const [inspectLecturer, setInspectLecturer] = useState<Profile | null>(null);
  const [supervisees, setSupervisees] = useState<ThesisSupervisor[]>([]);

  const loadData = useCallback(async (withLoader = true) => {
    if (withLoader) setLoading(true);

    let lecQuery = supabase
      .from('profiles')
      .select('*, program:programs(*)')
      .in('role_code', ['supervisor', 'examiner'])
      .order('full_name');

    if (profile?.role_code === 'program_admin' && profile.program_id) {
      lecQuery = lecQuery.eq('program_id', profile.program_id);
    }

    const [{ data: lecData }, { data: progData }, { data: supData }] = await Promise.all([
      lecQuery,
      supabase.from('programs').select('*').order('name'),
      supabase.from('thesis_supervisors').select('lecturer_id').eq('status', 'active'),
    ]);

    const loadMap: Record<string, number> = {};
    for (const s of supData || []) {
      loadMap[s.lecturer_id] = (loadMap[s.lecturer_id] || 0) + 1;
    }

    const list = (lecData || []) as Profile[];
    setLecturers(list);
    setPrograms((progData || []) as Program[]);
    setLoads(loadMap);

    // Resolve signed URLs for lecturer avatars
    const paths = list.map((l) => l.avatar_url).filter((p): p is string => Boolean(p));
    if (paths.length > 0) {
      const signedMap = await getSignedAvatarUrls(paths);
      const byUser: Record<string, string> = {};
      for (const l of list) {
        if (l.avatar_url && signedMap[l.avatar_url]) {
          byUser[l.id] = signedMap[l.avatar_url];
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
      .channel('realtime-lecturers-profiles')
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
    setNip('');
    setEmail('');
    setPassword('');
    setRoleCode('supervisor');
    setProgId(profile?.program_id || programs[0]?.id || '');
    setPosition('Lektor');
    setResearchField('');
    setQuota(10);
    setSchedule('');
    setModalOpen(true);
  };

  const openEdit = (l: Profile) => {
    setEditing(l);
    setFullName(l.full_name);
    setNip(l.nim_nip || '');
    setEmail(l.email || '');
    setRoleCode(l.role_code === 'examiner' ? 'examiner' : 'supervisor');
    setProgId(l.program_id || '');
    setPosition(l.position || 'Lektor');
    setResearchField(l.research_field || '');
    setQuota(l.max_supervisee_quota || 10);
    setSchedule(l.consultation_schedule || '');
    setModalOpen(true);
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
          showToast('Gagal memperbarui email dosen', 'error', emailErr.message);
          return;
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          nim_nip: nip.trim() || null,
          program_id: progId || null,
          position: position.trim() || null,
          research_field: researchField.trim() || null,
          max_supervisee_quota: quota,
          consultation_schedule: schedule.trim() || null,
        })
        .eq('id', editing.id);

      if (!error && editing.role_code !== roleCode && profile?.role_code === 'super_admin') {
        await supabase.rpc('admin_update_user_role', {
          p_target_user_id: editing.id,
          p_new_role_code: roleCode,
        });
      }

      setSaving(false);
      if (error) {
        showToast('Gagal memperbarui dosen', 'error', error.message);
        return;
      }
      await logActivity('update_lecturer', 'profiles', editing.id, { nip, email: normalizedNewEmail });
      showToast('Data & email dosen diperbarui', 'success');
      setModalOpen(false);
      loadData(false);
    } else {
      const { data: created, error: createErr } = await supabase.rpc('admin_create_user_account', {
        p_full_name: fullName.trim(),
        p_nim_nip: nip.trim(),
        p_password: password || 'TaflowDosen123!',
        p_role_code: roleCode,
        p_department_id: null,
        p_program_id: progId || null,
        p_entry_year: null,
        p_email: email.trim() || null,
        p_position: position.trim() || null,
        p_research_field: researchField.trim() || null,
        p_max_supervisee_quota: quota,
        p_consultation_schedule: schedule.trim() || null,
      });
      setSaving(false);
      if (createErr) {
        showToast('Gagal menambahkan dosen', 'error', createErr.message);
        return;
      }
      const userId = (created as { user_id?: string } | null)?.user_id;
      if (userId) {
        await logActivity('create_lecturer', 'profiles', userId, { roleCode });
      }
      showToast('Dosen berhasil ditambahkan', 'success');
      setModalOpen(false);
      loadData(false);
    }
  };

  const toggleActive = async (l: Profile) => {
    const next = !l.is_active;
    const { error } = await supabase.from('profiles').update({ is_active: next }).eq('id', l.id);
    if (error) {
      showToast('Gagal mengubah status akun', 'error', error.message);
      return;
    }
    await logActivity(next ? 'activate_account' : 'deactivate_account', 'profiles', l.id, {});
    showToast(next ? 'Akun dosen diaktifkan' : 'Akun dosen dinonaktifkan', 'success');
    loadData(false);
  };

  const openInspect = async (l: Profile) => {
    setInspectLecturer(l);
    const { data } = await supabase
      .from('thesis_supervisors')
      .select('*, student:profiles!thesis_supervisors_student_id_fkey(*), thesis:thesis_submissions(*)')
      .eq('lecturer_id', l.id)
      .eq('status', 'active');
    setSupervisees((data || []) as ThesisSupervisor[]);
  };

  const columns: ColumnDef<Profile>[] = [
    {
      key: 'name',
      header: 'Nama Dosen',
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
      header: 'Prodi & Jabatan',
      render: (r) => (
        <div>
          <p>{r.program?.name || '—'}</p>
          <p className="text-[11px] text-slate-500">{r.position || 'Dosen'}</p>
        </div>
      ),
    },
    {
      key: 'field',
      header: 'Bidang Riset',
      render: (r) => <span className="text-slate-600 dark:text-slate-300">{r.research_field || '—'}</span>,
    },
    {
      key: 'quota',
      header: 'Beban / Kuota',
      align: 'right',
      render: (r) => (
        <span className="font-mono tabular-nums">
          {loads[r.id] || 0} / {r.max_supervisee_quota}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
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
            onClick={() => openInspect(r)}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Daftar Bimbingan & Profil"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => openEdit(r)}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Edit Dosen & Email"
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
          <h1 className="text-xl font-bold tracking-tight">Lecturer Management</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Kelola data dosen pembimbing/penguji, email akun, foto profil, bidang riset, dan kuota bimbingan.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Tambah Dosen
        </button>
      </div>

      <DataTable
        data={lecturers}
        columns={columns}
        keyField={(r) => r.id}
        loading={loading}
        searchPlaceholder="Cari nama, NIP, email, atau bidang riset..."
        searchFilter={(r, q) =>
          r.full_name.toLowerCase().includes(q) ||
          (r.nim_nip || '').toLowerCase().includes(q) ||
          (r.email || '').toLowerCase().includes(q) ||
          (r.research_field || '').toLowerCase().includes(q)
        }
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Profil Dosen' : 'Tambah Dosen Baru'}
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
              <label className="block font-medium mb-1">Nama Lengkap & Gelar *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">NIP / NIDN *</label>
              <input
                type="text"
                required
                value={nip}
                onChange={(e) => setNip(e.target.value)}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Peran Utama</label>
              <select
                value={roleCode}
                disabled={Boolean(editing) && profile?.role_code !== 'super_admin'}
                onChange={(e) => setRoleCode(e.target.value as 'supervisor' | 'examiner')}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
              >
                <option value="supervisor">Dosen Pembimbing</option>
                <option value="examiner">Dosen Penguji</option>
              </select>
            </div>
            <div className={editing ? 'sm:col-span-2' : ''}>
              <label className="block font-medium mb-1">
                {editing ? 'Email Akun *' : 'Email (Opsional)'}
              </label>
              <input
                type="text"
                inputMode="email"
                required={Boolean(editing)}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={editing ? 'dosen@kampus.ac.id' : 'Boleh kosong / dummy'}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            {!editing && (
              <div>
                <label className="block font-medium mb-1">Kata Sandi Awal *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            )}
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
              <label className="block font-medium mb-1">Kuota Mahasiswa Bimbingan</label>
              <input
                type="number"
                min={1}
                max={50}
                value={quota}
                onChange={(e) => setQuota(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Jabatan Fungsional</label>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Bidang Penelitian</label>
              <input
                type="text"
                value={researchField}
                onChange={(e) => setResearchField(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Jadwal Konsultasi</label>
              <input
                type="text"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="Senin & Rabu, 09:00 - 11:30 WIB"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
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
        open={Boolean(inspectLecturer)}
        onClose={() => setInspectLecturer(null)}
        title={`Mahasiswa Bimbingan — ${inspectLecturer?.full_name || ''}`}
        subtitle={`NIP: ${inspectLecturer?.nim_nip || '—'} · ${inspectLecturer?.email || ''}`}
      >
        <div className="space-y-4 text-xs">
          {inspectLecturer && (
            <div className="flex items-center gap-3.5 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <UserAvatar
                name={inspectLecturer.full_name}
                src={avatarUrls[inspectLecturer.id]}
                size="lg"
                onClick={
                  avatarUrls[inspectLecturer.id]
                    ? () =>
                        setPreviewAvatar({
                          name: inspectLecturer.full_name,
                          src: avatarUrls[inspectLecturer.id],
                          sub: inspectLecturer.nim_nip || inspectLecturer.email,
                        })
                    : undefined
                }
              />
              <div className="min-w-0">
                <p className="font-semibold text-sm">{inspectLecturer.full_name}</p>
                <p className="font-mono text-[11px] text-slate-500 truncate">{inspectLecturer.email}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {inspectLecturer.position || 'Dosen'} · {inspectLecturer.program?.name || '—'}
                </p>
              </div>
            </div>
          )}

          {supervisees.length === 0 ? (
            <p className="text-slate-500 text-center py-8">Belum ada mahasiswa bimbingan aktif.</p>
          ) : (
            supervisees.map((s) => (
              <div key={s.id} className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{s.student?.full_name}</span>
                  <span className="text-blue-700 dark:text-cyan-400">
                    {s.supervisor_role === 'primary' ? 'Pembimbing 1' : 'Pembimbing 2'}
                  </span>
                </div>
                <p className="font-mono text-slate-500">{s.student?.nim_nip}</p>
                <p className="text-slate-700 dark:text-slate-300">{s.thesis?.title}</p>
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
