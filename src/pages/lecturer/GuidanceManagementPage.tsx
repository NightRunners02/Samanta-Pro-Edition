import { useCallback, useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Eye, XCircle } from 'lucide-react';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { DocumentViewerModal } from '../../components/ui/DocumentViewerModal';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logActivity, sendNotification, supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import type { GuidanceStatus, SupervisionSession, ThesisDocument } from '../../types/database';

export function GuidanceManagementPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SupervisionSession[]>([]);
  const [activeSession, setActiveSession] = useState<SupervisionSession | null>(null);
  const [lecturerNotes, setLecturerNotes] = useState('');
  const [altDate, setAltDate] = useState('');
  const [altTime, setAltTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<ThesisDocument | null>(null);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('supervision_sessions')
      .select('*, student:profiles!supervision_sessions_student_id_fkey(*), attachment:thesis_documents(*)')
      .eq('lecturer_id', profile.id)
      .order('scheduled_date', { ascending: false });
    setSessions((data || []) as SupervisionSession[]);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDecision = async (status: GuidanceStatus) => {
    if (!profile || !activeSession) return;
    setSaving(true);

    const history = [
      ...(activeSession.revision_history || []),
      {
        timestamp: new Date().toISOString(),
        actor: profile.full_name,
        note: lecturerNotes.trim() || `Status diperbarui menjadi ${status}`,
        status,
      },
    ];

    const { error } = await supabase
      .from('supervision_sessions')
      .update({
        status,
        lecturer_notes: lecturerNotes.trim() || null,
        alternative_date: status === 'rescheduled' && altDate ? altDate : null,
        alternative_time: status === 'rescheduled' && altTime ? altTime : null,
        revision_history: history,
      })
      .eq('id', activeSession.id);

    setSaving(false);
    if (error) {
      showToast('Gagal memperbarui sesi bimbingan', 'error', error.message);
      return;
    }

    await sendNotification({
      userId: activeSession.student_id,
      title: `Bimbingan ${status === 'scheduled' ? 'Dijadwalkan' : status === 'completed' ? 'Selesai' : status === 'rescheduled' ? 'Dijadwalkan Ulang' : 'Ditolak'}`,
      message: lecturerNotes.trim() || `Dosen pembimbing memperbarui sesi bimbingan "${activeSession.topic}".`,
      category: 'guidance',
      entityType: 'supervision_sessions',
      entityId: activeSession.id,
    });
    await logActivity(`guidance_${status}`, 'supervision_sessions', activeSession.id, {});

    setActiveSession(null);
    setLecturerNotes('');
    showToast('Sesi bimbingan diperbarui', 'success');
    loadData();
  };

  const columns: ColumnDef<SupervisionSession>[] = [
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
      key: 'topic',
      header: 'Bab & Topik',
      render: (r) => (
        <div>
          <p className="font-medium">Bab {r.chapter_number || '—'} · {r.topic}</p>
          {r.student_notes && <p className="text-[11px] text-slate-500 truncate max-w-xs">{r.student_notes}</p>}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Jadwal',
      sortValue: (r) => r.scheduled_date,
      render: (r) => (
        <span className="font-mono tabular-nums">
          {formatDate(r.scheduled_date)} · {r.scheduled_time.slice(0, 5)}
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
          {r.attachment && (
            <button
              type="button"
              onClick={() => setPreviewDoc(r.attachment || null)}
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              title="Lihat Lampiran"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setActiveSession(r);
              setLecturerNotes(r.lecturer_notes || '');
              setAltDate(r.alternative_date || r.scheduled_date);
              setAltTime(r.alternative_time || r.scheduled_time.slice(0, 5));
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-700 hover:bg-blue-800 text-white"
          >
            Tanggapi
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Manajemen Sesi Bimbingan</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Setujui jadwal, tentukan jadwal alternatif, berikan catatan revisi, atau tandai sesi selesai.
        </p>
      </div>

      <DataTable
        data={sessions}
        columns={columns}
        keyField={(r) => r.id}
        loading={loading}
        searchPlaceholder="Cari mahasiswa atau topik..."
        searchFilter={(r, q) =>
          (r.student?.full_name || '').toLowerCase().includes(q) ||
          r.topic.toLowerCase().includes(q)
        }
        emptyTitle="Belum ada sesi bimbingan"
        emptyDescription="Permintaan bimbingan dari mahasiswa bimbingan Anda akan tampil di sini."
      />

      <Modal
        open={Boolean(activeSession)}
        onClose={() => setActiveSession(null)}
        title="Tanggapi Sesi Bimbingan"
        subtitle={activeSession ? `${activeSession.student?.full_name} — ${activeSession.topic}` : ''}
      >
        {activeSession && (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <p className="font-medium text-slate-500">Catatan Mahasiswa:</p>
              <p className="mt-1">{activeSession.student_notes || 'Tidak ada catatan tambahan.'}</p>
            </div>

            <div>
              <label className="block font-medium mb-1">Catatan & Arahan Dosen</label>
              <textarea
                rows={3}
                value={lecturerNotes}
                onChange={(e) => setLecturerNotes(e.target.value)}
                placeholder="Berikan komentar revisi atau arahan konsultasi..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Tanggal Alternatif (jika reschedule)</label>
                <input
                  type="date"
                  value={altDate}
                  onChange={(e) => setAltDate(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Waktu Alternatif</label>
                <input
                  type="time"
                  value={altTime}
                  onChange={(e) => setAltTime(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
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
                onClick={() => handleDecision('rescheduled')}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50"
              >
                <Calendar className="w-3.5 h-3.5" />
                Jadwal Alternatif
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleDecision('scheduled')}
                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                Terima Jadwal
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleDecision('completed')}
                className="inline-flex items-center gap-1 px-4 py-2 font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Tandai Selesai
              </button>
            </div>
          </div>
        )}
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
