import React, { useCallback, useEffect, useState } from 'react';
import {
  Edit3,
  Eye,
  FilePlus2,
  History,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { DocumentViewerModal } from '../../components/ui/DocumentViewerModal';
import { FileUploadField } from '../../components/ui/FileUploadField';
import { Drawer, Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logActivity, supabase, uploadPrivateDocument } from '../../lib/supabase';
import { DOCUMENT_CATEGORY_LABELS, formatDateTime, formatFileSize } from '../../lib/utils';
import type { DocumentCategory, ThesisDocument, ThesisSubmission } from '../../types/database';

export function DocumentCenterPage() {
  const { profile, systemSettings } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<ThesisDocument[]>([]);
  const [thesis, setThesis] = useState<ThesisSubmission | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Upload / Replace modal
  const [uploadOpen, setUploadOpen] = useState(false);
  const [replacingDoc, setReplacingDoc] = useState<ThesisDocument | null>(null);
  const [docCategory, setDocCategory] = useState<DocumentCategory>('proposal');
  const [docTitle, setDocTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Rename modal
  const [renameTarget, setRenameTarget] = useState<ThesisDocument | null>(null);
  const [newTitle, setNewTitle] = useState('');

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<ThesisDocument | null>(null);

  // Preview & Version History
  const [previewDoc, setPreviewDoc] = useState<ThesisDocument | null>(null);
  const [historyDocs, setHistoryDocs] = useState<ThesisDocument[] | null>(null);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const [{ data: tData }, { data: dData }] = await Promise.all([
      supabase
        .from('thesis_submissions')
        .select('*')
        .eq('student_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('thesis_documents')
        .select('*')
        .eq('student_id', profile.id)
        .order('created_at', { ascending: false }),
    ]);

    setThesis((tData as ThesisSubmission) || null);
    setDocuments((dData || []) as ThesisDocument[]);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const latestDocs = documents.filter((d) => d.is_latest);
  const filteredDocs =
    categoryFilter === 'all' ? latestDocs : latestDocs.filter((d) => d.category === categoryFilter);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedFile || !docTitle.trim()) return;
    setUploading(true);

    const res = await uploadPrivateDocument({
      file: selectedFile,
      userId: profile.id,
      studentId: profile.id,
      category: replacingDoc ? replacingDoc.category : docCategory,
      title: docTitle.trim(),
      thesisId: thesis?.id || null,
      parentDocumentId: replacingDoc?.id || null,
      versionNumber: replacingDoc ? replacingDoc.version_number + 1 : 1,
      maxUploadMb: systemSettings?.max_upload_mb || 25,
      allowedFormats: systemSettings?.allowed_file_formats || ['pdf', 'docx', 'png', 'jpg'],
    });

    setUploading(false);
    if (res.error) {
      showToast('Gagal mengunggah dokumen', 'error', res.error);
      return;
    }

    setUploadOpen(false);
    setReplacingDoc(null);
    setSelectedFile(null);
    setDocTitle('');
    showToast(replacingDoc ? 'Versi baru dokumen diunggah' : 'Dokumen berhasil diunggah', 'success');
    loadData();
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !newTitle.trim()) return;
    const { error } = await supabase
      .from('thesis_documents')
      .update({ title: newTitle.trim() })
      .eq('id', renameTarget.id);
    if (error) {
      showToast('Gagal mengubah nama dokumen', 'error', error.message);
      return;
    }
    await logActivity('rename_document', 'thesis_documents', renameTarget.id, { new_title: newTitle.trim() });
    setRenameTarget(null);
    showToast('Nama dokumen diperbarui', 'success');
    loadData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.storage.from(deleteTarget.bucket_name).remove([deleteTarget.file_path]);
    const { error } = await supabase.from('thesis_documents').delete().eq('id', deleteTarget.id);
    if (error) {
      showToast('Gagal menghapus dokumen', 'error', error.message);
      return;
    }
    await logActivity('delete_document', 'thesis_documents', deleteTarget.id, { file_name: deleteTarget.file_name });
    setDeleteTarget(null);
    showToast('Dokumen dihapus', 'success');
    loadData();
  };

  const openVersionHistory = (doc: ThesisDocument) => {
    const chain = documents
      .filter((d) => d.category === doc.category && (d.id === doc.id || d.parent_document_id === doc.id || doc.parent_document_id === d.id))
      .sort((a, b) => b.version_number - a.version_number);
    setHistoryDocs(chain.length > 0 ? chain : [doc]);
  };

  const columns: ColumnDef<ThesisDocument>[] = [
    {
      key: 'title',
      header: 'Judul & Berkas',
      sortValue: (d) => d.title,
      render: (d) => (
        <div className="min-w-[200px]">
          <p className="font-medium text-slate-900 dark:text-slate-100">{d.title}</p>
          <p className="text-[11px] text-slate-500 truncate max-w-xs">{d.file_name}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Kategori',
      sortValue: (d) => d.category,
      render: (d) => <span>{DOCUMENT_CATEGORY_LABELS[d.category] || d.category}</span>,
    },
    {
      key: 'version',
      header: 'Versi / Ukuran',
      render: (d) => (
        <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
          v{d.version_number} · {formatFileSize(d.file_size)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (d) => d.status,
      render: (d) => (
        <div className="space-y-0.5">
          <StatusBadge status={d.status} />
          {d.revision_notes && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 max-w-xs truncate" title={d.revision_notes}>
              {d.revision_notes}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (d) => (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            title="Pratinjau / Unduh"
            onClick={() => setPreviewDoc(d)}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Ganti File (Versi Baru)"
            onClick={() => {
              setReplacingDoc(d);
              setDocTitle(d.title);
              setUploadOpen(true);
            }}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Riwayat Versi"
            onClick={() => openVersionHistory(d)}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          >
            <History className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Ubah Nama"
            onClick={() => {
              setRenameTarget(d);
              setNewTitle(d.title);
            }}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          {['pending', 'revision_required'].includes(d.status) && (
            <button
              type="button"
              title="Hapus Dokumen"
              onClick={() => setDeleteTarget(d)}
              className="p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Document Center</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Repositori aman untuk seluruh berkas tugas akhir pada private storage terenkripsi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setReplacingDoc(null);
            setDocTitle('');
            setUploadOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white transition-colors shrink-0"
        >
          <FilePlus2 className="w-4 h-4" />
          Unggah Dokumen Baru
        </button>
      </div>

      <DataTable
        data={filteredDocs}
        columns={columns}
        keyField={(d) => d.id}
        loading={loading}
        searchPlaceholder="Cari judul atau nama berkas..."
        searchFilter={(d, q) =>
          d.title.toLowerCase().includes(q) || d.file_name.toLowerCase().includes(q)
        }
        emptyTitle="Belum ada dokumen tersimpan"
        emptyDescription="Unggah proposal, naskah bab, surat penelitian, bukti pembayaran, atau berkas sidang Anda di sini."
        emptyActionLabel="Unggah Dokumen"
        onEmptyAction={() => setUploadOpen(true)}
        toolbarExtra={
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          >
            <option value="all">Semua Kategori</option>
            {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        }
      />

      {/* Upload / Replace Modal */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title={replacingDoc ? 'Ganti File (Buat Versi Baru)' : 'Unggah Dokumen Tugas Akhir'}
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          {!replacingDoc && (
            <div>
              <label className="block text-xs font-medium mb-1">Kategori Dokumen *</label>
              <select
                value={docCategory}
                onChange={(e) => setDocCategory(e.target.value as DocumentCategory)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1">Nama / Judul Dokumen *</label>
            <input
              type="text"
              required
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder="Contoh: Surat Izin Penelitian Instansi"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <FileUploadField
            label="Pilih Berkas *"
            accept=".pdf,.docx,.png,.jpg,.jpeg"
            maxMb={systemSettings?.max_upload_mb || 25}
            uploading={uploading}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setUploadOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50"
            >
              {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Simpan Dokumen
            </button>
          </div>
        </form>
      </Modal>

      {/* Rename Modal */}
      <Modal
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title="Ubah Nama Dokumen"
        maxWidth="sm"
      >
        <form onSubmit={handleRename} className="space-y-4">
          <input
            type="text"
            required
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRenameTarget(null)}
              className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
            >
              Simpan Nama
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Konfirmasi Hapus Dokumen"
        maxWidth="sm"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-300">
            Apakah Anda yakin ingin menghapus dokumen <strong>{deleteTarget?.title}</strong>? Tindakan ini tidak dapat dibatalkan.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 font-medium rounded-lg bg-rose-600 hover:bg-rose-700 text-white"
            >
              Ya, Hapus
            </button>
          </div>
        </div>
      </Modal>

      {/* Version History Drawer */}
      <Drawer
        open={Boolean(historyDocs)}
        onClose={() => setHistoryDocs(null)}
        title="Riwayat Versi Dokumen"
      >
        <div className="space-y-3">
          {(historyDocs || []).map((d) => (
            <div
              key={d.id}
              className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold">Versi {d.version_number}</span>
                <StatusBadge status={d.status} />
              </div>
              <p className="font-medium truncate">{d.file_name}</p>
              <p className="text-[11px] font-mono text-slate-400">
                {formatFileSize(d.file_size)} · {formatDateTime(d.created_at)}
              </p>
              <button
                type="button"
                onClick={() => setPreviewDoc(d)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700"
              >
                <Eye className="w-3.5 h-3.5" />
                Pratinjau
              </button>
            </div>
          ))}
        </div>
      </Drawer>

      {previewDoc && (
        <DocumentViewerModal
          open={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
          title={previewDoc.title}
          bucketName={previewDoc.bucket_name}
          filePath={previewDoc.file_path}
          mimeType={previewDoc.mime_type}
        />
      )}
    </div>
  );
}
