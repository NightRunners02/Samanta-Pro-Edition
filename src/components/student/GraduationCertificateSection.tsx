import { useEffect, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  History,
  Loader2,
  QrCode,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import {
  buildCertificateVerificationUrl,
  downloadCertificatePdf,
  getSignedCertificateUrl,
} from '../../lib/certificateService';
import { cn, formatDate } from '../../lib/utils';
import type {
  GraduationCertificate,
  GraduationRecord,
  Profile,
  ThesisSubmission,
} from '../../types/database';
import { Modal } from '../ui/Modal';

interface GraduationCertificateSectionProps {
  profile: Profile | null;
  thesis: ThesisSubmission | null;
  graduation: GraduationRecord | null;
  certificates: GraduationCertificate[];
}

export function GraduationCertificateSection({
  profile,
  thesis,
  graduation,
  certificates,
}: GraduationCertificateSectionProps) {
  const { showToast } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewCert, setPreviewCert] = useState<GraduationCertificate | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const sortedVersions = [...certificates].sort((a, b) => b.version - a.version);
  const latestCert = sortedVersions.find((c) => c.is_latest) || sortedVersions[0] || null;
  const isGraduated = graduation?.status === 'graduated';
  const showCertificateCard = Boolean(isGraduated && latestCert);

  useEffect(() => {
    let active = true;

    if (!previewCert) {
      setPreviewSignedUrl(null);
      setPreviewError(null);
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    const loadPreview = async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      const signed = await getSignedCertificateUrl(previewCert, 3600);
      if (!active) return;

      if (!signed) {
        setPreviewSignedUrl(null);
        setPreviewError('Gagal membuat Signed URL untuk pratinjau sertifikat PDF.');
        setPreviewLoading(false);
        return;
      }

      setPreviewSignedUrl(signed);
      try {
        const res = await fetch(signed);
        if (res.ok) {
          const blob = await res.blob();
          const pdfBlob = new Blob([blob], { type: 'application/pdf' });
          const objUrl = URL.createObjectURL(pdfBlob);
          if (!active) {
            URL.revokeObjectURL(objUrl);
            return;
          }
          setPreviewBlobUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return objUrl;
          });
        }
      } catch {
        // Fallback smoothly to signed URL directly in iframe
      }
      if (active) setPreviewLoading(false);
    };

    loadPreview();

    return () => {
      active = false;
    };
  }, [previewCert]);

  useEffect(() => {
    return () => {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewBlobUrl]);

  const handleDownload = async (cert: GraduationCertificate) => {
    setDownloadingId(cert.id);
    const { error } = await downloadCertificatePdf(cert);
    setDownloadingId(null);
    if (error) {
      showToast('Gagal mengunduh sertifikat PDF', 'error', error);
      return;
    }
    showToast('Sertifikat Kelulusan berhasil diunduh', 'success');
  };

  const iframeSrc = previewBlobUrl || previewSignedUrl;

  const studentName =
    latestCert?.certificate_metadata?.student_name || profile?.full_name || '—';
  const studentNim =
    latestCert?.certificate_metadata?.student_nim || profile?.nim_nip || '—';
  const programName =
    latestCert?.certificate_metadata?.program_name ||
    (profile?.program
      ? `${profile.program.degree_level ? `${profile.program.degree_level} ` : ''}${profile.program.name}`
      : 'Program Studi');
  const thesisTitle =
    latestCert?.certificate_metadata?.thesis_title || thesis?.title || '—';

  const isRevoked = latestCert?.certificate_status === 'revoked';

  return (
    <section
      aria-labelledby="sertifikat-kelulusan-heading"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2
            id="sertifikat-kelulusan-heading"
            className="text-sm font-semibold text-slate-900 dark:text-slate-100"
          >
            Sertifikat Kelulusan
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Sertifikat resmi kelulusan Tugas Akhir yang diterbitkan otomatis setelah yudisium divalidasi Graduated / Selesai.
          </p>
        </div>

        {showCertificateCard && latestCert && (
          <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
            <span className="text-slate-500 dark:text-slate-400">Versi v{latestCert.version}</span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
            <span
              className={cn(
                'inline-flex items-center gap-1 font-sans font-medium',
                isRevoked
                  ? 'text-rose-700 dark:text-rose-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              )}
            >
              {isRevoked ? (
                <XCircle className="w-3.5 h-3.5" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              {isRevoked ? 'Revoked / Tidak Berlaku' : 'Valid & Terverifikasi'}
            </span>
          </div>
        )}
      </div>

      {!showCertificateCard ? (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-400 dark:text-slate-500 shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Sertifikat Belum Tersedia
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
                {isGraduated
                  ? 'Status kelulusan Anda telah ditetapkan Selesai. Dokumen sertifikat PDF sedang diproses oleh sistem dan akan segera tersedia otomatis.'
                  : 'Sertifikat belum tersedia karena proses kelulusan dan yudisium belum selesai. Sertifikat akan diterbitkan otomatis setelah seluruh persyaratan terpenuhi dan Admin menetapkan status Anda menjadi Graduated / Selesai.'}
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 shrink-0">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {graduation?.status
                ? `Status Yudisium: ${graduation.status.replace(/_/g, ' ')}`
                : 'Belum Mengajukan Yudisium'}
            </span>
          </div>
        </div>
      ) : (
        latestCert && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-5 space-y-5">
            {/* Header Strip */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-3.5 min-w-0">
                <div
                  className={cn(
                    'w-11 h-11 rounded-lg border flex items-center justify-center shrink-0',
                    isRevoked
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-400'
                      : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-cyan-400'
                  )}
                >
                  <Award className="w-5 h-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Sertifikat Kelulusan Tugas Akhir
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{studentName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{studentNim}</span>
                    <span aria-hidden="true">·</span>
                    <span>{programName}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 text-xs font-semibold',
                    isRevoked
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  )}
                >
                  {isRevoked ? (
                    <XCircle className="w-4 h-4" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{isRevoked ? 'Revoked / Tidak Berlaku' : 'Diterbitkan · Valid'}</span>
                </span>
              </div>
            </div>

            {isRevoked && (
              <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/20 px-4 py-3 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Sertifikat ini telah dibatalkan oleh Administrator.</p>
                  {latestCert.revocation_reason && (
                    <p className="mt-0.5">Alasan: {latestCert.revocation_reason}</p>
                  )}
                </div>
              </div>
            )}

            {/* Metadata Grid */}
            <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-xs">
              <div>
                <dt className="text-[11px] text-slate-500 dark:text-slate-400">Nomor Sertifikat</dt>
                <dd
                  className="font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5 truncate"
                  title={latestCert.certificate_number}
                >
                  {latestCert.certificate_number}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500 dark:text-slate-400">Tanggal Kelulusan</dt>
                <dd className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                  {formatDate(latestCert.graduation_date)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500 dark:text-slate-400">Program Studi</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                  {programName}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500 dark:text-slate-400">Kode Verifikasi QR</dt>
                <dd className="font-mono font-medium text-blue-700 dark:text-cyan-400 mt-0.5 truncate">
                  {latestCert.verification_code}
                </dd>
              </div>
              <div className="md:col-span-2 lg:col-span-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                <dt className="text-[11px] text-slate-500 dark:text-slate-400">Judul Tugas Akhir</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5 leading-relaxed">
                  {thesisTitle}
                </dd>
              </div>
            </dl>

            {/* Footer Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="font-mono tabular-nums">
                  Diterbitkan: {formatDate(latestCert.issue_date)}
                </span>
                <span aria-hidden="true">·</span>
                <a
                  href={buildCertificateVerificationUrl(latestCert.verification_code)}
                  className="inline-flex items-center gap-1 text-blue-700 dark:text-cyan-400 hover:underline font-medium"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Halaman Verifikasi QR</span>
                </a>
                {sortedVersions.length > 1 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => setPreviewCert(latestCert)}
                      className="inline-flex items-center gap-1 text-blue-700 dark:text-cyan-400 hover:underline font-medium"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Riwayat Versi ({sortedVersions.length})</span>
                    </button>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setPreviewCert(latestCert)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview Sertifikat</span>
                </button>

                <button
                  type="button"
                  disabled={downloadingId === latestCert.id}
                  onClick={() => handleDownload(latestCert)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50 transition-colors"
                >
                  {downloadingId === latestCert.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>Download PDF</span>
                </button>
              </div>
            </div>
          </div>
        )
      )}

      {/* Certificate Preview & Version History Modal */}
      {previewCert && (
        <Modal
          open={Boolean(previewCert)}
          onClose={() => setPreviewCert(null)}
          title={`Preview Sertifikat Kelulusan — ${previewCert.certificate_number}`}
          subtitle={`Versi v${previewCert.version} · Status: ${
            previewCert.certificate_status === 'valid' ? 'Valid' : 'Revoked / Tidak Berlaku'
          } · Kode QR: ${previewCert.verification_code}`}
          maxWidth="2xl"
          footer={
            <div className="w-full flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {sortedVersions.length > 1 && (
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <History className="w-3.5 h-3.5 text-slate-400" />
                    <span>Versi:</span>
                    <select
                      value={previewCert.id}
                      onChange={(e) => {
                        const found = sortedVersions.find((v) => v.id === e.target.value);
                        if (found) setPreviewCert(found);
                      }}
                      className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                      {sortedVersions.map((v) => (
                        <option key={v.id} value={v.id}>
                          v{v.version} — {v.certificate_number} ({v.certificate_status.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {previewSignedUrl && (
                  <a
                    href={previewSignedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Buka Tab Baru</span>
                  </a>
                )}
                <button
                  type="button"
                  disabled={downloadingId === previewCert.id}
                  onClick={() => handleDownload(previewCert)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50 transition-colors"
                >
                  {downloadingId === previewCert.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>Download PDF</span>
                </button>
              </div>
            </div>
          }
        >
          {previewLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2 text-blue-600" />
              <p className="text-xs">Memuat Sertifikat PDF resmi melalui Signed URL...</p>
            </div>
          )}

          {!previewLoading && previewError && (
            <div className="py-12 text-center text-xs text-rose-600 dark:text-rose-400">
              {previewError}
            </div>
          )}

          {!previewLoading && !previewError && iframeSrc && (
            <iframe
              src={iframeSrc}
              title={`Preview Sertifikat ${previewCert.certificate_number}`}
              className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950"
            />
          )}
        </Modal>
      )}
    </section>
  );
}
