import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileBadge2,
  FileCheck2,
  History,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { downloadDecreePdf } from '../../lib/decreeService';
import { getSignedDocumentUrl, supabase } from '../../lib/supabase';
import { cn, formatDate } from '../../lib/utils';
import type { DecreeType, OfficialDecree } from '../../types/database';
import { Modal } from '../ui/Modal';

interface SupportingDecreesSectionProps {
  decrees: OfficialDecree[];
  supervisorEligible: boolean;
  examinerEligible: boolean;
  generatingType: DecreeType | null;
}

interface DecreeCardSpec {
  type: DecreeType;
  title: string;
  description: string;
  requirementHint: string;
  eligible: boolean;
}

const DECREE_SPECS: Array<Omit<DecreeCardSpec, 'eligible'>> = [
  {
    type: 'sk_pembimbing',
    title: 'SK Pembimbing',
    description:
      'Surat Keputusan resmi penetapan Dosen Pembimbing Tugas Akhir yang diterbitkan setelah judul TA disetujui dan pembimbing ditetapkan.',
    requirementHint:
      'Otomatis tersedia setelah judul TA disetujui admin dan dosen pembimbing ditetapkan.',
  },
  {
    type: 'sk_penguji',
    title: 'SK Penguji',
    description:
      'Surat Keputusan resmi penetapan Ketua dan Anggota Dewan Penguji Sidang Tugas Akhir oleh Program Studi.',
    requirementHint:
      'Otomatis tersedia setelah dosen penguji sidang ditetapkan dan disetujui admin.',
  },
];

export function SupportingDecreesSection({
  decrees,
  supervisorEligible,
  examinerEligible,
  generatingType,
}: SupportingDecreesSectionProps) {
  const { showToast } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{
    decree: OfficialDecree;
    versions: OfficialDecree[];
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const loadPreviewBinary = async (target: OfficialDecree) => {
    setPreviewLoading(true);
    setPreviewError(null);

    const [{ data: blob, error: dlErr }, signed] = await Promise.all([
      supabase.storage.from(target.bucket_name || 'official-decrees').download(target.file_path),
      getSignedDocumentUrl(target.bucket_name || 'official-decrees', target.file_path, 3600),
    ]);

    setPreviewSignedUrl(signed);

    if (dlErr || !blob) {
      if (signed) {
        setPreviewBlobUrl(null);
      } else {
        setPreviewError(dlErr?.message || 'Gagal memuat file PDF dari Supabase Storage.');
      }
      setPreviewLoading(false);
      return;
    }

    const pdfBlob = new Blob([blob], { type: 'application/pdf' });
    const nextObjUrl = URL.createObjectURL(pdfBlob);
    setPreviewBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return nextObjUrl;
    });
    setPreviewLoading(false);
  };

  useEffect(() => {
    if (!previewState) {
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewSignedUrl(null);
      setPreviewError(null);
      return;
    }
    loadPreviewBinary(previewState.decree);
  }, [previewState?.decree.id]);

  useEffect(() => {
    return () => {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewBlobUrl]);

  const handleDownload = async (decree: OfficialDecree) => {
    setDownloadingId(decree.id);
    const { error } = await downloadDecreePdf(decree);
    setDownloadingId(null);
    if (error) {
      showToast('Gagal mengunduh PDF', 'error', error);
      return;
    }
    showToast(`${decree.decree_type === 'sk_pembimbing' ? 'SK Pembimbing' : 'SK Penguji'} berhasil diunduh`, 'success');
  };

  const getVersionsForType = (type: DecreeType) =>
    decrees
      .filter((d) => d.decree_type === type)
      .sort((a, b) => b.version_number - a.version_number);

  const cards: DecreeCardSpec[] = DECREE_SPECS.map((spec) => ({
    ...spec,
    eligible: spec.type === 'sk_pembimbing' ? supervisorEligible : examinerEligible,
  }));

  const iframeSrc = previewBlobUrl || previewSignedUrl;

  return (
    <section
      aria-labelledby="berkas-pendukung-heading"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 id="berkas-pendukung-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Berkas Pendukung
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Surat Keputusan resmi penetapan pembimbing dan penguji tugas akhir dalam format PDF A4.
          </p>
        </div>
        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
          {
            cards.filter((c) => {
              const latest = getVersionsForType(c.type)[0];
              return Boolean(latest);
            }).length
          }
          /2 Dokumen Tersedia
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cards.map((card) => {
          const versions = getVersionsForType(card.type);
          const latest = versions.find((v) => v.is_latest) || versions[0] || null;
          const isAvailable = Boolean(latest);
          const isGenerating = generatingType === card.type && !latest;
          const Icon = card.type === 'sk_pembimbing' ? FileBadge2 : FileCheck2;

          return (
            <div
              key={card.type}
              className={cn(
                'rounded-xl border p-5 flex flex-col justify-between gap-4 transition-colors',
                isAvailable
                  ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40'
                  : 'border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-950/20'
              )}
            >
              <div className="space-y-3.5">
                {/* Header: Icon + Name + Status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg border flex items-center justify-center shrink-0',
                        isAvailable
                          ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-cyan-400'
                          : 'bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                      )}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {card.title}
                        </h3>
                        {latest && (
                          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300">
                            v{latest.version_number}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        {card.description}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  {isGenerating ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 text-[11px] font-medium text-blue-700 dark:text-cyan-400 whitespace-nowrap shrink-0">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Menyiapkan PDF
                    </span>
                  ) : isAvailable ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      Tersedia
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-[11px] font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0">
                      <Clock className="w-3 h-3" />
                      Belum Tersedia
                    </span>
                  )}
                </div>

                {/* Metadata Grid: Nomor Surat & Tanggal Penerbitan */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Nomor Surat</p>
                    <p
                      className={cn(
                        'text-xs font-mono mt-0.5 truncate',
                        latest
                          ? 'font-semibold text-slate-900 dark:text-slate-100'
                          : 'text-slate-400 dark:text-slate-500'
                      )}
                      title={latest?.letter_number || 'Belum diterbitkan'}
                    >
                      {latest?.letter_number || 'Belum diterbitkan'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Tanggal Penerbitan</p>
                    <p
                      className={cn(
                        'text-xs font-mono tabular-nums mt-0.5',
                        latest
                          ? 'font-medium text-slate-900 dark:text-slate-100'
                          : 'text-slate-400 dark:text-slate-500'
                      )}
                    >
                      {latest ? formatDate(latest.issued_date) : 'Belum diterbitkan'}
                    </p>
                  </div>
                </div>

                {/* Contextual notice */}
                {!isAvailable && !isGenerating && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {card.requirementHint}
                  </p>
                )}

                {latest?.needs_reissue && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Terdapat pembaruan data penugasan terbaru. Menunggu penerbitan ulang versi SK oleh Admin Prodi.
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  {versions.length > 1 && latest && (
                    <button
                      type="button"
                      onClick={() => setPreviewState({ decree: latest, versions })}
                      className="inline-flex items-center gap-1 text-blue-700 dark:text-cyan-400 hover:underline font-medium"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Riwayat Versi ({versions.length})</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 ml-auto">
                  <button
                    type="button"
                    disabled={!latest || isGenerating}
                    onClick={() => latest && setPreviewState({ decree: latest, versions })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-45 disabled:pointer-events-none transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </button>

                  <button
                    type="button"
                    disabled={!latest || isGenerating || downloadingId === latest?.id}
                    onClick={() => latest && handleDownload(latest)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-45 disabled:pointer-events-none transition-colors"
                  >
                    {downloadingId === latest?.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Download PDF</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Real PDF Preview & Version History Modal */}
      {previewState && (
        <Modal
          open={Boolean(previewState)}
          onClose={() => setPreviewState(null)}
          title={
            previewState.decree.decree_type === 'sk_pembimbing'
              ? `Preview SK Pembimbing — ${previewState.decree.letter_number}`
              : `Preview SK Penguji — ${previewState.decree.letter_number}`
          }
          subtitle={`Versi v${previewState.decree.version_number} · Diterbitkan ${formatDate(
            previewState.decree.issued_date
          )} oleh ${previewState.decree.issuer_name}`}
          maxWidth="xl"
          footer={
            <div className="w-full flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {previewState.versions.length > 1 && (
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <History className="w-3.5 h-3.5 text-slate-400" />
                    <span>Versi:</span>
                    <select
                      value={previewState.decree.id}
                      onChange={(e) => {
                        const found = previewState.versions.find((v) => v.id === e.target.value);
                        if (found) {
                          setPreviewState({ ...previewState, decree: found });
                        }
                      }}
                      className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                      {previewState.versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          v{v.version_number} — {v.letter_number} ({formatDate(v.issued_date)})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="flex items-center gap-2">
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
                  disabled={downloadingId === previewState.decree.id}
                  onClick={() => handleDownload(previewState.decree)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50 transition-colors"
                >
                  {downloadingId === previewState.decree.id ? (
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
              <p className="text-xs">Memuat pratinjau dokumen PDF resmi dari Supabase Storage...</p>
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
              title={`Preview ${previewState.decree.letter_number}`}
              className="w-full h-[68vh] rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950"
            />
          )}
        </Modal>
      )}
    </section>
  );
}
