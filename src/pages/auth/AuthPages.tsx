import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Moon,
  RefreshCw,
  Sun,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { formatSupabaseError, supabase } from '../../lib/supabase';
import type { Department, Program } from '../../types/database';

type AuthView = 'login' | 'register' | 'forgot' | 'reset';

export function AuthPages() {
  const {
    signInWithIdentifier,
    signUpStudent,
    sendPasswordReset,
    updatePassword,
    isPasswordRecovery,
    systemSettings,
  } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();

  const [view, setView] = useState<AuthView>(isPasswordRecovery ? 'reset' : 'login');
  const [submitting, setSubmitting] = useState(false);
  const [showPass, setShowPass] = useState(false);

  // Login state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  // Register state
  const [fullName, setFullName] = useState('');
  const [nim, setNim] = useState('');
  const [email, setEmail] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');
  const [entryYear, setEntryYear] = useState(new Date().getFullYear());
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Forgot / Reset state
  const [forgotEmail, setForgotEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Reference options from DB
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loadingRef, setLoadingRef] = useState(true);
  const [refError, setRefError] = useState<string | null>(null);

  useEffect(() => {
    if (isPasswordRecovery) setView('reset');
  }, [isPasswordRecovery]);

  const loadRef = useCallback(async () => {
    setLoadingRef(true);
    setRefError(null);
    const [
      { data: deptData, error: deptError },
      { data: progData, error: progError },
    ] = await Promise.all([
      supabase.from('departments').select('*').eq('is_active', true).order('name'),
      supabase.from('programs').select('*').eq('is_active', true).order('name'),
    ]);

    if (deptError || progError) {
      const msg = formatSupabaseError(
        deptError || progError,
        'Gagal memuat daftar fakultas & program studi.'
      );
      setRefError(msg);
      setLoadingRef(false);
      return;
    }

    const loadedDepts = (deptData || []) as Department[];
    const loadedProgs = (progData || []) as Program[];
    setDepartments(loadedDepts);
    setPrograms(loadedProgs);

    setDepartmentId((prevDept) => {
      const nextDept = loadedDepts.some((d) => d.id === prevDept)
        ? prevDept
        : loadedDepts[0]?.id || '';
      const matchingProgs = loadedProgs.filter((p) => p.department_id === nextDept);
      setProgramId((prevProg) =>
        matchingProgs.some((p) => p.id === prevProg) ? prevProg : matchingProgs[0]?.id || ''
      );
      return nextDept;
    });

    setLoadingRef(false);
  }, []);

  useEffect(() => {
    loadRef();
  }, [loadRef]);

  const filteredPrograms = useMemo(
    () => programs.filter((p) => !departmentId || p.department_id === departmentId),
    [programs, departmentId]
  );

  const handleFacultyChange = (nextDeptId: string) => {
    setDepartmentId(nextDeptId);
    const matching = programs.filter((p) => p.department_id === nextDeptId);
    setProgramId(matching[0]?.id || '');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signInWithIdentifier(identifier, password);
    setSubmitting(false);

    if (error) {
      showToast('Gagal masuk', 'error', error);
      return;
    }
    showToast('Berhasil masuk ke TAFlow', 'success');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !nim.trim() || !departmentId || !programId) {
      showToast('Data belum lengkap', 'warning', 'Mohon lengkapi nama, NIM, fakultas, dan program studi.');
      return;
    }
    if (regPassword.length < 8) {
      showToast('Kata sandi terlalu pendek', 'warning', 'Minimal 8 karakter.');
      return;
    }
    if (regPassword !== confirmPassword) {
      showToast('Konfirmasi kata sandi tidak cocok', 'error');
      return;
    }

    setSubmitting(true);
    const { error } = await signUpStudent({
      fullName,
      nim,
      email: email.trim() || undefined,
      departmentId,
      programId,
      entryYear,
      password: regPassword,
    });
    setSubmitting(false);

    if (error) {
      showToast('Pendaftaran gagal', 'error', error);
      return;
    }

    showToast('Pendaftaran berhasil', 'success', 'Selamat datang di TAFlow.');
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      showToast('Masukkan email akademik Anda', 'warning');
      return;
    }
    setSubmitting(true);
    const { error } = await sendPasswordReset(forgotEmail);
    setSubmitting(false);
    if (error) {
      showToast('Gagal mengirim tautan reset', 'error', error);
      return;
    }
    showToast('Tautan reset terkirim', 'success', 'Silakan periksa email Anda untuk mengatur ulang kata sandi.');
    setView('login');
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8 || newPassword !== confirmNewPassword) {
      showToast('Kata sandi tidak valid', 'warning', 'Minimal 8 karakter dan konfirmasi harus sama.');
      return;
    }
    setSubmitting(true);
    const { error } = await updatePassword(newPassword);
    setSubmitting(false);
    if (error) {
      showToast('Gagal memperbarui kata sandi', 'error', error);
      return;
    }
    showToast('Kata sandi berhasil diperbarui', 'success');
    setView('login');
  };

  const appName = systemSettings?.app_name || 'TAFlow';

  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Left Institutional Showcase Panel */}
      <div className="hidden lg:flex lg:col-span-6 relative overflow-hidden bg-slate-900 flex-col justify-between p-10 text-white">
        <img
          src="/src/assets/images/taflow_campus_architecture_1795267592702.jpg"
          alt="Perpustakaan riset akademik modern"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/75 to-slate-950/60" />

        <div className="relative z-10 flex items-center gap-3">
          <img
            src="/src/assets/images/taflow_academic_crest_1795267591909.jpg"
            alt={appName}
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-lg object-cover border border-white/20"
          />
          <span className="text-xl font-bold tracking-tight font-display">{appName}</span>
        </div>

        <div className="relative z-10 max-w-lg space-y-5">
          <h1 className="text-3xl font-bold tracking-tight leading-tight text-balance">
            Platform Terpadu Manajemen Tugas Akhir Akademik
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Mengelola seluruh siklus tugas akhir secara transparan dan terstruktur — mulai dari pengajuan judul, penetapan dosen pembimbing, bimbingan digital, seminar proposal, sidang akhir, penilaian rubrik, verifikasi plagiasi, hingga yudisium.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/15 text-xs">
            <div>
              <p className="font-semibold text-white">9 Tahap Terpantau</p>
              <p className="text-slate-400 mt-0.5">Alur progres otomatis</p>
            </div>
            <div>
              <p className="font-semibold text-white">Signed Document</p>
              <p className="text-slate-400 mt-0.5">Private storage terenkripsi</p>
            </div>
            <div>
              <p className="font-semibold text-white">Deteksi Bentrok</p>
              <p className="text-slate-400 mt-0.5">Validasi jadwal ujian</p>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-400">
          {appName} Academic Information System
        </p>
      </div>

      {/* Right Authentication Form Panel */}
      <div className="lg:col-span-6 flex flex-col justify-between p-6 sm:p-10 lg:p-14 bg-white dark:bg-slate-950">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 lg:hidden">
            <img
              src="/src/assets/images/taflow_academic_crest_1795267591909.jpg"
              alt={appName}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-lg object-cover"
            />
            <span className="text-lg font-bold tracking-tight font-display">{appName}</span>
          </div>
          <div className="hidden lg:block" />
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Ubah tema"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <div className="w-full max-w-md mx-auto my-auto py-8">
          {view === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Masuk ke {appName}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Mahasiswa masuk dengan NIM, sedangkan Dosen &amp; Admin menggunakan NIP atau NIDN.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    NIM / NIP / NIDN
                  </label>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Mahasiswa: NIM · Dosen/Admin: NIP atau NIDN"
                    className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Kata Sandi
                    </label>
                    <button
                      type="button"
                      onClick={() => setView('forgot')}
                      className="text-xs font-medium text-blue-700 dark:text-cyan-400 hover:underline"
                    >
                      Lupa kata sandi?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Masukkan kata sandi"
                      className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      aria-label="Tampilkan kata sandi"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Masuk
              </button>

              <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                Mahasiswa belum memiliki akun?{' '}
                <button
                  type="button"
                  onClick={() => setView('register')}
                  className="font-semibold text-blue-700 dark:text-cyan-400 hover:underline"
                >
                  Daftar Akun Mahasiswa
                </button>
              </p>
            </form>
          )}

          {view === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Registrasi Mahasiswa</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Akun baru otomatis terdaftar dengan hak akses Mahasiswa. Perubahan role hanya dapat dilakukan oleh Administrator.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nama lengkap sesuai KTM"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    NIM
                  </label>
                  <input
                    type="text"
                    required
                    value={nim}
                    onChange={(e) => setNim(e.target.value)}
                    placeholder="202310370311001"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tahun Masuk
                  </label>
                  <input
                    type="number"
                    required
                    min={2015}
                    max={2035}
                    value={entryYear}
                    onChange={(e) => setEntryYear(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Email <span className="font-normal text-slate-400">(Opsional)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Opsional — boleh dikosongkan atau isi email dummy"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                  />
                </div>

                {refError && (
                  <div className="sm:col-span-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 flex items-start justify-between gap-3 text-xs text-red-700 dark:text-red-300">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Gagal memuat Fakultas &amp; Program Studi</p>
                        <p className="text-[11px] opacity-90 mt-0.5">{refError}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={loadRef}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 text-[11px] font-medium hover:bg-red-50 shrink-0"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Muat Ulang
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Fakultas
                  </label>
                  <select
                    required
                    disabled={loadingRef || departments.length === 0}
                    value={departmentId}
                    onChange={(e) => handleFacultyChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30 disabled:opacity-60"
                  >
                    {loadingRef ? (
                      <option value="">Memuat fakultas...</option>
                    ) : departments.length === 0 ? (
                      <option value="">Belum ada fakultas aktif</option>
                    ) : (
                      <>
                        <option value="" disabled>
                          -- Pilih Fakultas --
                        </option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Program Studi
                  </label>
                  <select
                    required
                    disabled={loadingRef || filteredPrograms.length === 0}
                    value={programId}
                    onChange={(e) => setProgramId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30 disabled:opacity-60"
                  >
                    {loadingRef ? (
                      <option value="">Memuat program studi...</option>
                    ) : filteredPrograms.length === 0 ? (
                      <option value="">Belum ada prodi pada fakultas ini</option>
                    ) : (
                      <>
                        <option value="" disabled>
                          -- Pilih Program Studi --
                        </option>
                        {filteredPrograms.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.degree_level} {p.name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Kata Sandi
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Minimal 8 karakter"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Konfirmasi Kata Sandi
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi kata sandi"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Buat Akun Mahasiswa
              </button>

              <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                Sudah memiliki akun?{' '}
                <button
                  type="button"
                  onClick={() => setView('login')}
                  className="font-semibold text-blue-700 dark:text-cyan-400 hover:underline"
                >
                  Kembali ke halaman Masuk
                </button>
              </p>
            </form>
          )}

          {view === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-5">
              <button
                type="button"
                onClick={() => setView('login')}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Kembali ke Login
              </button>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Lupa Kata Sandi</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Masukkan email akademik terdaftar untuk menerima tautan pengaturan ulang kata sandi.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Email Akademik
                </label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="nama@kampus.ac.id"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Kirim Tautan Reset
              </button>
            </form>
          )}

          {view === 'reset' && (
            <form onSubmit={handleReset} className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Atur Ulang Kata Sandi</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Masukkan kata sandi baru untuk akun TAFlow Anda.
                </p>
              </div>
              <div className="space-y-3.5">
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
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
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
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Simpan Kata Sandi Baru
              </button>
            </form>
          )}
        </div>

        <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center lg:text-left">
          Dilindungi dengan Supabase Row Level Security &amp; Enkripsi Dokumen Akademik.
        </p>
      </div>
    </div>
  );
}
