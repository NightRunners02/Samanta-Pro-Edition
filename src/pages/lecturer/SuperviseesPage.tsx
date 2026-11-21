import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, XCircle, AlertCircle } from 'lucide-react';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logActivity, sendNotification, supabase } from '../../lib/supabase';
import type { ThesisSubmission, ThesisSupervisor } from '../../types/database';

export function SuperviseesPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [supervisees, setSupervisees] = useState<ThesisSupervisor[]>([]);
  const [proposedTheses, setProposedTheses] = useState<ThesisSubmission[]>([]);

  const [reviewThesis, setReviewThesis] = useState<ThesisSubmission | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const [{ data: supData }, { data: propData }] = await Promise.all([
      supabase
        .from('thesis_supervisors')
        .select('*, student:profiles!thesis_supervisors_student_id_fkey(*, program:programs(*)), thesis:thesis_submissions(*)')
        .eq('lecturer_id', profile.id)
        .eq('status', 'active'),
      supabase
        .from('thesis_submissions')
        .select('*, student:profiles!thesis_submissions_student_id_fkey(*)')
        .or(`proposed_supervisor_1.eq.${profile.id},proposed_supervisor_2.eq.${profile.id}`)
        .order('created_at', { ascending: false }),
    ]);

    setSupervisees((supData || []) as ThesisSupervisor[]);
    setProposedTheses((propData || []) as ThesisSubmission[]);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTitleDecision = async (decision: 'approved' | 'revision_required' | 'rejected') => {
    if (!profile || !reviewThesis) return;
    setSaving(true);
    const { error } = await supabase
      .from('thesis_submissions')
      .update({
        status: decision,
        reviewer_notes: notes.trim() || null,
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', reviewThesis.id);

    setSaving(false);
    if (error) {
      showToast('Gagal menyimpan keputusan judul', 'error', error.message);
      return;
    }

    await sendNotification({
      userId: reviewThesis.student_id,
      title: `Status Pengajuan Judul: ${decision.replace(/_/g, ' ').toUpperCase()}`,
      message: notes.trim() || `Dosen meninjau pengajuan judul "${reviewThesis.title}".`,
      category: 'submission',
      entityType: 'thesis_submissions',
      entityId: reviewThesis.id,
    });
    await logActivity(`title_${decision}`, 'thesis_submissions', reviewThesis.id, { notes });

    setReviewThesis(null);
    setNotes('');
    showToast('Keputusan review judul tersimpan', 'success');
    loadData();
  };

  const approveExamReadiness = async (sup: ThesisSupervisor, type: 'seminar' | 'defense') => {
    if (type === 'seminar') {
      const { error } = await supabase
        .from('seminar_registrations')
        .update({ supervisor_approved: true })
        .eq('thesis_id', sup.thesis_id);
      if (error) {
        showToast('Gagal menyetujui seminar', 'error', error.message);
        return;
      }
      await sendNotification({
        userId: sup.student_id,
        title: 'Persetujuan Seminar Proposal',
        message: `${profile?.full_name} menyetujui kesiapan seminar proposal Anda.`,
        category: 'seminar',
      });
      showToast('Persetujuan seminar diberikan', 'success');
    } else {
      const field = sup.supervisor_role === 'primary' ? 'supervisor_1_approved' : 'supervisor_2_approved';
      const { error } = await supabase
        .from('defense_registrations')
        .update({ [field]: true })
        .eq('thesis_id', sup.thesis_id);
      if (error) {
        showToast('Gagal menyetujui sidang', 'error', error.message);
        return;
      }
      await sendNotification({
        userId: sup.student_id,
        title: 'Persetujuan Sidang Akhir',
        message: `${profile?.full_name} menyetujui kesiapan sidang akhir Anda.`,
        category: 'defense',
      });
      showToast('Persetujuan sidang akhir diberikan', 'success');
    }
  };

  const supColumns: ColumnDef<ThesisSupervisor>[] = [
    {
      key: 'student',
      header: 'Mahasiswa',
      sortValue: (r) => r.student?.full_name || '',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-slate-100">{r.student?.full_name}</p>
          <p className="text-[11px] font-mono text-slate-500">{r.student?.nim_nip}</p>
        </div>
      ),
    },
    {
      key: 'thesis',
      header: 'Judul Tugas Akhir',
      render: (r) => <p className="max-w-md line-clamp-2">{r.thesis?.title || '—'}</p>,
    },
    {
      key: 'role',
      header: 'Peran',
      render: (r) => (
        <span className="font-medium">
          {r.supervisor_role === 'primary' ? 'Pembimbing 1' : 'Pembimbing 2'}
        </span>
      ),
    },
    {
      key: 'stage',
      header: 'Tahap',
      render: (r) => <StatusBadge status={r.thesis?.current_stage || 'title_submission'} />,
    },
    {
      key: 'actions',
      header: 'Persetujuan',
      align: 'right',
      render: (r) => (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => approveExamReadiness(r, 'seminar')}
            className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            ACC Seminar
          </button>
          <button
            type="button"
            onClick={() => approveExamReadiness(r, 'defense')}
            className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-blue-700 hover:bg-blue-800 text-white"
          >
            ACC Sidang
          </button>
        </div>
      ),
    },
  ];

  const propColumns: ColumnDef<ThesisSubmission>[] = [
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
      header: 'Judul Diajukan',
      render: (r) => <p className="max-w-md line-clamp-2">{r.title}</p>,
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
            setReviewThesis(r);
            setNotes(r.reviewer_notes || '');
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Eye className="w-3.5 h-3.5" />
          Periksa Judul
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Mahasiswa Bimbingan & Review Judul</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Daftar mahasiswa bimbingan aktif serta usulan judul yang membutuhkan pemeriksaan Anda.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Mahasiswa Bimbingan Aktif</h2>
        <DataTable
          data={supervisees}
          columns={supColumns}
          keyField={(r) => r.id}
          loading={loading}
          searchPlaceholder="Cari nama atau NIM mahasiswa..."
          searchFilter={(r, q) =>
            (r.student?.full_name || '').toLowerCase().includes(q) ||
            (r.student?.nim_nip || '').toLowerCase().includes(q)
          }
          emptyTitle="Belum ada mahasiswa bimbingan"
          emptyDescription="Mahasiswa yang ditetapkan oleh Admin Prodi kepada Anda akan muncul di sini."
        />
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Pengajuan Judul Masuk</h2>
        <DataTable
          data={proposedTheses}
          columns={propColumns}
          keyField={(r) => r.id}
          loading={loading}
          emptyTitle="Tidak ada pengajuan judul baru"
          emptyDescription="Pengajuan judul mahasiswa yang mengusulkan Anda sebagai pembimbing akan tampil di sini."
        />
      </div>

      <Modal
        open={Boolean(reviewThesis)}
        onClose={() => setReviewThesis(null)}
        title="Pemeriksaan Pengajuan Judul"
        subtitle={reviewThesis?.student?.full_name}
        maxWidth="lg"
      >
        {reviewThesis && (
          <div className="space-y-4 text-xs">
            <div>
              <p className="font-semibold text-slate-500">Judul Penelitian</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {reviewThesis.title}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="font-semibold text-slate-500">Bidang Penelitian</p>
                <p className="mt-0.5">{reviewThesis.research_field}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">Metode Penelitian</p>
                <p className="mt-0.5">{reviewThesis.research_methodology}</p>
              </div>
            </div>
            <div>
              <p className="font-semibold text-slate-500">Latar Belakang</p>
              <p className="mt-0.5 leading-relaxed">{reviewThesis.background}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-500">Rumusan Masalah</p>
              <p className="mt-0.5 leading-relaxed">{reviewThesis.problem_statement}</p>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Catatan Evaluasi / Revisi
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Berikan masukan atau alasan persetujuan/revisi/penolakan..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => handleTitleDecision('rejected')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                Tolak Judul
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleTitleDecision('revision_required')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                Minta Revisi
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleTitleDecision('approved')}
                className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Setujui Judul
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
