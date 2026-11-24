import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Loader2,
  QrCode,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { cn, formatDate, formatDateTime } from '../../lib/utils';
import type { CertificateVerificationResult } from '../../types/database';

interface CertificateVerificationPageProps {
  initialCode: string;
  onExit: () => void;
}

export function CertificateVerificationPage({
  initialCode,
  onExit,
}: CertificateVerificationPageProps) {
  const { systemSettings } = useAuth();
  const [queryCode, setQueryCode] = useState(initialCode);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<CertificateVerificationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchedCode, setSearchedCode] = useState(initialCode);

  const performVerification = useCallback(async (codeToVerify: string) => {
    const clean = codeToVerify.trim();
    if (!clean) {
      setResult(null);
      setErrorMsg(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSearchedCode(clean);

    const { data, error } = await supabase.rpc('verify_graduation_certificate', {
      p_code: clean,
    });

    setLoading(false);
    if (error) {
      setErrorMsg('Gagal memverifikasi sertifikat. Pastikan skema database sertifikat telah aktif.');
      setResult(null);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    setResult((row as CertificateVerificationResult) || null);
  }, []);

  useEffect(() => {
    setQueryCode(initialCode);
    performVerification(initialCode);
  }, [initialCode, performVerification]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryCode.trim()) return;
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('verify_cert', queryCode.trim());
      window.history.replaceState({}, '', url.toString());
    }
    performVerification(queryCode);
  };

  const isValid = result?.certificate_status === 'valid';
  const isRevoked = result?.certificate_status === 'revoked';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between p-4 sm:p-8">
      <div className="w-full max-w-3xl mx-auto space-y-6">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center text-blue-700 dark:text-cyan-400">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">
                Verifikasi Keaslian Sertifikat Kelulusan
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {systemSettings?.app_name || 'TAFlow'} · Portal Validasi Dokumen Resmi Akademik
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke TAFlow</span>
          </button>
        </div>

        {/* Manual Code Lookup Form */}
        <form
          onSubmit={handleSearch}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row gap-3"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={queryCode}
              onChange={(e) => setQueryCode(e.target.value)}
              placeholder="Masukkan Kode Verifikasi (contoh: TFC-...) atau Nomor Sertifikat"
              className="w-full pl-9 pr-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !queryCode.trim()}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            Cek Keaslian
          </button>
        </form>

        {/* Verification Output */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-blue-700 dark:text-cyan-400" />
              <p className="text-xs">Memverifikasi keaslian sertifikat pada registri akademik...</p>
            </div>
          ) : errorMsg ? (
            <div className="p-8 text-center space-y-2">
              <ShieldAlert className="w-8 h-8 text-amber-600 mx-auto" />
              <p className="text-sm font-semibold">Terjadi Kendala Verifikasi</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{errorMsg}</p>
            </div>
          ) : !result ? (
            <div className="p-10 text-center space-y-2.5">
              <div className="w-12 h-12 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
                <XCircle className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Sertifikat Tidak Ditemukan
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Kode verifikasi atau nomor sertifikat{' '}
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                  {searchedCode}
                </span>{' '}
                tidak terdaftar dalam registri kelulusan resmi {systemSettings?.app_name || 'TAFlow'}.
              </p>
            </div>
          ) : (
            <div>
              {/* Status Banner */}
              <div
                className={cn(
                  'px-6 py-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4',
                  isValid
                    ? 'bg-emerald-50/80 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-900/60'
                    : 'bg-rose-50/80 dark:bg-rose-950/25 border-rose-200 dark:border-rose-900/60'
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-lg border flex items-center justify-center shrink-0',
                      isValid
                        ? 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                        : 'bg-white dark:bg-slate-900 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400'
                    )}
                  >
                    {isValid ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <XCircle className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Status Keaslian Sertifikat
                    </p>
                    <h2
                      className={cn(
                        'text-lg font-bold tracking-tight',
                        isValid
                          ? 'text-emerald-800 dark:text-emerald-300'
                          : 'text-rose-800 dark:text-rose-300'
                      )}
                    >
                      {isValid ? 'Valid — Terverifikasi Resmi' : 'Revoked / Tidak Berlaku'}
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      {result.university_name} · {result.faculty_name}
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right text-xs">
                  <p className="text-slate-500 dark:text-slate-400">Kode Verifikasi</p>
                  <p className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {result.verification_code}
                  </p>
                </div>
              </div>

              {/* Revocation Reason Warning */}
              {isRevoked && (
                <div className="px-6 py-3.5 bg-rose-50/40 dark:bg-rose-950/10 border-b border-rose-200/70 dark:border-rose-900/50 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      Sertifikat ini telah dibatalkan oleh Administrator
                      {result.revoked_at ? ` pada ${formatDateTime(result.revoked_at)}` : ''}.
                    </p>
                    {result.revocation_reason && (
                      <p className="mt-0.5 text-rose-700 dark:text-rose-400">
                        Alasan: {result.revocation_reason}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Publicly Allowed Validation Metadata Only */}
              <div className="p-6 space-y-5 text-xs">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Award className="w-4 h-4 text-blue-700 dark:text-cyan-400" />
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {result.certificate_type}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">Versi v{result.version}</span>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5">
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Nomor Sertifikat</dt>
                    <dd className="font-mono font-semibold text-slate-900 dark:text-slate-100 mt-1">
                      {result.certificate_number}
                    </dd>
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5">
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Tanggal Kelulusan</dt>
                    <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-1">
                      {formatDate(result.graduation_date)}
                    </dd>
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5">
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Nama Mahasiswa</dt>
                    <dd className="font-semibold text-sm text-slate-900 dark:text-slate-100 mt-1">
                      {result.student_name}
                    </dd>
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5">
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">NIM</dt>
                    <dd className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100 mt-1">
                      {result.student_nim}
                    </dd>
                  </div>

                  <div className="sm:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3.5">
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Program Studi</dt>
                    <dd className="font-semibold text-slate-900 dark:text-slate-100 mt-1">
                      {result.program_name}
                    </dd>
                  </div>

                  <div className="sm:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3.5">
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Judul Tugas Akhir</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100 mt-1 leading-relaxed">
                      {result.thesis_title}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="max-w-3xl mx-auto w-full pt-6 text-center text-[11px] text-slate-400">
        Verifikasi digital resmi {systemSettings?.app_name || 'TAFlow'} · Hanya menampilkan metadata yang diperlukan untuk validasi keaslian dokumen kelulusan.
      </footer>
    </div>
  );
}
