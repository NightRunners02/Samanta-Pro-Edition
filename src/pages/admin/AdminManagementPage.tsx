import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { useToast } from '../../contexts/ToastContext';
import { getSignedAvatarUrls, logActivity, supabase } from '../../lib/supabase';
import { formatRoleLabel } from '../../lib/utils';
import type { Profile, Program, RoleCode } from '../../types/database';

export function AdminManagementPage() {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [programs, setPrograms] = useState<Program[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const [previewAvatar, setPreviewAvatar] = useState<{ name: string; src: string; sub?: string } | null>(null);

  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<RoleCode>('student');
  const [assignedProgram, setAssignedProgram] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async (withLoader = true) => {
    if (withLoader) setLoading(true);
    const [{ data: uData }, { data: pData }] = await Promise.all([
      supabase.from('profiles').select('*, program:programs(*)').order('full_name'),
      supabase.from('programs').select('*').order('name'),
    ]);

    const list = (uData || []) as Profile[];
    setUsers(list);
    setPrograms((pData || []) as Program[]);

    const paths = list.map((u) => u.avatar_url).filter((p): p is string => Boolean(p));
    if (paths.length > 0) {
      const signedMap = await getSignedAvatarUrls(paths);
      const byUser: Record<string, string> = {};
      for (const u of list) {
        if (u.avatar_url && signedMap[u.avatar_url]) {
          byUser[u.id] = signedMap[u.avatar_url];
        }
      }
      setAvatarUrls(byUser);
    } else {
      setAvatarUrls({});
    }

    if (withLoader) setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel('realtime-admin-users-profiles')
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

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    setSaving(true);

    const normalizedNewEmail = newEmail.trim().toLowerCase();
    const normalizedOldEmail = (selectedUser.email || '').trim().toLowerCase();

    if (normalizedNewEmail && normalizedNewEmail !== normalizedOldEmail) {
      const { error: emailErr } = await supabase.rpc('admin_update_user_email', {
        p_target_user_id: selectedUser.id,
        p_new_email: normalizedNewEmail,
      });
      if (emailErr) {
        setSaving(false);
        showToast('Gagal memperbarui email pengguna', 'error', emailErr.message);
        return;
      }
    }

    const { error } = await supabase.rpc('admin_update_user_role', {
      p_target_user_id: selectedUser.id,
      p_new_role_code: newRole,
    });

    if (!error && assignedProgram !== (selectedUser.program_id || '')) {
      await supabase
        .from('profiles')
        .update({ program_id: assignedProgram || null })
        .eq('id', selectedUser.id);
    }

    setSaving(false);
    if (error) {
      showToast('Gagal mengubah role pengguna', 'error', error.message);
      return;
    }

    await logActivity('update_user_rbac', 'profiles', selectedUser.id, {
      newRole,
      email: normalizedNewEmail,
    });
    setSelectedUser(null);
    showToast('Role, email & hak akses pengguna diperbarui', 'success');
    loadData(false);
  };

  const filtered = roleFilter === 'all' ? users : users.filter((u) => u.role_code === roleFilter);

  const columns: ColumnDef<Profile>[] = [
    {
      key: 'user',
      header: 'Pengguna',
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
      key: 'role',
      header: 'Role Akses',
      sortValue: (r) => r.role_code,
      render: (r) => (
        <span className="font-medium text-blue-700 dark:text-cyan-400">
          {formatRoleLabel(r.role_code)}
        </span>
      ),
    },
    {
      key: 'program',
      header: 'Cakupan Program Studi',
      render: (r) => <span>{r.program?.name || 'Semua Program / Global'}</span>,
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (r) => (
        <button
          type="button"
          onClick={() => {
            setSelectedUser(r);
            setNewEmail(r.email || '');
            setNewRole(r.role_code);
            setAssignedProgram(r.program_id || '');
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Atur Akun & Role
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Admin & Role-Based Access Control</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Kelola peran pengguna, email akun, foto profil, dan cakupan program studi secara realtime melalui database RPC.
        </p>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        keyField={(r) => r.id}
        loading={loading}
        searchPlaceholder="Cari nama, email, atau NIM/NIP..."
        searchFilter={(r, q) =>
          r.full_name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          (r.nim_nip || '').toLowerCase().includes(q)
        }
        toolbarExtra={
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          >
            <option value="all">Semua Role</option>
            <option value="super_admin">Super Admin</option>
            <option value="program_admin">Admin Program Studi</option>
            <option value="supervisor">Dosen Pembimbing</option>
            <option value="examiner">Dosen Penguji</option>
            <option value="student">Mahasiswa</option>
          </select>
        }
      />

      <Modal
        open={Boolean(selectedUser)}
        onClose={() => setSelectedUser(null)}
        title="Atur Role & Data Akun"
        subtitle={selectedUser?.full_name}
        maxWidth="sm"
      >
        <div className="space-y-4 text-xs">
          {selectedUser && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <UserAvatar
                name={selectedUser.full_name}
                src={avatarUrls[selectedUser.id]}
                size="lg"
                onClick={
                  avatarUrls[selectedUser.id]
                    ? () =>
                        setPreviewAvatar({
                          name: selectedUser.full_name,
                          src: avatarUrls[selectedUser.id],
                          sub: selectedUser.nim_nip || selectedUser.email,
                        })
                    : undefined
                }
              />
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{selectedUser.full_name}</p>
                <p className="font-mono text-[11px] text-slate-500">
                  {selectedUser.nim_nip || '—'}
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="block font-medium mb-1">Email Akun *</label>
            <input
              type="text"
              inputMode="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Role Pengguna *</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as RoleCode)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="student">Mahasiswa</option>
              <option value="supervisor">Dosen Pembimbing</option>
              <option value="examiner">Dosen Penguji</option>
              <option value="program_admin">Admin Program Studi</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div>
            <label className="block font-medium mb-1">Program Studi (Wajib untuk Admin Prodi)</label>
            <select
              value={assignedProgram}
              onChange={(e) => setAssignedProgram(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="">-- Global / Semua Prodi --</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSelectedUser(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleUpdateUser}
              className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </div>
      </Modal>

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
