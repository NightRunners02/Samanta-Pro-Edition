import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Eye, Loader2 } from 'lucide-react';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { DocumentViewerModal } from '../../components/ui/DocumentViewerModal';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logActivity, sendNotification, supabase } from '../../lib/supabase';
import { calculateWeightedScore, formatDate, getLetterGrade } from '../../lib/utils';
import type { ExamSchedule, ExaminerAssignment, ThesisDocument, ThesisSubmission } from '../../types/database';

interface AssignedExamRow extends ExaminerAssignment {
  schedule?: ExamSchedule;
  thesis?: ThesisSubmission & { student?: { id: string; full_name: string; nim_nip: string } };
}

export function ExaminerSchedulePage() {
  const { profile, systemSettings } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AssignedExamRow[]>([]);
  const [previewDoc, setPreviewDoc] = useState<ThesisDocument | null>(null);

  // Scoring Modal
  const [scoringRow, setScoringRow] = useState<AssignedExamRow | null>(null);
  const [presentation, setPresentation] = useState(80);
  const [substance, setSubstance] = useState(80);
  const [methodology, setMethodology] = useState(80);
  const [results, setResults] = useState(80);
  const [mastery, setMastery] = useState(80);
  const [revision, setRevision] = useState(80);
  const [evalNotes, setEvalNotes] = useState('');
  const [revNotes, setRevNotes] = useState('');
  const [approvalStatus, setApprovalStatus] = useState<'approved' | 'revision_required'>('approved');
  const [saving, setSaving] = useState(false);

  const weights = systemSettings?.scoring_weights || {
    presentation: 15,
    substance: 25,
    methodology: 20,
    results: 20,
    mastery: 15,
    revision: 5,
  };

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('examiner_assignments')
      .select('*, schedule:exam_schedules(*), thesis:thesis_submissions(*, student:profiles!thesis_submissions_student_id_fkey(id, full_name, nim_nip))')
      .eq('lecturer_id', profile.id)
      .order('created_at', { ascending: false });
    setRows((data || []) as AssignedExamRow[]);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openThesisDocument = async (thesisId: string) => {
    const { data } = await supabase
      .from('thesis_documents')
      .select('*')
      .eq('thesis_id', thesisId)
      .eq('is_latest', true)
      .in('category', ['full_thesis', 'seminar_document', 'proposal'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) {
      showToast('Dokumen tugas akhir belum tersedia', 'info');
      return;
    }
    setPreviewDoc(data as ThesisDocument);
  };

  const openScoringModal = async (row: AssignedExamRow) => {
    setScoringRow(row);
    const { data: existing } = await supabase
      .from('exam_scores')
      .select('*')
      .eq('schedule_id', row.schedule_id)
      .eq('examiner_id', profile!.id)
      .maybeSingle();

    if (existing) {
      setPresentation(Number(existing.presentation_score));
      setSubstance(Number(existing.substance_score));
      setMethodology(Number(existing.methodology_score));
      setResults(Number(existing.results_score));
      setMastery(Number(existing.mastery_score));
      setRevision(Number(existing.revision_score));
      setEvalNotes(existing.evaluation_notes || '');
      setRevNotes(existing.revision_notes || '');
    } else {
      setPresentation(80);
      setSubstance(80);
      setMethodology(80);
      setResults(80);
      setMastery(80);
      setRevision(80);
      setEvalNotes('');
      setRevNotes('');
    }
    setApprovalStatus(row.approval_status === 'revision_required' ? 'revision_required' : 'approved');
  };

  const computedTotal = calculateWeightedScore(
    {
      presentation_score: presentation,
      substance_score: substance,
      methodology_score: methodology,
      results_score: results,
      mastery_score: mastery,
      revision_score: revision,
    },
    weights
  );

  const handleSaveScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !scoringRow) return;
    setSaving(true);

    const { error: scoreErr } = await supabase.from('exam_scores').upsert(
      {
        schedule_id: scoringRow.schedule_id,
        thesis_id: scoringRow.thesis_id,
        examiner_id: profile.id,
        presentation_score: presentation,
        substance_score: substance,
        methodology_score: methodology,
        results_score: results,
        mastery_score: mastery,
        revision_score: revision,
        weighted_total: computedTotal,
        evaluation_notes: evalNotes.trim() || null,
        revision_notes: revNotes.trim() || null,
        is_finalized: true,
      },
      { onConflict: 'schedule_id,examiner_id' }
    );

    if (scoreErr) {
      setSaving(false);
      showToast('Gagal menyimpan nilai', 'error', scoreErr.message);
      return;
    }

    await supabase
      .from('examiner_assignments')
      .update({
        approval_status: approvalStatus,
        revision_notes: revNotes.trim() || null,
      })
      .eq('id', scoringRow.id);

    if (scoringRow.thesis?.student_id) {
      await sendNotification({
        userId: scoringRow.thesis.student_id,
        title: 'Nilai & Evaluasi Sidang Tersedia',
        message: `${profile.full_name} telah menginput nilai ujian Anda (Skor: ${computedTotal}).`,
        category: 'score',
        entityType: 'exam_scores',
        entityId: scoringRow.schedule_id,
      });
    }
    await logActivity('submit_exam_score', 'exam_scores', scoringRow.schedule_id, {
      weighted_total: computedTotal,
    });

    setSaving(false);
    setScoringRow(null);
    showToast('Nilai & evaluasi sidang tersimpan', 'success');
    loadData();
  };

  const columns: ColumnDef<AssignedExamRow>[] = [
    {
      key: 'student',
      header: 'Mahasiswa',
      render: (r) => (
        <div>
          <p className="font-medium">{r.thesis?.student?.full_name || '—'}</p>
          <p className="text-[11px] font-mono text-slate-500">{r.thesis?.student?.nim_nip}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Jenis & Peran',
      render: (r) => (
        <div>
          <p className="font-medium capitalize">{r.schedule?.exam_type || '—'}</p>
          <p className="text-[11px] text-slate-500 capitalize">{r.examiner_role.replace(/_/g, ' ')}</p>
        </div>
      ),
    },
    {
      key: 'schedule',
      header: 'Jadwal & Ruang',
      render: (r) => (
        <div className="font-mono text-xs">
          <p>{formatDate(r.schedule?.exam_date)}</p>
          <p className="text-[11px] text-slate-500">
            {r.schedule?.start_time.slice(0, 5)} · {r.schedule?.room_name}
          </p>
        </div>
      ),
    },
    {
      key: 'approval',
      header: 'Status Penguji',
      render: (r) => <StatusBadge status={r.approval_status} />,
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (r) => (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openThesisDocument(r.thesis_id)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Eye className="w-3.5 h-3.5" />
            Naskah
          </button>
          <button
            type="button"
            onClick={() => openScoringModal(r)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-700 hover:bg-blue-800 text-white"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            Nilai & Evaluasi
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Jadwal Pengujian & Penilaian Sidang</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Periksa daftar mahasiswa yang diuji, buka naskah tugas akhir, isi lembar evaluasi, dan setujui hasil sidang.
        </p>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        keyField={(r) => r.id}
        loading={loading}
        searchPlaceholder="Cari nama atau NIM mahasiswa..."
        searchFilter={(r, q) =>
          (r.thesis?.student?.full_name || '').toLowerCase().includes(q) ||
          (r.thesis?.student?.nim_nip || '').toLowerCase().includes(q)
        }
        emptyTitle="Belum ada jadwal ujian"
        emptyDescription="Jadwal seminar proposal atau sidang akhir yang menugaskan Anda akan tampil di sini."
      />

      <Modal
        open={Boolean(scoringRow)}
        onClose={() => setScoringRow(null)}
        title="Lembar Penilaian & Evaluasi Sidang"
        subtitle={scoringRow ? `${scoringRow.thesis?.student?.full_name} — ${scoringRow.thesis?.title}` : ''}
        maxWidth="lg"
      >
        <form onSubmit={handleSaveScore} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: `Presentasi (${weights.presentation}%)`, val: presentation, set: setPresentation },
              { label: `Substansi (${weights.substance}%)`, val: substance, set: setSubstance },
              { label: `Metodologi (${weights.methodology}%)`, val: methodology, set: setMethodology },
              { label: `Hasil Penelitian (${weights.results}%)`, val: results, set: setResults },
              { label: `Penguasaan Materi (${weights.mastery}%)`, val: mastery, set: setMastery },
              { label: `Kualitas Revisi (${weights.revision}%)`, val: revision, set: setRevision },
            ].map((item) => (
              <div key={item.label}>
                <label className="block font-medium mb-1">{item.label}</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  required
                  value={item.val}
                  onChange={(e) => item.set(Number(e.target.value))}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            ))}
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="font-medium">Total Nilai Terbobot</span>
            <span className="text-base font-bold font-mono tabular-nums text-blue-700 dark:text-cyan-400">
              {computedTotal} ({getLetterGrade(computedTotal)})
            </span>
          </div>

          <div>
            <label className="block font-medium mb-1">Catatan Evaluasi</label>
            <textarea
              rows={2}
              value={evalNotes}
              onChange={(e) => setEvalNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div>
            <label className="block font-medium mb-1">Catatan Revisi Pasca-Sidang</label>
            <textarea
              rows={2}
              value={revNotes}
              onChange={(e) => setRevNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div>
            <label className="block font-medium mb-1">Keputusan Hasil Sidang</label>
            <select
              value={approvalStatus}
              onChange={(e) => setApprovalStatus(e.target.value as 'approved' | 'revision_required')}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="approved">Setujui Hasil Sidang</option>
              <option value="revision_required">Perlu Revisi Terlebih Dahulu</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setScoringRow(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Simpan Nilai & Evaluasi
            </button>
          </div>
        </form>
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
