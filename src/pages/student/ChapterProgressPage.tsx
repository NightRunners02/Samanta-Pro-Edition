import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Eye, History, Loader2, Upload } from 'lucide-react';
import { DocumentViewerModal } from '../../components/ui/DocumentViewerModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { FileUploadField } from '../../components/ui/FileUploadField';
import { Drawer, Modal } from '../../components/ui/Modal';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logActivity, supabase, uploadPrivateDocument } from '../../lib/supabase';
import { formatDateTime, formatFileSize } from '../../lib/utils';
import type { DocumentCategory, ThesisDocument, ThesisProgress, ThesisSubmission } from '../../types/database';

const CHAPTER_TITLES = [
  'Bab 1 — Pendahuluan',
  'Bab 2 — Tinjauan Pustaka',
  'Bab 3 — Metodologi Penelitian',
  'Bab 4 — Hasil dan Pembahasan',
  'Bab 5 — Kesimpulan',
];

export function ChapterProgressPage() {
  const { profile, systemSettings } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [thesis, setThesis] = useState<ThesisSubmission | null>(null);
  const [chapters, setChapters] = useState<ThesisProgress[]>([]);
  const [docsByChapter, setDocsByChapter] = useState<Record<number, ThesisDocument[]>>({});

  const [uploadTarget, setUploadTarget] = useState<ThesisProgress | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progressInput, setProgressInput] = useState(50);
  const [uploading, setUploading] = useState(false);

  const [historyChapter, setHistoryChapter] = useState<number | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ThesisDocument | null>(null);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);

    const { data: tData } = await supabase
      .from('thesis_submissions')
      .select('*')
      .eq('student_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentThesis = (tData as ThesisSubmission) || null;
    setThesis(currentThesis);

    if (currentThesis) {
      let { data: chapData } = await supabase
        .from('thesis_progress')
        .select('*, latest_document:thesis_documents(*)')
        .eq('thesis_id', currentThesis.id)
        .order('chapter_number');

      if ((!chapData || chapData.length === 0) && currentThesis.status === 'approved') {
        // Initialize 5 chapters if not yet created
        const rows = CHAPTER_TITLES.map((title, idx) => ({
          thesis_id: currentThesis.id,
          student_id: profile.id,
          chapter_number: idx + 1,
          chapter_title: title,
        }));
        await supabase.from('thesis_progress').upsert(rows, { onConflict: 'thesis_id,chapter_number' });
        const { data: refetched } = await supabase
          .from('thesis_progress')
          .select('*, latest_document:thesis_documents(*)')
          .eq('thesis_id', currentThesis.id)
          .order('chapter_number');
        chapData = refetched;
      }

      setChapters((chapData || []) as ThesisProgress[]);

      const { data: allDocs } = await supabase
        .from('thesis_documents')
        .select('*')
        .eq('thesis_id', currentThesis.id)
        .in('category', ['chapter_1', 'chapter_2', 'chapter_3', 'chapter_4', 'chapter_5'])
        .order('version_number', { ascending: false });

      const grouped: Record<number, ThesisDocument[]> = {};
      for (const doc of (allDocs || []) as ThesisDocument[]) {
        const chNum = Number(doc.category.replace('chapter_', ''));
        if (!grouped[chNum]) grouped[chNum] = [];
        grouped[chNum].push(doc);
      }
      setDocsByChapter(grouped);
    }

    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    loadData();
    if (!profile?.id) return;
    const channel = supabase
      .channel(`student_chapters_${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'thesis_progress', filter: `student_id=eq.${profile.id}` },
        loadData
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData, profile?.id]);

  const handleUploadChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !thesis || !uploadTarget || !selectedFile) return;

    setUploading(true);
    const cat = (`chapter_${uploadTarget.chapter_number}`) as DocumentCategory;
    const existingVersions = docsByChapter[uploadTarget.chapter_number] || [];
    const nextVersion = existingVersions.length > 0 ? existingVersions[0].version_number + 1 : 1;
    const prevLatest = existingVersions[0]?.id || null;

    const up = await uploadPrivateDocument({
      file: selectedFile,
      userId: profile.id,
      studentId: profile.id,
      category: cat,
      title: `${uploadTarget.chapter_title} (v${nextVersion})`,
      thesisId: thesis.id,
      parentDocumentId: prevLatest,
      versionNumber: nextVersion,
      maxUploadMb: systemSettings?.max_upload_mb || 25,
      allowedFormats: systemSettings?.allowed_file_formats || ['pdf', 'docx'],
    });

    if (up.error || !up.data) {
      setUploading(false);
      showToast('Gagal mengunggah bab', 'error', up.error || 'Terjadi kesalahan');
      return;
    }

    const { error: progErr } = await supabase
      .from('thesis_progress')
      .update({
        latest_document_id: up.data.id,
        progress_percent: progressInput,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        revision_count: nextVersion - 1,
      })
      .eq('id', uploadTarget.id);

    setUploading(false);
    if (progErr) {
      showToast('Gagal memperbarui progres bab', 'error', progErr.message);
      return;
    }

    await logActivity('upload_chapter', 'thesis_progress', uploadTarget.id, {
      chapter: uploadTarget.chapter_number,
      version: nextVersion,
    });

    setUploadTarget(null);
    setSelectedFile(null);
    showToast(`Berhasil mengunggah ${uploadTarget.chapter_title} (v${nextVersion})`, 'success');
    loadData();
  };

  if (loading) return <TableSkeleton rows={5} columns={4} />;

  if (!thesis || thesis.status !== 'approved') {
    return (
      <EmptyState
        icon={BookOpen}
        title="Progres Bab Belum Aktif"
        description="Unggah progres Bab 1–5 akan terbuka otomatis setelah judul tugas akhir Anda disetujui."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Progres Tugas Akhir Per Bab</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Unggah naskah Bab 1 sampai Bab 5. Setiap revisi baru tersimpan sebagai versi terpisah tanpa menimpa arsip lama.
        </p>
      </div>

      <div className="space-y-3">
        {chapters.map((ch) => {
          const versions = docsByChapter[ch.chapter_number] || [];
          return (
            <div
              key={ch.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-sm font-semibold">{ch.chapter_title}</h2>
                    <StatusBadge status={ch.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono tabular-nums">Progres: {ch.progress_percent}%</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">Revisi: {ch.revision_count}x</span>
                    {ch.submitted_at && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">Dikirim {formatDateTime(ch.submitted_at)}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {ch.latest_document && (
                    <button
                      type="button"
                      onClick={() => setPreviewDoc(ch.latest_document || null)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Lihat Versi Terbaru
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setHistoryChapter(ch.chapter_number)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <History className="w-3.5 h-3.5" />
                    Riwayat ({versions.length})
                  </button>
                  {ch.status !== 'approved' && (
                    <button
                      type="button"
                      onClick={() => {
                        setUploadTarget(ch);
                        setProgressInput(Math.max(ch.progress_percent, 60));
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Unggah Dokumen
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-blue-700 dark:bg-cyan-500 transition-all duration-300"
                  style={{ width: `${ch.progress_percent}%` }}
                />
              </div>

              {ch.feedback && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs">
                  <p className="font-medium text-slate-700 dark:text-slate-300 mb-0.5">Komentar Dosen Pembimbing:</p>
                  <p className="text-slate-600 dark:text-slate-400">{ch.feedback}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Upload Modal */}
      <Modal
        open={Boolean(uploadTarget)}
        onClose={() => setUploadTarget(null)}
        title={`Unggah ${uploadTarget?.chapter_title || ''}`}
        subtitle="File versi sebelumnya akan tetap tersimpan pada riwayat versi."
      >
        <form onSubmit={handleUploadChapter} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">
              Estimasi Progres Penulisan ({progressInput}%)
            </label>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={progressInput}
              onChange={(e) => setProgressInput(Number(e.target.value))}
              className="w-full accent-blue-700"
            />
          </div>

          <FileUploadField
            label="Pilih Berkas Bab (PDF / DOCX) *"
            accept=".pdf,.docx"
            maxMb={systemSettings?.max_upload_mb || 25}
            uploading={uploading}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setUploadTarget(null)}
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
              Unggah & Kirim Review
            </button>
          </div>
        </form>
      </Modal>

      {/* Version History Drawer */}
      <Drawer
        open={historyChapter !== null}
        onClose={() => setHistoryChapter(null)}
        title={historyChapter ? `${CHAPTER_TITLES[historyChapter - 1]} — Riwayat Versi` : 'Riwayat Versi'}
      >
        {historyChapter !== null && (
          <div className="space-y-3">
            {(docsByChapter[historyChapter] || []).length === 0 ? (
              <EmptyState
                title="Belum ada berkas"
                description="Belum ada dokumen yang diunggah untuk bab ini."
              />
            ) : (
              (docsByChapter[historyChapter] || []).map((d) => (
                <div
                  key={d.id}
                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-blue-700 dark:text-cyan-400">
                      Versi {d.version_number} {d.is_latest ? '(Terbaru)' : ''}
                    </span>
                    <StatusBadge status={d.status} />
                  </div>
                  <p className="font-medium truncate">{d.file_name}</p>
                  <p className="text-[11px] font-mono text-slate-400">
                    {formatFileSize(d.file_size)} · {formatDateTime(d.created_at)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPreviewDoc(d)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Buka / Unduh
                  </button>
                </div>
              ))
            )}
          </div>
        )}
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
