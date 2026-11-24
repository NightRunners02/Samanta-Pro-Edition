import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarPlus, FileBadge2, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { DecreeIssuanceModal } from '../../components/admin/DecreeIssuanceModal';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { ensureInitialDecreeIfEligible, issueOfficialDecree } from '../../lib/decreeService';
import { logActivity, sendNotification, supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import type {
  DefenseRegistration,
  ExamRegistrationStatus,
  ExamSchedule,
  ExaminerAssignment,
  OfficialDecree,
  Profile,
  SeminarRegistration,
  ThesisSubmission,
} from '../../types/database';

// ==========================================
// 1. Admin Seminar Proposal Management
// ==========================================
export function AdminSeminarPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SeminarRegistration[]>([]);
  const [active, setActive] = useState<SeminarRegistration | null>(null);
  const [notes, setNotes] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('seminar_registrations')
      .select('*, student:profiles!seminar_registrations_student_id_fkey(*), thesis:thesis_submissions(*)')
      .order('created_at', { ascending: false });
    setRows((data || []) as SeminarRegistration[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDecision = async (status: ExamRegistrationStatus) => {
    if (!profile || !active) return;
    const { error } = await supabase
      .from('seminar_registrations')
      .update({
        status,
        admin_notes: notes.trim() || null,
        verified_by: profile.id,
        verified_at: new Date().toISOString(),
      })
      .eq('id', active.id);
    if (error) {
      showToast('Gagal memperbarui seminar', 'error', error.message);
      return;
    }
    await sendNotification({
      userId: active.student_id,
      title: `Status Seminar Proposal: ${status.toUpperCase()}`,
      message: notes.trim() || `Pendaftaran seminar proposal Anda berstatus ${status}.`,
      category: 'seminar',
    });
    await logActivity(`seminar_${status}`, 'seminar_registrations', active.id, {});
    setActive(null);
    setNotes('');
    showToast('Status seminar diperbarui', 'success');
    loadData();
  };

  const columns: ColumnDef<SeminarRegistration>[] = [
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
      key: 'thesis',
      header: 'Judul TA',
      render: (r) => <p className="max-w-md line-clamp-2">{r.thesis?.title}</p>,
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
            setNotes(r.admin_notes || '');
          }}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-700 hover:bg-blue-800 text-white"
        >
          Periksa
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Seminar Proposal Management</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Verifikasi berkas pendaftaran seminar proposal mahasiswa sebelum penjadwalan.
        </p>
      </div>
      <DataTable data={rows} columns={columns} keyField={(r) => r.id} loading={loading} />
      <Modal open={Boolean(active)} onClose={() => setActive(null)} title="Verifikasi Seminar Proposal">
        <div className="space-y-4 text-xs">
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Catatan verifikasi..."
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => handleDecision('rejected')} className="px-3 py-2 rounded-lg border border-rose-200 text-rose-700">Tolak</button>
            <button type="button" onClick={() => handleDecision('revision_required')} className="px-3 py-2 rounded-lg border border-amber-200 text-amber-700">Revisi</button>
            <button type="button" onClick={() => handleDecision('approved')} className="px-4 py-2 font-medium rounded-lg bg-emerald-600 text-white">Approve</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ==========================================
// 2. Admin Defense Registration Management
// ==========================================
export function AdminDefensePage() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DefenseRegistration[]>([]);
  const [active, setActive] = useState<DefenseRegistration | null>(null);
  const [notes, setNotes] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('defense_registrations')
      .select('*, student:profiles!defense_registrations_student_id_fkey(*), thesis:thesis_submissions(*)')
      .order('created_at', { ascending: false });
    setRows((data || []) as DefenseRegistration[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDecision = async (status: ExamRegistrationStatus) => {
    if (!profile || !active) return;
    const { error } = await supabase
      .from('defense_registrations')
      .update({
        status,
        admin_notes: notes.trim() || null,
        verified_by: profile.id,
        verified_at: new Date().toISOString(),
      })
      .eq('id', active.id);
    if (error) {
      showToast('Gagal memperbarui sidang', 'error', error.message);
      return;
    }
    await sendNotification({
      userId: active.student_id,
      title: `Status Pendaftaran Sidang: ${status.toUpperCase()}`,
      message: notes.trim() || `Pendaftaran sidang akhir Anda berstatus ${status}.`,
      category: 'defense',
    });
    await logActivity(`defense_${status}`, 'defense_registrations', active.id, {});

    if (status === 'approved') {
      await ensureInitialDecreeIfEligible({
        thesisId: active.thesis_id,
        decreeType: 'sk_penguji',
        actorProfileId: profile.id,
        isAdminAction: true,
      });
    }

    setActive(null);
    setNotes('');
    showToast('Status pendaftaran sidang diperbarui', 'success');
    loadData();
  };

  const columns: ColumnDef<DefenseRegistration>[] = [
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
      key: 'thesis',
      header: 'Judul TA',
      render: (r) => <p className="max-w-md line-clamp-2">{r.thesis?.title}</p>,
    },
    {
      key: 'sup',
      header: 'ACC Pembimbing',
      render: (r) => (
        <span className="text-xs">
          P1: {r.supervisor_1_approved ? 'Ya' : 'Belum'} · P2: {r.supervisor_2_approved ? 'Ya' : 'Opsional'}
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
        <button
          type="button"
          onClick={() => {
            setActive(r);
            setNotes(r.admin_notes || '');
          }}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-700 hover:bg-blue-800 text-white"
        >
          Verifikasi
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Defense Registration Management</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Periksa persyaratan, persetujuan pembimbing, dan validasi pendaftaran sidang tugas akhir.
        </p>
      </div>
      <DataTable data={rows} columns={columns} keyField={(r) => r.id} loading={loading} />
      <Modal open={Boolean(active)} onClose={() => setActive(null)} title="Verifikasi Pendaftaran Sidang">
        <div className="space-y-4 text-xs">
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Catatan verifikasi..."
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => handleDecision('rejected')} className="px-3 py-2 rounded-lg border border-rose-200 text-rose-700">Tolak</button>
            <button type="button" onClick={() => handleDecision('revision_required')} className="px-3 py-2 rounded-lg border border-amber-200 text-amber-700">Revisi</button>
            <button type="button" onClick={() => handleDecision('approved')} className="px-4 py-2 font-medium rounded-lg bg-emerald-600 text-white">Approve</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ==========================================
// 3. Exam Scheduling with Conflict Detection
// ==========================================
export function ExamSchedulingPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [theses, setTheses] = useState<ThesisSubmission[]>([]);
  const [lecturers, setLecturers] = useState<Profile[]>([]);
  const [defenseRegs, setDefenseRegs] = useState<DefenseRegistration[]>([]);
  const [decrees, setDecrees] = useState<OfficialDecree[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExamSchedule | null>(null);
  const [thesisId, setThesisId] = useState('');
  const [examType, setExamType] = useState<'seminar' | 'defense'>('seminar');
  const [examDate, setExamDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:30');
  const [roomName, setRoomName] = useState('');
  const [chairId, setChairId] = useState('');
  const [examiner1Id, setExaminer1Id] = useState('');
  const [examiner2Id, setExaminer2Id] = useState('');
  const [conflicts, setConflicts] = useState<Array<{ conflict_type: string; conflict_detail: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [decreeModalThesis, setDecreeModalThesis] = useState<ThesisSubmission | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: schedData }, { data: thData }, { data: lecData }, { data: defData }, { data: decData }] =
      await Promise.all([
        supabase
          .from('exam_schedules')
          .select(
            '*, student:profiles!exam_schedules_student_id_fkey(*), thesis:thesis_submissions(*), examiners:examiner_assignments(*, lecturer:profiles!examiner_assignments_lecturer_id_fkey(*))'
          )
          .order('exam_date', { ascending: true }),
        supabase
          .from('thesis_submissions')
          .select('*, student:profiles!thesis_submissions_student_id_fkey(*, program:programs(*, department:departments(*)), department:departments(*)), program:programs(*, department:departments(*))')
          .eq('status', 'approved'),
        supabase
          .from('profiles')
          .select('*')
          .in('role_code', ['supervisor', 'examiner'])
          .eq('is_active', true)
          .order('full_name'),
        supabase
          .from('defense_registrations')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('official_decrees')
          .select('*')
          .eq('decree_type', 'sk_penguji')
          .order('version_number', { ascending: false }),
      ]);
    setSchedules((schedData || []) as ExamSchedule[]);
    setTheses((thData || []) as ThesisSubmission[]);
    setLecturers((lecData || []) as Profile[]);
    setDefenseRegs((defData || []) as DefenseRegistration[]);
    setDecrees((decData || []) as OfficialDecree[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const checkConflicts = useCallback(async () => {
    const selectedThesis = theses.find((t) => t.id === thesisId);
    if (!selectedThesis || !examDate || !startTime || !endTime || !roomName.trim()) {
      setConflicts([]);
      return;
    }
    const lecIds = [chairId, examiner1Id, examiner2Id].filter(Boolean);
    const { data } = await supabase.rpc('check_exam_schedule_conflicts', {
      p_exam_date: examDate,
      p_start_time: startTime,
      p_end_time: endTime,
      p_room_name: roomName.trim(),
      p_student_id: selectedThesis.student_id,
      p_lecturer_ids: lecIds,
      p_exclude_schedule_id: editing?.id || null,
    });
    setConflicts((data || []) as Array<{ conflict_type: string; conflict_detail: string }>);
  }, [theses, thesisId, examDate, startTime, endTime, roomName, chairId, examiner1Id, examiner2Id, editing]);

  useEffect(() => {
    if (modalOpen) checkConflicts();
  }, [modalOpen, checkConflicts]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedThesis = theses.find((t) => t.id === thesisId);
    if (!profile || !selectedThesis) return;

    if (conflicts.length > 0) {
      showToast('Terdeteksi bentrok jadwal', 'error', conflicts[0].conflict_detail);
      return;
    }

    setSaving(true);
    const payload = {
      thesis_id: selectedThesis.id,
      student_id: selectedThesis.student_id,
      exam_type: examType,
      exam_date: examDate,
      start_time: startTime,
      end_time: endTime,
      room_name: roomName.trim(),
      status: editing ? 'rescheduled' : 'scheduled',
      created_by: profile.id,
    };

    const { data: saved, error } = editing
      ? await supabase.from('exam_schedules').update(payload).eq('id', editing.id).select('*').single()
      : await supabase.from('exam_schedules').insert(payload).select('*').single();

    if (error || !saved) {
      setSaving(false);
      showToast('Gagal menyimpan jadwal ujian', 'error', error?.message);
      return;
    }

    await supabase.from('examiner_assignments').delete().eq('schedule_id', saved.id);
    const examinerRows = [
      chairId && { schedule_id: saved.id, thesis_id: selectedThesis.id, lecturer_id: chairId, examiner_role: 'chair', assigned_by: profile.id },
      examiner1Id && { schedule_id: saved.id, thesis_id: selectedThesis.id, lecturer_id: examiner1Id, examiner_role: 'examiner_1', assigned_by: profile.id },
      examiner2Id && { schedule_id: saved.id, thesis_id: selectedThesis.id, lecturer_id: examiner2Id, examiner_role: 'examiner_2', assigned_by: profile.id },
    ].filter(Boolean);

    if (examinerRows.length > 0) {
      await supabase.from('examiner_assignments').insert(examinerRows);
    }

    await sendNotification({
      userId: selectedThesis.student_id,
      title: editing ? 'Perubahan Jadwal Ujian' : `Jadwal ${examType === 'seminar' ? 'Seminar' : 'Sidang'} Dibuat`,
      message: `${formatDate(examDate)} pukul ${startTime}–${endTime} di ${roomName}.`,
      category: 'schedule',
      entityType: 'exam_schedules',
      entityId: saved.id,
    });
    for (const lid of [chairId, examiner1Id, examiner2Id].filter(Boolean)) {
      await sendNotification({
        userId: lid,
        title: `Penugasan Penguji ${examType === 'seminar' ? 'Seminar' : 'Sidang'}`,
        message: `Mahasiswa: ${selectedThesis.student?.full_name} · ${formatDate(examDate)} (${startTime}–${endTime}) di ${roomName}.`,
        category: 'schedule',
      });
    }
    await logActivity(editing ? 'update_exam_schedule' : 'create_exam_schedule', 'exam_schedules', saved.id, {
      room_name: roomName,
      exam_date: examDate,
    });

    const hadPreviousDefenseDecree = decrees.some((d) => d.thesis_id === selectedThesis.id);
    const defReg = defenseRegs.find((d) => d.thesis_id === selectedThesis.id) || null;
    const isDefApproved = !defReg || ['approved', 'scheduled', 'completed'].includes(defReg.status);

    setModalOpen(false);
    setEditing(null);

    if (examType === 'defense' && examinerRows.length > 0 && isDefApproved) {
      if (!hadPreviousDefenseDecree) {
        const { error: decErr } = await issueOfficialDecree({
          thesisId: selectedThesis.id,
          decreeType: 'sk_penguji',
          actorProfileId: profile.id,
          isAdminAction: true,
          notifyStudent: true,
        });
        setSaving(false);
        if (decErr) {
          showToast('Jadwal disimpan, namun penerbitan SK Penguji gagal', 'warning', decErr);
        } else {
          showToast('Jadwal sidang disimpan & SK Penguji (v1) otomatis diterbitkan', 'success');
        }
        await loadData();
        return;
      } else {
        await supabase
          .from('official_decrees')
          .update({ needs_reissue: true })
          .eq('thesis_id', selectedThesis.id)
          .eq('decree_type', 'sk_penguji')
          .eq('is_latest', true);
        setSaving(false);
        showToast(
          'Jadwal & penguji diperbarui',
          'info',
          'Silakan terbitkan ulang SK Penguji agar dokumen resmi terbaru tersimpan.'
        );
        await loadData();
        setDecreeModalThesis(selectedThesis);
        return;
      }
    }

    setSaving(false);
    showToast('Jadwal ujian disimpan & notifikasi terkirim', 'success');
    loadData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('exam_schedules').delete().eq('id', id);
    if (error) {
      showToast('Gagal menghapus jadwal', 'error', error.message);
      return;
    }
    await logActivity('delete_exam_schedule', 'exam_schedules', id, {});
    showToast('Jadwal ujian dihapus', 'success');
    loadData();
  };

  const columns: ColumnDef<ExamSchedule>[] = [
    {
      key: 'student',
      header: 'Mahasiswa & Jenis',
      render: (r) => (
        <div>
          <p className="font-medium">{r.student?.full_name}</p>
          <p className="text-[11px] text-slate-500 capitalize">
            {r.exam_type === 'seminar' ? 'Seminar Proposal' : 'Sidang Akhir'}
          </p>
        </div>
      ),
    },
    {
      key: 'datetime',
      header: 'Tanggal & Waktu',
      render: (r) => (
        <span className="font-mono tabular-nums">
          {formatDate(r.exam_date)} · {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}
        </span>
      ),
    },
    {
      key: 'room',
      header: 'Ruangan',
      render: (r) => <span className="font-medium">{r.room_name}</span>,
    },
    {
      key: 'examiners',
      header: 'Penguji',
      render: (r) => (
        <div className="text-[11px] space-y-0.5">
          {(r.examiners || []).map((ex) => (
            <p key={ex.id}>{ex.lecturer?.full_name}</p>
          ))}
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
      render: (r) => {
        const th = theses.find((t) => t.id === r.thesis_id) || r.thesis || null;
        const latestSk = decrees.find((d) => d.thesis_id === r.thesis_id && d.is_latest);
        const canIssueSk = r.exam_type === 'defense' && (r.examiners?.length || 0) > 0 && Boolean(th);
        return (
          <div className="inline-flex items-center gap-1.5">
            {canIssueSk && th && (
              <button
                type="button"
                onClick={() => setDecreeModalThesis(th)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <FileBadge2 className="w-3.5 h-3.5 text-blue-600" />
                {latestSk?.needs_reissue ? 'Terbitkan Ulang SK' : latestSk ? `SK v${latestSk.version_number}` : 'Terbitkan SK'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setEditing(r);
                setThesisId(r.thesis_id);
                setExamType(r.exam_type);
                setExamDate(r.exam_date);
                setStartTime(r.start_time.slice(0, 5));
                setEndTime(r.end_time.slice(0, 5));
                setRoomName(r.room_name);
                const ch = r.examiners?.find((e) => e.examiner_role === 'chair');
                const e1 = r.examiners?.find((e) => e.examiner_role === 'examiner_1');
                const e2 = r.examiners?.find((e) => e.examiner_role === 'examiner_2');
                setChairId(ch?.lecturer_id || '');
                setExaminer1Id(e1?.lecturer_id || '');
                setExaminer2Id(e2?.lecturer_id || '');
                setModalOpen(true);
              }}
              className="px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700"
            >
              Ubah
            </button>
            <button
              type="button"
              onClick={() => handleDelete(r.id)}
              className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Exam Scheduling & Conflict Detection</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Atur jadwal seminar dan sidang dengan deteksi otomatis bentrok ruangan, dosen penguji, dan mahasiswa.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setThesisId(theses[0]?.id || '');
            setRoomName('Ruang Sidang 1');
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
        >
          <CalendarPlus className="w-3.5 h-3.5" />
          Buat Jadwal Ujian
        </button>
      </div>

      <DataTable
        data={schedules}
        columns={columns}
        keyField={(r) => r.id}
        loading={loading}
        searchPlaceholder="Cari mahasiswa atau ruangan..."
        searchFilter={(r, q) =>
          (r.student?.full_name || '').toLowerCase().includes(q) ||
          r.room_name.toLowerCase().includes(q)
        }
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Ubah Jadwal Ujian' : 'Buat Jadwal Seminar / Sidang'}
        maxWidth="lg"
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {conflicts.length > 0 && (
            <div className="p-3.5 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Bentrok Jadwal Terdeteksi
              </p>
              {conflicts.map((c, idx) => (
                <p key={idx}>• {c.conflict_detail}</p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Mahasiswa / Judul Tugas Akhir *</label>
              <select
                required
                value={thesisId}
                onChange={(e) => setThesisId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">-- Pilih Mahasiswa --</option>
                {theses.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.student?.full_name} ({t.student?.nim_nip}) — {t.title.slice(0, 50)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Jenis Ujian *</label>
              <select
                value={examType}
                onChange={(e) => setExamType(e.target.value as 'seminar' | 'defense')}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="seminar">Seminar Proposal</option>
                <option value="defense">Sidang Tugas Akhir</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Ruangan / Lokasi *</label>
              <input
                type="text"
                required
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Tanggal *</label>
              <input
                type="date"
                required
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-medium mb-1">Mulai *</label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Selesai *</label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
            <div>
              <label className="block font-medium mb-1">Ketua Penguji</label>
              <select
                value={chairId}
                onChange={(e) => setChairId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">-- Pilih Ketua --</option>
                {lecturers.map((l) => (
                  <option key={l.id} value={l.id}>{l.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Penguji 1</label>
              <select
                value={examiner1Id}
                onChange={(e) => setExaminer1Id(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">-- Pilih Penguji 1 --</option>
                {lecturers.filter((l) => l.id !== chairId).map((l) => (
                  <option key={l.id} value={l.id}>{l.full_name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">Penguji 2 (Opsional)</label>
              <select
                value={examiner2Id}
                onChange={(e) => setExaminer2Id(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">-- Pilih Penguji 2 --</option>
                {lecturers.filter((l) => l.id !== chairId && l.id !== examiner1Id).map((l) => (
                  <option key={l.id} value={l.id}>{l.full_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving || conflicts.length > 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Simpan Jadwal
            </button>
          </div>
        </form>
      </Modal>

      <DecreeIssuanceModal
        open={Boolean(decreeModalThesis)}
        onClose={() => setDecreeModalThesis(null)}
        thesis={decreeModalThesis}
        decreeType="sk_penguji"
        existingDecrees={decreeModalThesis ? decrees.filter((d) => d.thesis_id === decreeModalThesis.id) : []}
        onIssued={loadData}
      />
    </div>
  );
}

// ==========================================
// 4. Examiner Management View
// ==========================================
export function ExaminerManagementPage() {
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Array<ExaminerAssignment & { schedule?: ExamSchedule; thesis?: ThesisSubmission & { student?: Profile } }>>([]);
  const [decrees, setDecrees] = useState<OfficialDecree[]>([]);
  const [decreeModalThesis, setDecreeModalThesis] = useState<ThesisSubmission | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: decData }] = await Promise.all([
      supabase
        .from('examiner_assignments')
        .select('*, lecturer:profiles!examiner_assignments_lecturer_id_fkey(*), schedule:exam_schedules(*), thesis:thesis_submissions(*, student:profiles!thesis_submissions_student_id_fkey(*, program:programs(*, department:departments(*)), department:departments(*)), program:programs(*, department:departments(*)))')
        .order('created_at', { ascending: false }),
      supabase
        .from('official_decrees')
        .select('*')
        .eq('decree_type', 'sk_penguji')
        .order('version_number', { ascending: false }),
    ]);
    setAssignments((data || []) as typeof assignments);
    setDecrees((decData || []) as OfficialDecree[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const columns: ColumnDef<(typeof assignments)[number]>[] = [
    {
      key: 'lecturer',
      header: 'Dosen Penguji',
      render: (r) => <span className="font-medium">{r.lecturer?.full_name}</span>,
    },
    {
      key: 'role',
      header: 'Peran',
      render: (r) => <span className="capitalize">{r.examiner_role.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'student',
      header: 'Mahasiswa Diuji',
      render: (r) => <span>{r.thesis?.student?.full_name}</span>,
    },
    {
      key: 'date',
      header: 'Jadwal',
      render: (r) => (
        <span className="font-mono">
          {formatDate(r.schedule?.exam_date)} ({r.schedule?.exam_type === 'defense' ? 'Sidang' : 'Seminar'})
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status Persetujuan',
      render: (r) => <StatusBadge status={r.approval_status} />,
    },
    {
      key: 'decree',
      header: 'SK Penguji',
      render: (r) => {
        if (r.schedule?.exam_type !== 'defense') {
          return <span className="text-[11px] text-slate-400">Seminar</span>;
        }
        const latest = decrees.find((d) => d.thesis_id === r.thesis_id && d.is_latest);
        if (!latest) {
          return <span className="text-[11px] text-slate-400">Belum Diterbitkan</span>;
        }
        return (
          <div className="space-y-0.5">
            <span className="font-mono text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              v{latest.version_number} · {latest.letter_number}
            </span>
            {latest.needs_reissue && (
              <p className="text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                Perlu Terbit Ulang
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (r) => {
        if (r.schedule?.exam_type !== 'defense' || !r.thesis) return null;
        const latest = decrees.find((d) => d.thesis_id === r.thesis_id && d.is_latest);
        return (
          <button
            type="button"
            onClick={() => setDecreeModalThesis(r.thesis || null)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <FileBadge2 className="w-3.5 h-3.5 text-blue-600" />
            {latest?.needs_reissue ? 'Terbitkan Ulang SK' : latest ? 'Kelola SK' : 'Terbitkan SK'}
          </button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Examiner Management</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Rekap penugasan ketua dan anggota tim penguji serta penerbitan SK Penguji Sidang Akhir.
        </p>
      </div>
      <DataTable data={assignments} columns={columns} keyField={(r) => r.id} loading={loading} />
      <DecreeIssuanceModal
        open={Boolean(decreeModalThesis)}
        onClose={() => setDecreeModalThesis(null)}
        thesis={decreeModalThesis}
        decreeType="sk_penguji"
        existingDecrees={decreeModalThesis ? decrees.filter((d) => d.thesis_id === decreeModalThesis.id) : []}
        onIssued={load}
      />
    </div>
  );
}
