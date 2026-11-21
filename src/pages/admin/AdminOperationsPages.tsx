import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, UserCog, XCircle } from 'lucide-react';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { DocumentViewerModal } from '../../components/ui/DocumentViewerModal';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logActivity, sendNotification, supabase } from '../../lib/supabase';
import { DOCUMENT_CATEGORY_LABELS, formatDate, formatDateTime } from '../../lib/utils';
import type {
  DocumentStatus,
  Profile,
  SupervisionSession,
  ThesisDocument,
  ThesisStatus,
  ThesisSubmission,
  ThesisSupervisor,
} from '../../types/database';

// ==========================================
// 1. Thesis Submission Review (Admin)
// ==========================================
export function AdminSubmissionsPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ThesisSubmission[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [active, setActive] = useState<ThesisSubmission | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('thesis_submissions')
      .select('*, student:profiles!thesis_submissions_student_id_fkey(*), program:programs(*)')
      .order('created_at', { ascending: false });

    if (profile?.role_code === 'program_admin' && profile.program_id) {
      q = q.eq('program_id', profile.program_id);
    }

    const { data } = await q;
    setRows((data || []) as ThesisSubmission[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDecision = async (status: ThesisStatus) => {
    if (!profile || !active) return;
    setSaving(true);
    const { error } = await supabase
      .from('thesis_submissions')
      .update({
        status,
        reviewer_notes: notes.trim() || null,
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', active.id);

    setSaving(false);
    if (error) {
      showToast('Gagal menyimpan review judul', 'error', error.message);
      return;
    }

    await sendNotification({
      userId: active.student_id,
      title: `Pengajuan Judul: ${status.replace(/_/g, ' ').toUpperCase()}`,
      message: notes.trim() || `Pengajuan judul "${active.title}" telah ditinjau oleh Prodi.`,
      category: 'submission',
      entityType: 'thesis_submissions',
      entityId: active.id,
    });
    await logActivity(`admin_title_${status}`, 'thesis_submissions', active.id, { notes });

    setActive(null);
    setNotes('');
    showToast('Status pengajuan judul diperbarui', 'success');
    loadData();
  };

  const filtered = statusFilter === 'all' ? rows : rows.filter((r) => r.status === statusFilter);

  const columns: ColumnDef<ThesisSubmission>[] = [
    {
      key: 'student',
      header: 'Mahasiswa',
      sortValue: (r) => r.student?.full_name || '',
      render: (r) => (
        <div>
          <p className="font-medium">{r.student?.full_name}</p>
          <p className="text-[11px] font-mono text-slate-500">{r.student?.nim_nip} · {r.program?.name}</p>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Judul & Bidang',
      render: (r) => (
        <div className="max-w-md">
          <p className="font-medium line-clamp-2">{r.title}</p>
          <p className="text-[11px] text-slate-500">{r.research_field}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'submitted',
      header: 'Tanggal',
      render: (r) => <span className="font-mono text-slate-500">{formatDateTime(r.submitted_at || r.created_at)}</span>,
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
            setNotes(r.reviewer_notes || '');
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-700 hover:bg-blue-800 text-white"
        >
          <Eye className="w-3.5 h-3.5" />
          Review
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Pengajuan Judul Tugas Akhir</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Periksa kelayakan judul, latar belakang, metodologi, serta tentukan persetujuan atau revisi.
        </p>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        keyField={(r) => r.id}
        loading={loading}
        searchPlaceholder="Cari judul, nama, atau NIM..."
        searchFilter={(r, q) =>
          r.title.toLowerCase().includes(q) ||
          (r.student?.full_name || '').toLowerCase().includes(q) ||
          (r.student?.nim_nip || '').toLowerCase().includes(q)
        }
        toolbarExtra={
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          >
            <option value="all">Semua Status</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="revision_required">Revision Required</option>
            <option value="rejected">Rejected</option>
          </select>
        }
      />

      <Modal
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title="Review Pengajuan Judul TA"
        subtitle={active ? `${active.student?.full_name} (${active.student?.nim_nip || '—'})` : ''}
        maxWidth="lg"
      >
        {active && (
          <div className="space-y-4 text-xs">
            <div>
              <p className="text-slate-500 font-medium">Judul Diajukan</p>
              <p className="text-sm font-semibold mt-0.5">{active.title}</p>
            </div>
            <div>
              <p className="text-slate-500 font-medium">Latar Belakang</p>
              <p className="mt-0.5 leading-relaxed">{active.background}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-slate-500 font-medium">Rumusan Masalah</p>
                <p className="mt-0.5">{active.problem_statement}</p>
              </div>
              <div>
                <p className="text-slate-500 font-medium">Metode Penelitian</p>
                <p className="mt-0.5">{active.research_methodology}</p>
              </div>
            </div>
            <div>
              <label className="block font-medium mb-1">Catatan Verifikasi Prodi</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => handleDecision('rejected')}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                Tolak
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleDecision('revision_required')}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                Minta Revisi
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleDecision('under_review')}
                className="px-3 py-2 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                Tandai Under Review
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleDecision('approved')}
                className="inline-flex items-center gap-1 px-4 py-2 font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Approve Judul
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ==========================================
// 2. Supervisor Assignment
// ==========================================
export function SupervisorAssignmentPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [theses, setTheses] = useState<ThesisSubmission[]>([]);
  const [lecturers, setLecturers] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<ThesisSupervisor[]>([]);
  const [loads, setLoads] = useState<Record<string, number>>({});

  const [targetThesis, setTargetThesis] = useState<ThesisSubmission | null>(null);
  const [sup1, setSup1] = useState('');
  const [sup2, setSup2] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: tData }, { data: lData }, { data: aData }] = await Promise.all([
      supabase
        .from('thesis_submissions')
        .select('*, student:profiles!thesis_submissions_student_id_fkey(*)')
        .eq('status', 'approved')
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('*')
        .in('role_code', ['supervisor', 'examiner'])
        .eq('is_active', true)
        .order('full_name'),
      supabase
        .from('thesis_supervisors')
        .select('*, lecturer:profiles!thesis_supervisors_lecturer_id_fkey(*)')
        .eq('status', 'active'),
    ]);

    const loadMap: Record<string, number> = {};
    for (const a of (aData || []) as ThesisSupervisor[]) {
      loadMap[a.lecturer_id] = (loadMap[a.lecturer_id] || 0) + 1;
    }

    setTheses((tData || []) as ThesisSubmission[]);
    setLecturers((lData || []) as Profile[]);
    setAssignments((aData || []) as ThesisSupervisor[]);
    setLoads(loadMap);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAssign = (t: ThesisSubmission) => {
    setTargetThesis(t);
    const existing = assignments.filter((a) => a.thesis_id === t.id);
    const p1 = existing.find((e) => e.supervisor_role === 'primary');
    const p2 = existing.find((e) => e.supervisor_role === 'secondary');
    setSup1(p1?.lecturer_id || t.proposed_supervisor_1 || '');
    setSup2(p2?.lecturer_id || t.proposed_supervisor_2 || '');
  };

  const handleSave = async () => {
    if (!profile || !targetThesis || !sup1) {
      showToast('Pembimbing 1 wajib dipilih', 'warning');
      return;
    }
    if (sup1 === sup2) {
      showToast('Pembimbing 1 dan Pembimbing 2 harus berbeda', 'warning');
      return;
    }

    const l1 = lecturers.find((l) => l.id === sup1);
    if (l1 && (loads[sup1] || 0) >= l1.max_supervisee_quota) {
      const alreadyAssigned = assignments.some((a) => a.thesis_id === targetThesis.id && a.lecturer_id === sup1);
      if (!alreadyAssigned) {
        showToast('Kuota pembimbing penuh', 'error', `${l1.full_name} sudah mencapai batas ${l1.max_supervisee_quota} mahasiswa.`);
        return;
      }
    }

    setSaving(true);
    await supabase.from('thesis_supervisors').delete().eq('thesis_id', targetThesis.id);

    const inserts = [
      {
        thesis_id: targetThesis.id,
        student_id: targetThesis.student_id,
        lecturer_id: sup1,
        supervisor_role: 'primary',
        assigned_by: profile.id,
      },
    ];
    if (sup2) {
      inserts.push({
        thesis_id: targetThesis.id,
        student_id: targetThesis.student_id,
        lecturer_id: sup2,
        supervisor_role: 'secondary',
        assigned_by: profile.id,
      });
    }

    const { error } = await supabase.from('thesis_supervisors').insert(inserts);
    setSaving(false);
    if (error) {
      showToast('Gagal menetapkan pembimbing', 'error', error.message);
      return;
    }

    await sendNotification({
      userId: targetThesis.student_id,
      title: 'Dosen Pembimbing Ditetapkan',
      message: `Pembimbing tugas akhir "${targetThesis.title}" telah ditetapkan oleh Program Studi.`,
      category: 'supervisor',
      entityType: 'thesis_submissions',
      entityId: targetThesis.id,
    });
    await sendNotification({
      userId: sup1,
      title: 'Penugasan Pembimbing 1',
      message: `Anda ditetapkan sebagai Pembimbing 1 untuk ${targetThesis.student?.full_name}.`,
      category: 'supervisor',
    });
    if (sup2) {
      await sendNotification({
        userId: sup2,
        title: 'Penugasan Pembimbing 2',
        message: `Anda ditetapkan sebagai Pembimbing 2 untuk ${targetThesis.student?.full_name}.`,
        category: 'supervisor',
      });
    }
    await logActivity('assign_supervisors', 'thesis_supervisors', targetThesis.id, { sup1, sup2 });

    setTargetThesis(null);
    showToast('Dosen pembimbing berhasil ditetapkan', 'success');
    loadData();
  };

  const columns: ColumnDef<ThesisSubmission>[] = [
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
      key: 'title',
      header: 'Judul Tugas Akhir',
      render: (r) => <p className="max-w-md line-clamp-2">{r.title}</p>,
    },
    {
      key: 'supervisors',
      header: 'Pembimbing Ditetapkan',
      render: (r) => {
        const list = assignments.filter((a) => a.thesis_id === r.id);
        if (list.length === 0) return <span className="text-amber-700 dark:text-amber-400">Belum Ditetapkan</span>;
        return (
          <div className="space-y-0.5">
            {list.map((a) => (
              <p key={a.id}>
                <span className="text-slate-400">{a.supervisor_role === 'primary' ? 'P1:' : 'P2:'}</span>{' '}
                {a.lecturer?.full_name}
              </p>
            ))}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (r) => (
        <button
          type="button"
          onClick={() => openAssign(r)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-700 hover:bg-blue-800 text-white"
        >
          <UserCog className="w-3.5 h-3.5" />
          Tetapkan
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Penetapan Dosen Pembimbing</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Tentukan Pembimbing 1 dan Pembimbing 2 dengan memantau beban bimbingan terhadap kuota masing-masing dosen.
        </p>
      </div>

      <DataTable
        data={theses}
        columns={columns}
        keyField={(r) => r.id}
        loading={loading}
        searchPlaceholder="Cari mahasiswa atau judul..."
        searchFilter={(r, q) =>
          r.title.toLowerCase().includes(q) || (r.student?.full_name || '').toLowerCase().includes(q)
        }
        emptyTitle="Belum ada judul yang disetujui"
        emptyDescription="Judul tugas akhir berstatus Approved akan tampil di sini untuk penetapan dosen pembimbing."
      />

      <Modal
        open={Boolean(targetThesis)}
        onClose={() => setTargetThesis(null)}
        title="Tetapkan Dosen Pembimbing"
        subtitle={targetThesis?.student?.full_name}
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-medium mb-1">Pembimbing 1 *</label>
            <select
              value={sup1}
              onChange={(e) => setSup1(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="">-- Pilih Pembimbing 1 --</option>
              {lecturers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.full_name} (Beban: {loads[l.id] || 0}/{l.max_supervisee_quota})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-medium mb-1">Pembimbing 2 (Opsional)</label>
            <select
              value={sup2}
              onChange={(e) => setSup2(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="">-- Tanpa Pembimbing 2 --</option>
              {lecturers
                .filter((l) => l.id !== sup1)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.full_name} (Beban: {loads[l.id] || 0}/{l.max_supervisee_quota})
                  </option>
                ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setTargetThesis(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="px-4 py-2 font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
            >
              {saving ? 'Menyimpan...' : 'Simpan Penetapan'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ==========================================
// 3. Guidance Monitoring (Admin)
// ==========================================
export function AdminGuidancePage() {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SupervisionSession[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('supervision_sessions')
        .select('*, student:profiles!supervision_sessions_student_id_fkey(*), lecturer:profiles!supervision_sessions_lecturer_id_fkey(*)')
        .order('scheduled_date', { ascending: false });
      setSessions((data || []) as SupervisionSession[]);
      setLoading(false);
    };
    load();
  }, []);

  const columns: ColumnDef<SupervisionSession>[] = [
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
      key: 'lecturer',
      header: 'Dosen Pembimbing',
      render: (r) => <span>{r.lecturer?.full_name}</span>,
    },
    {
      key: 'topic',
      header: 'Bab & Topik',
      render: (r) => <span>Bab {r.chapter_number || '—'} · {r.topic}</span>,
    },
    {
      key: 'date',
      header: 'Tanggal',
      render: (r) => <span className="font-mono tabular-nums">{formatDate(r.scheduled_date)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Monitoring Bimbingan</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Rekap seluruh aktivitas sesi bimbingan tugas akhir mahasiswa dan dosen pembimbing.
        </p>
      </div>
      <DataTable
        data={sessions}
        columns={columns}
        keyField={(r) => r.id}
        loading={loading}
        searchPlaceholder="Cari mahasiswa, dosen, atau topik..."
        searchFilter={(r, q) =>
          (r.student?.full_name || '').toLowerCase().includes(q) ||
          (r.lecturer?.full_name || '').toLowerCase().includes(q) ||
          r.topic.toLowerCase().includes(q)
        }
      />
    </div>
  );
}

// ==========================================
// 4. Document Verification (Admin)
// ==========================================
export function DocumentVerificationPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<ThesisDocument[]>([]);
  const [previewDoc, setPreviewDoc] = useState<ThesisDocument | null>(null);
  const [reviewDoc, setReviewDoc] = useState<ThesisDocument | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('thesis_documents')
      .select('*, student:profiles!thesis_documents_student_id_fkey(*)')
      .eq('is_latest', true)
      .order('created_at', { ascending: false });
    setDocs((data || []) as ThesisDocument[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDecision = async (status: DocumentStatus) => {
    if (!profile || !reviewDoc) return;
    setSaving(true);
    const { error } = await supabase
      .from('thesis_documents')
      .update({ status, revision_notes: notes.trim() || null })
      .eq('id', reviewDoc.id);

    if (!error) {
      await supabase.from('document_reviews').insert({
        document_id: reviewDoc.id,
        reviewer_id: profile.id,
        decision: status === 'pending' || status === 'under_review' ? 'comment' : status,
        comments: notes.trim() || `Dokumen berstatus ${status}`,
      });
      await sendNotification({
        userId: reviewDoc.student_id,
        title: `Verifikasi Dokumen: ${reviewDoc.title}`,
        message: notes.trim() || `Dokumen Anda diperbarui menjadi ${status}.`,
        category: 'document',
        entityType: 'thesis_documents',
        entityId: reviewDoc.id,
      });
      await logActivity(`verify_document_${status}`, 'thesis_documents', reviewDoc.id, {});
    }

    setSaving(false);
    if (error) {
      showToast('Gagal memverifikasi dokumen', 'error', error.message);
      return;
    }
    setReviewDoc(null);
    setNotes('');
    showToast('Status verifikasi dokumen disimpan', 'success');
    loadData();
  };

  const columns: ColumnDef<ThesisDocument>[] = [
    {
      key: 'student',
      header: 'Mahasiswa',
      render: (r) => (
        <div>
          <p className="font-medium">{r.student?.full_name || '—'}</p>
          <p className="text-[11px] font-mono text-slate-500">{r.student?.nim_nip}</p>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Dokumen',
      render: (r) => (
        <div>
          <p className="font-medium">{r.title}</p>
          <p className="text-[11px] text-slate-500">
            {DOCUMENT_CATEGORY_LABELS[r.category] || r.category} · v{r.version_number}
          </p>
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
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPreviewDoc(r)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700"
          >
            <Eye className="w-3.5 h-3.5" />
            Lihat
          </button>
          <button
            type="button"
            onClick={() => {
              setReviewDoc(r);
              setNotes(r.revision_notes || '');
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
        <h1 className="text-xl font-bold tracking-tight">Document Verification</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Periksa keabsahan berkas persyaratan administrasi, proposal, dan dokumen akhir mahasiswa.
        </p>
      </div>

      <DataTable
        data={docs}
        columns={columns}
        keyField={(r) => r.id}
        loading={loading}
        searchPlaceholder="Cari dokumen atau nama mahasiswa..."
        searchFilter={(r, q) =>
          r.title.toLowerCase().includes(q) || (r.student?.full_name || '').toLowerCase().includes(q)
        }
      />

      <Modal
        open={Boolean(reviewDoc)}
        onClose={() => setReviewDoc(null)}
        title="Verifikasi Dokumen"
        subtitle={reviewDoc?.title}
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-medium mb-1">Catatan Verifikasi / Revisi</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleDecision('rejected')}
              className="px-3 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
            >
              Tolak
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleDecision('revision_required')}
              className="px-3 py-2 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50"
            >
              Minta Revisi
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleDecision('approved')}
              className="px-4 py-2 font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Setujui Dokumen
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
