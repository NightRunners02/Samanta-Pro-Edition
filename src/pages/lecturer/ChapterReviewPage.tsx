import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye } from 'lucide-react';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { DocumentViewerModal } from '../../components/ui/DocumentViewerModal';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logActivity, sendNotification, supabase } from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';
import type { Profile, ThesisDocument, ThesisProgress } from '../../types/database';

type ProgressWithStudent = ThesisProgress & { student?: Profile };

export function ChapterReviewPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [chapters, setChapters] = useState<ProgressWithStudent[]>([]);
  const [previewDoc, setPreviewDoc] = useState<ThesisDocument | null>(null);
  const [reviewItem, setReviewItem] = useState<ProgressWithStudent | null>(null);
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data: supData } = await supabase
      .from('thesis_supervisors')
      .select('thesis_id')
      .eq('lecturer_id', profile.id)
      .eq('status', 'active');

    const thesisIds = (supData || []).map((s) => s.thesis_id);
    if (thesisIds.length > 0) {
      const { data: chData } = await supabase
        .from('thesis_progress')
        .select('*, student:profiles!thesis_progress_student_id_fkey(*), latest_document:thesis_documents(*)')
        .in('thesis_id', thesisIds)
        .order('chapter_number');
      setChapters((chData || []) as ProgressWithStudent[]);
    } else {
      setChapters([]);
    }
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReview = async (decision: 'approved' | 'needs_revision') => {
    if (!profile || !reviewItem) return;
    setSaving(true);

    const { error } = await supabase
      .from('thesis_progress')
      .update({
        status: decision,
        progress_percent: decision === 'approved' ? 100 : reviewItem.progress_percent,
        feedback: feedback.trim() || null,
        reviewed_at: new Date().toISOString(),
        approved_by: decision === 'approved' ? profile.id : null,
        approved_at: decision === 'approved' ? new Date().toISOString() : null,
      })
      .eq('id', reviewItem.id);

    if (!error && reviewItem.latest_document_id) {
      const docStatus = decision === 'approved' ? 'approved' : 'revision_required';
      await supabase
        .from('thesis_documents')
        .update({ status: docStatus, revision_notes: feedback.trim() || null })
        .eq('id', reviewItem.latest_document_id);

      await supabase.from('document_reviews').insert({
        document_id: reviewItem.latest_document_id,
        reviewer_id: profile.id,
        decision: docStatus,
        comments: feedback.trim() || (decision === 'approved' ? 'Bab disetujui.' : 'Perlu revisi.'),
      });
    }

    setSaving(false);
    if (error) {
      showToast('Gagal menyimpan review bab', 'error', error.message);
      return;
    }

    await sendNotification({
      userId: reviewItem.student_id,
      title: decision === 'approved' ? `${reviewItem.chapter_title} Disetujui` : `Revisi ${reviewItem.chapter_title}`,
      message: feedback.trim() || 'Dosen pembimbing telah meninjau dokumen bab Anda.',
      category: 'chapter_review',
      entityType: 'thesis_progress',
      entityId: reviewItem.id,
    });
    await logActivity(`chapter_${decision}`, 'thesis_progress', reviewItem.id, {
      chapter: reviewItem.chapter_number,
    });

    setReviewItem(null);
    setFeedback('');
    showToast(decision === 'approved' ? 'Bab berhasil disetujui' : 'Permintaan revisi dikirim', 'success');
    loadData();
  };

  const columns: ColumnDef<ProgressWithStudent>[] = [
    {
      key: 'student',
      header: 'Mahasiswa',
      sortValue: (r) => r.student?.full_name || '',
      render: (r) => (
        <div>
          <p className="font-medium">{r.student?.full_name}</p>
          <p className="text-[11px] font-mono text-slate-500">{r.student?.nim_nip}</p>
        </div>
      ),
    },
    {
      key: 'chapter',
      header: 'Bab',
      sortValue: (r) => r.chapter_number,
      render: (r) => <span className="font-medium">{r.chapter_title}</span>,
    },
    {
      key: 'progress',
      header: 'Progres',
      align: 'right',
      render: (r) => <span className="font-mono tabular-nums">{r.progress_percent}%</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'submitted',
      header: 'Dikirim',
      render: (r) => <span className="font-mono text-slate-500">{formatDateTime(r.submitted_at)}</span>,
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (r) => (
        <div className="inline-flex items-center gap-1.5">
          {r.latest_document && (
            <button
              type="button"
              onClick={() => setPreviewDoc(r.latest_document || null)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Eye className="w-3.5 h-3.5" />
              Buka File
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setReviewItem(r);
              setFeedback(r.feedback || '');
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-700 hover:bg-blue-800 text-white"
          >
            Verifikasi
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Review Bab & Dokumen Mahasiswa</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Buka dokumen bab mahasiswa, berikan komentar evaluasi, minta revisi, atau setujui bab.
        </p>
      </div>

      <DataTable
        data={chapters}
        columns={columns}
        keyField={(r) => r.id}
        loading={loading}
        searchPlaceholder="Cari mahasiswa atau bab..."
        searchFilter={(r, q) =>
          (r.student?.full_name || '').toLowerCase().includes(q) ||
          r.chapter_title.toLowerCase().includes(q)
        }
        emptyTitle="Belum ada bab untuk direview"
        emptyDescription="Bab tugas akhir mahasiswa bimbingan Anda akan muncul di sini setelah judul disetujui."
      />

      <Modal
        open={Boolean(reviewItem)}
        onClose={() => setReviewItem(null)}
        title={`Verifikasi ${reviewItem?.chapter_title || ''}`}
        subtitle={reviewItem?.student?.full_name}
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-medium mb-1">Komentar & Catatan Revisi</label>
            <textarea
              rows={4}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Tuliskan catatan review untuk bab ini..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleReview('needs_revision')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              Minta Revisi
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleReview('approved')}
              className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Setujui Bab
            </button>
          </div>
        </div>
      </Modal>

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
