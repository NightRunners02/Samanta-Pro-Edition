import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { getSignedDocumentUrl } from '../../lib/supabase';
import { Modal } from './Modal';

interface DocumentViewerModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  bucketName: string;
  filePath: string;
  mimeType?: string | null;
}

export function DocumentViewerModal({
  open,
  onClose,
  title,
  bucketName,
  filePath,
  mimeType,
}: DocumentViewerModalProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !filePath || !bucketName) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      const url = await getSignedDocumentUrl(bucketName, filePath, 3600);
      if (!active) return;
      if (!url) {
        setError('Gagal menghasilkan signed URL dokumen. Periksa hak akses penyimpanan.');
      } else {
        setSignedUrl(url);
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [open, bucketName, filePath]);

  const isImage = mimeType?.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(filePath);
  const isPdf = mimeType === 'application/pdf' || /\.pdf$/i.test(filePath);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle="Akses dokumen terenkripsi menggunakan Signed URL berbatas waktu (60 menit)"
      maxWidth="xl"
      footer={
        signedUrl ? (
          <div className="flex items-center gap-2">
            <a
              href={signedUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Buka Tab Baru
            </a>
            <a
              href={signedUrl}
              download
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh Dokumen
            </a>
          </div>
        ) : null
      }
    >
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mb-2 text-blue-600" />
          <p className="text-xs">Membuat tautan aman dokumen...</p>
        </div>
      )}

      {!loading && error && (
        <div className="py-12 text-center text-xs text-rose-600 dark:text-rose-400">{error}</div>
      )}

      {!loading && !error && signedUrl && (
        <div className="w-full">
          {isPdf ? (
            <iframe
              src={signedUrl}
              title={title}
              className="w-full h-[65vh] rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950"
            />
          ) : isImage ? (
            <div className="flex justify-center bg-slate-100 dark:bg-slate-950 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
              <img
                src={signedUrl}
                alt={title}
                referrerPolicy="no-referrer"
                className="max-h-[65vh] object-contain rounded"
              />
            </div>
          ) : (
            <div className="py-16 text-center space-y-3 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950/50">
              <FileText className="w-10 h-10 text-slate-400 mx-auto" />
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Pratinjau langsung tidak tersedia untuk tipe file ini
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Silakan klik tombol Unduh Dokumen di bawah untuk membuka berkas di perangkat Anda.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
