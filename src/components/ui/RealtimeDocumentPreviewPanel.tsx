import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { getSignedDocumentUrl } from '../../lib/supabase';
import { cn, formatDateTime, formatFileSize } from '../../lib/utils';
import type { ThesisDocument } from '../../types/database';
import { StatusBadge } from './StatusBadge';

export interface PreviewDocumentSlot {
  id: string;
  label: string;
  localFile: File | null;
  savedDoc: ThesisDocument | null;
}

interface SavedDocumentCardProps {
  label: string;
  doc: ThesisDocument;
  isActivePreview?: boolean;
  replacedByLocalFile?: File | null;
  onPreview: () => void;
}

export function SavedDocumentCard({
  label,
  doc,
  isActivePreview = false,
  replacedByLocalFile = null,
  onPreview,
}: SavedDocumentCardProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    const url = await getSignedDocumentUrl(doc.bucket_name, doc.file_path, 3600);
    setDownloading(false);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.file_name || 'document';
    a.target = '_blank';
    a.rel = 'noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors space-y-2',
        isActivePreview
          ? 'border-blue-500/70 bg-blue-50/40 dark:bg-blue-950/20 dark:border-cyan-500/60'
          : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 text-blue-700 dark:text-cyan-400">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {doc.file_name}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              {formatFileSize(doc.file_size)} · v{doc.version_number} · {formatDateTime(doc.created_at)}
            </p>
          </div>
        </div>
        <StatusBadge status={doc.status} />
      </div>

      {replacedByLocalFile && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 rounded px-2 py-1">
          Akan diganti dengan berkas baru: <span className="font-medium">{replacedByLocalFile.name}</span>
        </p>
      )}

      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={onPreview}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
            isActivePreview
              ? 'bg-blue-700 text-white'
              : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
          )}
        >
          <Eye className="w-3 h-3" />
          {isActivePreview ? 'Sedang Dipratinjau' : 'Pratinjau'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          Unduh
        </button>
      </div>
    </div>
  );
}

interface RealtimeDocumentPreviewPanelProps {
  title?: string;
  slots: PreviewDocumentSlot[];
  activeSlotId: string;
  onSelectSlot: (id: string) => void;
}

export function RealtimeDocumentPreviewPanel({
  title = 'Realtime Preview Dokumen',
  slots,
  activeSlotId,
  onSelectSlot,
}: RealtimeDocumentPreviewPanelProps) {
  const activeSlot = useMemo(
    () => slots.find((s) => s.id === activeSlotId) || slots[0] || null,
    [slots, activeSlotId]
  );

  const [localObjectUrl, setLocalObjectUrl] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingSigned, setLoadingSigned] = useState(false);
  const [signedError, setSignedError] = useState<string | null>(null);

  const localFile = activeSlot?.localFile || null;
  const savedDoc = activeSlot?.savedDoc || null;

  // Instant realtime preview URL for locally picked file
  useEffect(() => {
    if (!localFile) {
      setLocalObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(localFile);
    setLocalObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [localFile]);

  // Signed URL for persisted document in Supabase Storage
  useEffect(() => {
    if (localFile || !savedDoc) {
      setSignedUrl(null);
      setSignedError(null);
      setLoadingSigned(false);
      return;
    }

    let active = true;
    setLoadingSigned(true);
    setSignedError(null);

    getSignedDocumentUrl(savedDoc.bucket_name, savedDoc.file_path, 3600).then((url) => {
      if (!active) return;
      if (!url) {
        setSignedError('Gagal memuat pratinjau dokumen tersimpan. Coba muat ulang atau unduh berkas.');
        setSignedUrl(null);
      } else {
        setSignedUrl(url);
      }
      setLoadingSigned(false);
    });

    return () => {
      active = false;
    };
  }, [localFile, savedDoc]);

  const activeUrl = localFile ? localObjectUrl : signedUrl;
  const fileName = localFile?.name || savedDoc?.file_name || '';
  const mimeType = localFile?.type || savedDoc?.mime_type || '';
  const fileSize = localFile?.size ?? savedDoc?.file_size ?? 0;

  const isPdf = mimeType === 'application/pdf' || /\.pdf$/i.test(fileName);
  const isImage = mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(fileName);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full min-h-[540px] overflow-hidden">
      {/* Preview Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5 bg-slate-50/70 dark:bg-slate-950/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-blue-700 dark:text-cyan-400" />
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          </div>

          {localFile ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800 text-[10px] font-medium text-cyan-700 dark:text-cyan-300">
              <Sparkles className="w-3 h-3" />
              Preview Langsung (Belum Disimpan)
            </span>
          ) : savedDoc ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-3 h-3" />
              Berkas Tersimpan · v{savedDoc.version_number}
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">Menunggu Berkas</span>
          )}
        </div>

        {/* Document Slot Switcher */}
        <div className="flex flex-wrap items-center gap-1.5">
          {slots.map((slot) => {
            const hasContent = Boolean(slot.localFile || slot.savedDoc);
            const active = slot.id === activeSlot?.id;
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => onSelectSlot(slot.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors border',
                  active
                    ? 'bg-blue-700 border-blue-700 text-white'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                )}
              >
                <span className="truncate max-w-[170px]">{slot.label}</span>
                {hasContent && (
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full shrink-0',
                      active
                        ? 'bg-cyan-300'
                        : slot.localFile
                          ? 'bg-cyan-500'
                          : 'bg-emerald-500'
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* File Info + Actions Bar */}
      {(localFile || savedDoc) && (
        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="min-w-0">
            <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{fileName}</p>
            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              {formatFileSize(fileSize)}
              {savedDoc && !localFile ? ` · Diunggah ${formatDateTime(savedDoc.created_at)}` : ''}
            </p>
          </div>

          {activeUrl && (
            <div className="flex items-center gap-1.5 shrink-0">
              <a
                href={activeUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Tab Baru
              </a>
              <a
                href={activeUrl}
                download={fileName || 'dokumen'}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-700 hover:bg-blue-800 text-white text-[11px] font-medium transition-colors"
              >
                <Download className="w-3 h-3" />
                Unduh
              </a>
            </div>
          )}
        </div>
      )}

      {/* Preview Viewport */}
      <div className="flex-1 p-3 bg-slate-100/70 dark:bg-slate-950/60 flex flex-col">
        {!localFile && !savedDoc ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40">
            <FileText className="w-9 h-9 text-slate-300 dark:text-slate-600 mb-2.5" />
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Belum ada berkas untuk {activeSlot?.label || 'slot ini'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
              Pilih atau seret file pada panel di sebelah kiri untuk langsung melihat pratinjau dokumen di sini secara real-time.
            </p>
          </div>
        ) : loadingSigned ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-slate-500 dark:text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-blue-700 dark:text-cyan-400 mb-2" />
            <p className="text-xs">Memuat pratinjau dokumen...</p>
          </div>
        ) : signedError ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-xs text-rose-600 dark:text-rose-400">
            {signedError}
          </div>
        ) : activeUrl && isPdf ? (
          <iframe
            key={activeUrl}
            src={`${activeUrl}#toolbar=1`}
            title={fileName}
            className="w-full flex-1 min-h-[460px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          />
        ) : activeUrl && isImage ? (
          <div className="flex-1 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 overflow-auto">
            <img
              src={activeUrl}
              alt={fileName}
              referrerPolicy="no-referrer"
              className="max-h-[480px] w-auto object-contain rounded"
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
            <FileText className="w-10 h-10 text-blue-700 dark:text-cyan-400" />
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{fileName}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm">
              Pratinjau visual inline tersedia untuk format PDF dan Gambar. Berkas ini tetap siap diunggah atau diunduh menggunakan tombol di atas.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
