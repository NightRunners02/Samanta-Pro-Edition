import React, { useEffect, useState } from 'react';
import { Camera, Loader2, Lock, Save, Shield, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getSignedDocumentUrl, logActivity, supabase } from '../../lib/supabase';
import { formatRoleLabel } from '../../lib/utils';

export function ProfileSettingsPage() {
  const { profile, avatarSignedUrl, setAvatarSignedUrl, refreshProfile, updatePassword } = useAuth();
  const { showToast } = useToast();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [researchField, setResearchField] = useState('');
  const [consultationSchedule, setConsultationSchedule] = useState('');
  const [notifPrefs, setNotifPrefs] = useState({
    email: true,
    realtime: true,
    schedule_alerts: true,
    review_alerts: true,
  });
  const [privacyPrefs, setPrivacyPrefs] = useState({
    show_email: true,
    show_phone: false,
  });

  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name || '');
    setPhone(profile.phone || '');
    setResearchField(profile.research_field || '');
    setConsultationSchedule(profile.consultation_schedule || '');
    if (profile.notification_prefs) setNotifPrefs(profile.notification_prefs);
    if (profile.privacy_prefs) setPrivacyPrefs(profile.privacy_prefs);
  }, [profile]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !profile) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      showToast('Format foto tidak valid', 'warning', 'Gunakan gambar PNG, JPG, atau WEBP.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      showToast('Ukuran foto terlalu besar', 'warning', 'Maksimal 3 MB.');
      return;
    }

    const previousSignedUrl = avatarSignedUrl;
    const localObjectUrl = URL.createObjectURL(file);
    setAvatarPreviewUrl(localObjectUrl);
    setAvatarSignedUrl(localObjectUrl);
    setUploadingAvatar(true);

    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${profile.id}/avatar_${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadErr) {
      setAvatarPreviewUrl(null);
      setAvatarSignedUrl(previousSignedUrl);
      URL.revokeObjectURL(localObjectUrl);
      showToast('Gagal mengunggah foto profil', 'error', uploadErr.message);
      setUploadingAvatar(false);
      return;
    }

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ avatar_url: path })
      .eq('id', profile.id);

    setUploadingAvatar(false);
    if (updateErr) {
      setAvatarPreviewUrl(null);
      setAvatarSignedUrl(previousSignedUrl);
      URL.revokeObjectURL(localObjectUrl);
      showToast('Gagal menyimpan foto profil', 'error', updateErr.message);
      return;
    }

    const signed = await getSignedDocumentUrl('avatars', path, 3600);
    if (signed) {
      setAvatarPreviewUrl(signed);
      setAvatarSignedUrl(signed);
    }
    URL.revokeObjectURL(localObjectUrl);
    await refreshProfile();
    await logActivity('update_avatar', 'profiles', profile.id, {});
    showToast('Foto profil berhasil diperbarui', 'success');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        research_field: researchField.trim() || null,
        consultation_schedule: consultationSchedule.trim() || null,
        notification_prefs: notifPrefs,
        privacy_prefs: privacyPrefs,
      })
      .eq('id', profile.id);

    setSavingProfile(false);
    if (error) {
      showToast('Gagal memperbarui profil', 'error', error.message);
      return;
    }
    await refreshProfile();
    await logActivity('update_profile', 'profiles', profile.id, {});
    showToast('Profil & preferensi berhasil disimpan', 'success');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      showToast('Kata sandi minimal 8 karakter', 'warning');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Konfirmasi kata sandi tidak cocok', 'error');
      return;
    }
    setSavingPassword(true);
    const { error } = await updatePassword(newPassword);
    setSavingPassword(false);
    if (error) {
      showToast('Gagal mengubah kata sandi', 'error', error);
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    showToast('Kata sandi berhasil diperbarui', 'success');
  };

  if (!profile) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Pengaturan Profil & Akun</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Kelola identitas akademik, foto profil, keamanan kata sandi, dan preferensi notifikasi.
        </p>
      </div>

      {/* Identity Overview & Avatar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
            {avatarPreviewUrl || avatarSignedUrl ? (
              <img
                src={avatarPreviewUrl || avatarSignedUrl || ''}
                alt={profile.full_name}
                referrerPolicy="no-referrer"
                onError={() => setAvatarPreviewUrl(null)}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-7 h-7 text-slate-400" />
            )}
          </div>
          <div>
            <h2 className="text-base font-semibold">{profile.full_name}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              <span className="font-mono">{profile.nim_nip || 'Tanpa NIM/NIP'}</span>
              <span aria-hidden="true">·</span>
              <span>{formatRoleLabel(profile.role_code)}</span>
              {profile.program?.name && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{profile.program.name}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0">
          {uploadingAvatar ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Camera className="w-3.5 h-3.5" />
          )}
          <span>Ubah Foto Profil</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleAvatarUpload}
            disabled={uploadingAvatar}
          />
        </label>
      </div>

      {/* Edit Profile Form */}
      <form
        onSubmit={handleSaveProfile}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="text-sm font-semibold">Informasi Profil & Preferensi</h3>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
            <Shield className="w-3 h-3" />
            Role tidak dapat diubah melalui profil pribadi
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nama Lengkap
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Email Akademik
            </label>
            <input
              type="email"
              disabled
              value={profile.email}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 text-slate-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              NIM / NIP
            </label>
            <input
              type="text"
              disabled
              value={profile.nim_nip || '—'}
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 text-slate-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nomor Telepon / WhatsApp
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+62 812..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Fakultas
            </label>
            <input
              type="text"
              disabled
              value={profile.department?.name || '—'}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 text-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Program Studi
            </label>
            <input
              type="text"
              disabled
              value={profile.program?.name || '—'}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 text-slate-500"
            />
          </div>

          {(profile.role_code === 'supervisor' || profile.role_code === 'examiner') && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Bidang Penelitian
                </label>
                <input
                  type="text"
                  value={researchField}
                  onChange={(e) => setResearchField(e.target.value)}
                  placeholder="Contoh: Kecerdasan Buatan, Sistem Terdistribusi"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Jadwal Konsultasi
                </label>
                <input
                  type="text"
                  value={consultationSchedule}
                  onChange={(e) => setConsultationSchedule(e.target.value)}
                  placeholder="Contoh: Selasa & Kamis, 10:00–12:00 WIB"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </>
          )}
        </div>

        {/* Notification & Privacy Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="space-y-2.5">
            <p className="text-xs font-semibold">Pengaturan Notifikasi</p>
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={notifPrefs.realtime}
                onChange={(e) => setNotifPrefs({ ...notifPrefs, realtime: e.target.checked })}
                className="rounded border-slate-300 text-blue-700"
              />
              Notifikasi real-time dalam aplikasi
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={notifPrefs.schedule_alerts}
                onChange={(e) => setNotifPrefs({ ...notifPrefs, schedule_alerts: e.target.checked })}
                className="rounded border-slate-300 text-blue-700"
              />
              Pengingat jadwal bimbingan & sidang
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={notifPrefs.review_alerts}
                onChange={(e) => setNotifPrefs({ ...notifPrefs, review_alerts: e.target.checked })}
                className="rounded border-slate-300 text-blue-700"
              />
              Pemberitahuan hasil review & penilaian
            </label>
          </div>

          <div className="space-y-2.5">
            <p className="text-xs font-semibold">Pengaturan Privasi</p>
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={privacyPrefs.show_email}
                onChange={(e) => setPrivacyPrefs({ ...privacyPrefs, show_email: e.target.checked })}
                className="rounded border-slate-300 text-blue-700"
              />
              Tampilkan email akademik ke pembimbing/prodi
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={privacyPrefs.show_phone}
                onChange={(e) => setPrivacyPrefs({ ...privacyPrefs, show_phone: e.target.checked })}
                className="rounded border-slate-300 text-blue-700"
              />
              Tampilkan nomor telepon ke dosen pembimbing
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white transition-colors disabled:opacity-60"
          >
            {savingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Simpan Perubahan Profil
          </button>
        </div>
      </form>

      {/* Change Password */}
      <form
        onSubmit={handleChangePassword}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <Lock className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold">Ubah Kata Sandi</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Kata Sandi Baru
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimal 8 karakter"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Konfirmasi Kata Sandi Baru
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ulangi kata sandi baru"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingPassword}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {savingPassword && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Perbarui Kata Sandi
          </button>
        </div>
      </form>
    </div>
  );
}
