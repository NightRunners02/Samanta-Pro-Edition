import { useState } from 'react';
import { Check, Copy, Database, RefreshCw, ShieldAlert } from 'lucide-react';
import migrationSql from '../../supabase/migrations/0004_taflow_complete.sql?raw';

interface DatabaseSetupViewProps {
  onRetry: () => Promise<void>;
}

export function DatabaseSetupView({ onRetry }: DatabaseSetupViewProps) {
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(migrationSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleVerify = async () => {
    setChecking(true);
    await onRetry();
    setChecking(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-700 dark:text-cyan-400 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Inisialisasi Skema Database Supabase</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Proyek Supabase terhubung, namun tabel atau hak akses schema (<code className="font-mono">GRANT</code>) TAFlow belum terkonfigurasi sepenuhnya. Jalankan skrip <code className="font-mono">0004_taflow_complete.sql</code> di SQL Editor.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleVerify}
            disabled={checking}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Memeriksa...' : 'Verifikasi Koneksi Database'}
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-4 flex items-start gap-3">
            <ShieldAlert className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1 leading-relaxed">
              <p className="font-semibold">Langkah Aktivasi (2 Menit):</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Salin skrip SQL lengkap <code className="font-mono">0004_taflow_complete.sql</code> di bawah ini.</li>
                <li>Buka <strong>Supabase Dashboard &rarr; SQL Editor &rarr; New Query</strong> pada proyek Anda.</li>
                <li>Tempel skrip SQL dan klik <strong>Run</strong> untuk membuat 22 tabel, RLS policies, fungsi RPC, trigger auth, private storage buckets, dan realtime.</li>
                <li>Kembali ke halaman ini lalu klik <strong>Verifikasi Koneksi Database</strong>.</li>
              </ol>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-mono font-medium text-slate-700 dark:text-slate-300">
              <span>supabase/migrations/0004_taflow_complete.sql</span>
              <span className="text-slate-400 dark:text-slate-500">•</span>
              <span>22 Tabel + RLS + RPC + Storage + Seed</span>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Skrip SQL Tersalin' : 'Salin Skrip SQL'}
            </button>
          </div>

          <pre className="w-full h-80 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 p-4 text-[11px] font-mono leading-relaxed">
            {migrationSql}
          </pre>
        </div>
      </div>
    </div>
  );
}
