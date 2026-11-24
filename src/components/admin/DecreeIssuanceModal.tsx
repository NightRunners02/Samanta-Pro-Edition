import React, { useEffect, useState } from 'react';
import { Download, Eye, FileBadge2, History, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  buildDefaultLetterNumber,
  downloadDecreePdf,
  formatLecturerAcademicName,
  issueOfficialDecree,
} from '../../lib/decreeService';
import { formatDate } from '../../lib/utils';
import type { DecreeType, OfficialDecree, ThesisSubmission } from '../../types/database';
import { Modal } from '../ui/Modal';
import { DocumentViewerModal } from '../ui/DocumentViewerModal';

interface DecreeIssuanceModalProps {
  open: boolean;
  onClose: () => void;
  thesis: ThesisSubmission | null;
  decreeType: DecreeType;
  existingDecrees: OfficialDecree[];
  onIssued: () => void;
}

export function DecreeIssuanceModal({
  open,
  onClose,
  thesis,
  decreeType,
  existingDecrees,
  onIssued,
}: DecreeIssuanceModalProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const sortedVersions = [...existingDecrees].sort((a, b) => b.version_number - a.version_number);
  const latest = sortedVersions.find((d) => d.is_latest) || sortedVersions[0] || null;
  const nextVersion = latest ? latest.version_number + 1 : 1;

  const [letterNumber, setLetterNumber] = useState('');
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().slice(0, 10));
  const [issuerName, setIssuerName] = useState('');
  const [issuerTitle, setIssuerTitle] = useState('');
  const [issuerNip, setIssuerNip] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewDecree, setPreviewDecree] = useState<OfficialDecree | null>(null);

  useEffect(() => {
    if (!open || !thesis) return;
    const today = new Date().toISOString().slice(0, 10);
    const prog = thesis.program || thesis.student?.program || null;
    const dept = prog?.department || thesis.student?.department || null;

    setIssuedDate(today);
    setLetterNumber(
      buildDefaultLetterNumber({
        decreeType,
        programCode: prog?.code,
        issuedDate: today,
        thesisId: thesis.id,
        versionNumber: nextVersion,
      })
    );
    setIssuerName(
      latest?.issuer_name ||
        dept?.dean_name ||
        (profile ? formatLecturerAcademicName(profile) : 'Dekan Fakultas')
    );
    setIssuerTitle(
      latest?.issuer_title || `Dekan ${dept?.name || 'Fakultas Akademik'}`
    );
    setIssuerNip(latest?.issuer_nip ?? profile?.nim_nip ?? '');
  }, [open, thesis?.id, decreeType, nextVersion]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thesis || !profile) return;
    setSubmitting(true);

    const { error } = await issueOfficialDecree({
      thesisId: thesis.id,
      decreeType,
      actorProfileId: profile.id,
      isAdminAction: true,
      customLetterNumber: letterNumber,
      customIssuedDate: issuedDate,
      customIssuerName: issuerName,
      customIssuerTitle: issuerTitle,
      customIssuerNip: issuerNip.trim() || null,
      notifyStudent: true,
    });

    setSubmitting(false);
    if (error) {
      showToast('Gagal menerbitkan Surat Keputusan', 'error', error);
      return;
    }

    showToast(
      `${decreeType === 'sk_pembimbing' ? 'SK Pembimbing' : 'SK Penguji'} v${nextVersion} berhasil diterbitkan`,
      'success'
    );
    onIssued();
    onClose();
  };

  const titleLabel =
    decreeType === 'sk_pembimbing'
      ? latest
        ? `Terbitkan Ulang SK Pembimbing (v${nextVersion})`
        : 'Terbitkan SK Pembimbing (v1)'
      : latest
        ? `Terbitkan Ulang SK Penguji (v${nextVersion})`
        : 'Terbitkan SK Penguji (v1)';

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={titleLabel}
        subtitle={
          thesis
            ? `${thesis.student?.full_name || ''} (${thesis.student?.nim_nip || '—'})`
            : undefined
        }
        maxWidth="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {latest?.needs_reissue && (
            <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <RefreshCw className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Perubahan Data Penugasan Terdeteksi</p>
                <p className="mt-0.5">
                  Data penugasan telah diperbarui setelah penerbitan SK sebelumnya (v{latest.version_number}). Terbitkan versi baru (v{nextVersion}) agar file PDF resmi mahasiswa tersinkronisasi.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-medium mb-1">Nomor Surat *</label>
              <input
                type="text"
                required
                value={letterNumber}
                onChange={(e) => setLetterNumber(e.target.value)}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Tanggal Penerbitan *</label>
              <input
                type="date"
                required
                value={issuedDate}
                onChange={(e) => setIssuedDate(e.target.value)}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Nama Pejabat Penerbit *</label>
              <input
                type="text"
                required
                value={issuerName}
                onChange={(e) => setIssuerName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Jabatan Pejabat *</label>
              <input
                type="text"
                required
                value={issuerTitle}
                onChange={(e) => setIssuerTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">NIP / NIDN Pejabat (Opsional)</label>
              <input
                type="text"
                value={issuerNip}
                onChange={(e) => setIssuerNip(e.target.value)}
                placeholder="Kosongkan jika tidak dicantumkan"
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          {sortedVersions.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 space-y-2 bg-slate-50/70 dark:bg-slate-950/40">
              <p className="font-semibold flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                <History className="w-3.5 h-3.5 text-blue-600" />
                Riwayat Versi SK Tersimpan ({sortedVersions.length})
              </p>
              <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {sortedVersions.map((ver) => (
                  <div key={ver.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-mono font-medium">
                        v{ver.version_number} · {ver.letter_number}{' '}
                        {ver.is_latest && (
                          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400">
                            Aktif
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Diterbitkan {formatDate(ver.issued_date)} · {ver.issuer_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPreviewDecree(ver)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100"
                      >
                        <Eye className="w-3 h-3" />
                        Lihat
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadDecreePdf(ver)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100"
                      >
                        <Download className="w-3 h-3" />
                        PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileBadge2 className="w-3.5 h-3.5" />
              )}
              {latest ? `Terbitkan Ulang SK (v${nextVersion})` : 'Terbitkan & Simpan PDF (v1)'}
            </button>
          </div>
        </form>
      </Modal>

      {previewDecree && (
        <DocumentViewerModal
          open={Boolean(previewDecree)}
          onClose={() => setPreviewDecree(null)}
          title={`${previewDecree.decree_type === 'sk_pembimbing' ? 'SK Pembimbing' : 'SK Penguji'} (${previewDecree.letter_number})`}
          bucketName={previewDecree.bucket_name}
          filePath={previewDecree.file_path}
          mimeType="application/pdf"
        />
      )}
    </>
  );
}
