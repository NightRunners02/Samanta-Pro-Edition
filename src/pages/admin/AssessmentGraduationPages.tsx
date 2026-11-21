import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Save } from 'lucide-react';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { DocumentViewerModal } from '../../components/ui/DocumentViewerModal';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logActivity, sendNotification, supabase } from '../../lib/supabase';
import { formatDate, getLetterGrade } from '../../lib/utils';
import type {
  ExamScore,
  GraduationRecord,
  GraduationStatus,
  PlagiarismCheck,
  PlagiarismStatus,
  Profile,
  ScoringWeights,
  ThesisDocument,
  ThesisSubmission,
} from '../../types/database';

// ==========================================
// 1. Score Management & Rubric Weights
// ==========================================
export function ScoreManagementPage() {
  const { systemSettings, refreshSettings } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<Array<ExamScore & { thesis?: ThesisSubmission & { student?: Profile } }>>([]);
  const [weights, setWeights] = useState<ScoringWeights>({
    presentation: 15,
    substance: 25,
    methodology: 20,
    results: 20,
    mastery: 15,
    revision: 5,
  });
  const [savingWeights, setSavingWeights] = useState(false);

  useEffect(() => {
    if (systemSettings?.scoring_weights) {
      setWeights(systemSettings.scoring_weights);
    }
  }, [systemSettings]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('exam_scores')
      .select('*, examiner:profiles!exam_scores_examiner_id_fkey(*), thesis:thesis_submissions(*, student:profiles!thesis_submissions_student_id_fkey(*))')
      .order('created_at', { ascending: false });
    setScores((data || []) as typeof scores);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalWeight =
    weights.presentation +
    weights.substance +
    weights.methodology +
    weights.results +
    weights.mastery +
    weights.revision;

  const handleSaveWeights = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!systemSettings?.id) return;
    if (totalWeight !== 100) {
      showToast('Total bobot harus 100%', 'warning', `Saat ini total bobot adalah ${totalWeight}%.`);
      return;
    }
    setSavingWeights(true);
    const { error } = await supabase
      .from('system_settings')
      .update({ scoring_weights: weights })
      .eq('id', systemSettings.id);
    setSavingWeights(false);
    if (error) {
      showToast('Gagal menyimpan bobot nilai', 'error', error.message);
      return;
    }
    await refreshSettings();
    await logActivity('update_scoring_weights', 'system_settings', systemSettings.id, weights as unknown as Record<string, unknown>);
    showToast('Rubrik & bobot penilaian disimpan', 'success');
  };

  const columns: ColumnDef<(typeof scores)[number]>[] = [
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
      key: 'examiner',
      header: 'Dosen Penilai',
      render: (r) => <span>{r.examiner?.full_name || '—'}</span>,
    },
    {
      key: 'total',
      header: 'Nilai Akhir',
      align: 'right',
      render: (r) => (
        <span className="font-mono font-semibold tabular-nums">
          {r.weighted_total} ({getLetterGrade(Number(r.weighted_total))})
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Kelulusan',
      render: (r) => (
        <span className={Number(r.weighted_total) >= 60 ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-rose-700 font-medium'}>
          {Number(r.weighted_total) >= 60 ? 'Lulus' : 'Tidak Lulus'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Score Management & Rubrik Penilaian</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Konfigurasi bobot rubrik penilaian sidang dan rekap nilai dari seluruh dosen penguji.
        </p>
      </div>

      <form
        onSubmit={handleSaveWeights}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 text-xs"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Konfigurasi Bobot Rubrik Penilaian</h2>
          <span className={`font-mono font-semibold ${totalWeight === 100 ? 'text-emerald-600' : 'text-rose-600'}`}>
            Total: {totalWeight}%
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { key: 'presentation', label: 'Presentasi (%)' },
            { key: 'substance', label: 'Substansi (%)' },
            { key: 'methodology', label: 'Metodologi (%)' },
            { key: 'results', label: 'Hasil (%)' },
            { key: 'mastery', label: 'Penguasaan (%)' },
            { key: 'revision', label: 'Revisi (%)' },
          ].map((item) => (
            <div key={item.key}>
              <label className="block font-medium mb-1">{item.label}</label>
              <input
                type="number"
                min={0}
                max={100}
                value={weights[item.key as keyof ScoringWeights]}
                onChange={(e) =>
                  setWeights({ ...weights, [item.key]: Number(e.target.value) })
                }
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingWeights}
            className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
          >
            <Save className="w-3.5 h-3.5" />
            Simpan Bobot Rubrik
          </button>
        </div>
      </form>

      <DataTable
        data={scores}
        columns={columns}
        keyField={(r) => r.id}
        loading={loading}
        emptyTitle="Belum ada nilai sidang masuk"
        emptyDescription="Nilai dari dosen penguji akan terakumulasi di sini."
      />
    </div>
  );
}

// ==========================================
// 2. Plagiarism Verification (Admin)
// ==========================================
export function AdminPlagiarismPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PlagiarismCheck[]>([]);
  const [active, setActive] = useState<PlagiarismCheck | null>(null);
  const [similarityPct, setSimilarityPct] = useState(15);
  const [notes, setNotes] = useState('');
  const [previewDoc, setPreviewDoc] = useState<ThesisDocument | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('plagiarism_checks')
      .select('*, student:profiles!plagiarism_checks_student_id_fkey(*), thesis:thesis_submissions(*), document:thesis_documents!plagiarism_checks_document_id_fkey(*)')
      .order('created_at', { ascending: false });
    setRows((data || []) as PlagiarismCheck[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDecision = async (status: PlagiarismStatus) => {
    if (!profile || !active) return;
    if (status === 'approved' && similarityPct > active.max_allowed_percent) {
      showToast(
        'Melebihi batas plagiasi prodi',
        'warning',
        `Persentase ${similarityPct}% melebihi batas maksimal ${active.max_allowed_percent}%.`
      );
      return;
    }

    const { error } = await supabase
      .from('plagiarism_checks')
      .update({
        similarity_percent: similarityPct,
        status,
        reviewer_notes: notes.trim() || null,
        verified_by: profile.id,
        verified_at: new Date().toISOString(),
      })
      .eq('id', active.id);

    if (error) {
      showToast('Gagal memverifikasi plagiasi', 'error', error.message);
      return;
    }

    await sendNotification({
      userId: active.student_id,
      title: `Verifikasi Plagiasi: ${status.toUpperCase()}`,
      message: `Hasil pemeriksaan manual: ${similarityPct}% (Batas: ${active.max_allowed_percent}%). ${notes}`,
      category: 'plagiarism',
    });
    await logActivity(`plagiarism_${status}`, 'plagiarism_checks', active.id, { similarityPct });

    setActive(null);
    showToast('Verifikasi plagiasi tersimpan', 'success');
    loadData();
  };

  const columns: ColumnDef<PlagiarismCheck>[] = [
    {
      key: 'student',
      header: 'Mahasiswa',
      render: (r) => (
        <div>
          <p className="font-medium">{r.student?.full_name}</p>
          <p className="text-[11px] font-mono text-slate-500">{r.student?.nim_nip}</p>
        </div>
      ),
    },
    {
      key: 'pct',
      header: 'Similarity / Batas',
      align: 'right',
      render: (r) => (
        <span className="font-mono tabular-nums">
          {r.similarity_percent !== null ? `${r.similarity_percent}%` : '—'} / {r.max_allowed_percent}%
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (r) => (
        <div className="inline-flex items-center gap-1.5">
          {r.document && (
            <button
              type="button"
              onClick={() => setPreviewDoc(r.document || null)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700"
            >
              <Eye className="w-3.5 h-3.5" />
              Bukti
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setActive(r);
              setSimilarityPct(Number(r.similarity_percent ?? 15));
              setNotes(r.reviewer_notes || '');
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
        <h1 className="text-xl font-bold tracking-tight">Plagiarism Verification</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Periksa dokumen laporan kemiripan yang diunggah mahasiswa dan input persentase terverifikasi secara manual.
        </p>
      </div>

      <DataTable data={rows} columns={columns} keyField={(r) => r.id} loading={loading} />

      <Modal open={Boolean(active)} onClose={() => setActive(null)} title="Verifikasi Manual Plagiasi" maxWidth="sm">
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-medium mb-1">Persentase Similarity Terverifikasi (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={similarityPct}
              onChange={(e) => setSimilarityPct(Number(e.target.value))}
              className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Catatan Verifikasi</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => handleDecision('rejected')} className="px-3 py-2 rounded-lg border border-rose-200 text-rose-700">Tolak</button>
            <button type="button" onClick={() => handleDecision('revision_required')} className="px-3 py-2 rounded-lg border border-amber-200 text-amber-700">Revisi</button>
            <button type="button" onClick={() => handleDecision('approved')} className="px-4 py-2 font-medium rounded-lg bg-emerald-600 text-white">Approve</button>
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

// ==========================================
// 3. Graduation / Yudisium Management (Admin)
// ==========================================
export function GraduationManagementPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<GraduationRecord[]>([]);
  const [active, setActive] = useState<GraduationRecord | null>(null);
  const [yudisiumPeriod, setYudisiumPeriod] = useState('');
  const [gradDate, setGradDate] = useState('');
  const [certNo, setCertNo] = useState('');
  const [notes, setNotes] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('graduation_records')
      .select('*, student:profiles!graduation_records_student_id_fkey(*), thesis:thesis_submissions(*)')
      .order('created_at', { ascending: false });
    setRows((data || []) as GraduationRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDecision = async (status: GraduationStatus) => {
    if (!profile || !active) return;
    const { error } = await supabase
      .from('graduation_records')
      .update({
        status,
        yudisium_period: yudisiumPeriod.trim() || active.yudisium_period,
        graduation_date: gradDate || null,
        certificate_number: certNo.trim() || null,
        admin_notes: notes.trim() || null,
        validated_by: profile.id,
        validated_at: new Date().toISOString(),
      })
      .eq('id', active.id);

    if (error) {
      showToast('Gagal memperbarui yudisium', 'error', error.message);
      return;
    }

    if (status === 'graduated') {
      await supabase
        .from('thesis_submissions')
        .update({ current_stage: 'completed' })
        .eq('id', active.thesis_id);
      await supabase
        .from('profiles')
        .update({ academic_status: 'graduated' })
        .eq('id', active.student_id);
    }

    await sendNotification({
      userId: active.student_id,
      title: status === 'graduated' ? 'Kelulusan Yudisium Divalidasi' : `Status Yudisium: ${status.toUpperCase()}`,
      message: notes.trim() || `Status pengajuan yudisium Anda diperbarui menjadi ${status}.`,
      category: 'graduation',
    });
    await logActivity(`yudisium_${status}`, 'graduation_records', active.id, { certNo });

    setActive(null);
    showToast('Status yudisium diperbarui', 'success');
    loadData();
  };

  const columns: ColumnDef<GraduationRecord>[] = [
    {
      key: 'student',
      header: 'Mahasiswa',
      render: (r) => (
        <div>
          <p className="font-medium">{r.student?.full_name}</p>
          <p className="text-[11px] font-mono text-slate-500">{r.student?.nim_nip}</p>
        </div>
      ),
    },
    {
      key: 'score',
      header: 'Nilai Akhir',
      align: 'right',
      render: (r) => (
        <span className="font-mono tabular-nums">
          {r.final_score ?? '—'} ({r.final_grade || '—'})
        </span>
      ),
    },
    {
      key: 'period',
      header: 'Periode & Tgl Lulus',
      render: (r) => (
        <div>
          <p>{r.yudisium_period || '—'}</p>
          <p className="text-[11px] font-mono text-slate-500">{formatDate(r.graduation_date)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (r) => (
        <button
          type="button"
          onClick={() => {
            setActive(r);
            setYudisiumPeriod(r.yudisium_period || 'Yudisium Periode I 2026');
            setGradDate(r.graduation_date || new Date().toISOString().slice(0, 10));
            setCertNo(r.certificate_number || '');
            setNotes(r.admin_notes || '');
          }}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-700 hover:bg-blue-800 text-white"
        >
          Validasi
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Graduation & Yudisium Management</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Periksa persyaratan yudisium, tetapkan periode yudisium, dan validasi kelulusan resmi mahasiswa.
        </p>
      </div>
      <DataTable data={rows} columns={columns} keyField={(r) => r.id} loading={loading} />

      <Modal open={Boolean(active)} onClose={() => setActive(null)} title="Validasi Yudisium Mahasiswa">
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Periode Yudisium</label>
              <input
                type="text"
                value={yudisiumPeriod}
                onChange={(e) => setYudisiumPeriod(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Tanggal Kelulusan</label>
              <input
                type="date"
                value={gradDate}
                onChange={(e) => setGradDate(e.target.value)}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Nomor SK / Sertifikat Yudisium</label>
              <input
                type="text"
                value={certNo}
                onChange={(e) => setCertNo(e.target.value)}
                placeholder="SK-YUD/2026/001"
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium mb-1">Catatan</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => handleDecision('revision_required')} className="px-3 py-2 rounded-lg border border-amber-200 text-amber-700">Revisi</button>
            <button type="button" onClick={() => handleDecision('approved')} className="px-3 py-2 rounded-lg border border-blue-200 text-blue-700">Approve Yudisium</button>
            <button type="button" onClick={() => handleDecision('graduated')} className="px-4 py-2 font-medium rounded-lg bg-emerald-600 text-white">Validasi Lulus (Graduated)</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
