import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Eye,
  Loader2,
  MessageSquareText,
  XCircle,
} from 'lucide-react';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { DocumentViewerModal } from '../../components/ui/DocumentViewerModal';
import { Drawer, Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getSignedAvatarUrls, logActivity, sendNotification, supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import type {
  DefenseRegistration,
  GuidanceStatus,
  SeminarRegistration,
  SupervisionSession,
  ThesisDocument,
  ThesisSubmission,
  ThesisSupervisor,
} from '../../types/database';

export function SuperviseesPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [supervisees, setSupervisees] = useState<ThesisSupervisor[]>([]);
  const [proposedTheses, setProposedTheses] = useState<ThesisSubmission[]>([]);
  const [sessions, setSessions] = useState<SupervisionSession[]>([]);
  const [seminarRegs, setSeminarRegs] = useState<Record<string, SeminarRegistration>>({});
  const [defenseRegs, setDefenseRegs] = useState<Record<string, DefenseRegistration>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});

  // Track in-flight single-click approvals to prevent duplicate submissions
  const [approvingKey, setApprovingKey] = useState<string | null>(null);

  // Title review modal
  const [reviewThesis, setReviewThesis] = useState<ThesisSubmission | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Student guidance drawer & response modal
  const [selectedSup, setSelectedSup] = useState<ThesisSupervisor | null>(null);
  const [respondingSession, setRespondingSession] = useState<SupervisionSession | null>(null);
  const [lecturerNotes, setLecturerNotes] = useState('');
  const [altDate, setAltDate] = useState('');
  const [altTime, setAltTime] = useState('');
  const [savingSession, setSavingSession] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<ThesisDocument | null>(null);

  const loadData = useCallback(
    async (withLoader = true) => {
      if (!profile?.id) return;
      if (withLoader) setLoading(true);

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

      const supList = (supData || []) as ThesisSupervisor[];
      const propList = (propData || []) as ThesisSubmission[];
      setSupervisees(supList);
      setProposedTheses(propList);

      const thesisIds = Array.from(new Set(supList.map((s) => s.thesis_id)));

      if (thesisIds.length > 0) {
        const [{ data: sessData }, { data: semData }, { data: defData }] = await Promise.all([
          supabase
            .from('supervision_sessions')
            .select('*, lecturer:profiles!supervision_sessions_lecturer_id_fkey(*), attachment:thesis_documents(*)')
            .or(`lecturer_id.eq.${profile.id},thesis_id.in.(${thesisIds.join(',')})`)
            .order('created_at', { ascending: false }),
          supabase
            .from('seminar_registrations')
            .select('*')
            .in('thesis_id', thesisIds)
            .order('created_at', { ascending: false }),
          supabase
            .from('defense_registrations')
            .select('*')
            .in('thesis_id', thesisIds)
            .order('created_at', { ascending: false }),
        ]);

        setSessions((sessData || []) as SupervisionSession[]);

        const semMap: Record<string, SeminarRegistration> = {};
        for (const r of (semData || []) as SeminarRegistration[]) {
          if (!semMap[r.thesis_id]) semMap[r.thesis_id] = r;
        }
        setSeminarRegs(semMap);

        const defMap: Record<string, DefenseRegistration> = {};
        for (const r of (defData || []) as DefenseRegistration[]) {
          if (!defMap[r.thesis_id]) defMap[r.thesis_id] = r;
        }
        setDefenseRegs(defMap);
      } else {
        const { data: sessData } = await supabase
          .from('supervision_sessions')
          .select('*, lecturer:profiles!supervision_sessions_lecturer_id_fkey(*), attachment:thesis_documents(*)')
          .eq('lecturer_id', profile.id)
          .order('created_at', { ascending: false });
        setSessions((sessData || []) as SupervisionSession[]);
        setSeminarRegs({});
        setDefenseRegs({});
      }

      // Resolve student avatars
      const allStudents = [
        ...supList.map((s) => s.student).filter(Boolean),
        ...propList.map((p) => p.student).filter(Boolean),
      ];
      const avatarPaths = allStudents
        .map((st) => st?.avatar_url)
        .filter((p): p is string => Boolean(p));

      if (avatarPaths.length > 0) {
        const signedMap = await getSignedAvatarUrls(avatarPaths);
        const byId: Record<string, string> = {};
        for (const st of allStudents) {
          if (st?.id && st.avatar_url && signedMap[st.avatar_url]) {
            byId[st.id] = signedMap[st.avatar_url];
          }
        }
        setAvatarUrls(byId);
      } else {
        setAvatarUrls({});
      }

      if (withLoader) setLoading(false);
    },
    [profile?.id]
  );

  useEffect(() => {
    loadData();
    if (!profile?.id) return;

    const channel = supabase
      .channel(`lecturer_supervisees_${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'thesis_supervisors' }, () => loadData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'thesis_submissions' }, () => loadData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supervision_sessions' }, () => loadData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seminar_registrations' }, () => loadData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'defense_registrations' }, () => loadData(false))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData, profile?.id]);

  const handleTitleDecision = async (decision: 'approved' | 'revision_required' | 'rejected') => {
    if (!profile || !reviewThesis || saving) return;
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
    loadData(false);
  };

  // One-click locked approval for Seminar & Sidang Akhir
  const approveExamReadiness = async (sup: ThesisSupervisor, type: 'seminar' | 'defense') => {
    const key = `${sup.id}:${type}`;
    if (approvingKey) return;

    if (type === 'seminar') {
      const existing = seminarRegs[sup.thesis_id];
      if (existing?.supervisor_approved) {
        return; // Already approved; permanently locked
      }

      setApprovingKey(key);
      let errMsg: string | null = null;

      if (existing) {
        const { data: updated, error } = await supabase
          .from('seminar_registrations')
          .update({ supervisor_approved: true })
          .eq('id', existing.id)
          .select('*')
          .single();
        if (error) errMsg = error.message;
        else if (updated) {
          setSeminarRegs((prev) => ({ ...prev, [sup.thesis_id]: updated as SeminarRegistration }));
        }
      } else {
        const { data: inserted, error } = await supabase
          .from('seminar_registrations')
          .insert({
            thesis_id: sup.thesis_id,
            student_id: sup.student_id,
            supervisor_approved: true,
            status: 'draft',
          })
          .select('*')
          .single();
        if (error) errMsg = error.message;
        else if (inserted) {
          setSeminarRegs((prev) => ({ ...prev, [sup.thesis_id]: inserted as SeminarRegistration }));
        }
      }

      setApprovingKey(null);
      if (errMsg) {
        showToast('Gagal menyetujui seminar', 'error', errMsg);
        return;
      }

      await sendNotification({
        userId: sup.student_id,
        title: 'Persetujuan Seminar Proposal',
        message: `${profile?.full_name} menyetujui kesiapan seminar proposal Anda.`,
        category: 'seminar',
        entityType: 'seminar_registrations',
      });
      await logActivity('approve_seminar_readiness', 'seminar_registrations', sup.thesis_id, {});
      showToast('Persetujuan seminar berhasil diberikan', 'success');
    } else {
      const existing = defenseRegs[sup.thesis_id];
      const field = sup.supervisor_role === 'primary' ? 'supervisor_1_approved' : 'supervisor_2_approved';
      const alreadyApproved =
        sup.supervisor_role === 'primary'
          ? Boolean(existing?.supervisor_1_approved)
          : Boolean(existing?.supervisor_2_approved);

      if (alreadyApproved) {
        return; // Already approved; permanently locked
      }

      setApprovingKey(key);
      let errMsg: string | null = null;

      if (existing) {
        const { data: updated, error } = await supabase
          .from('defense_registrations')
          .update({ [field]: true })
          .eq('id', existing.id)
          .select('*')
          .single();
        if (error) errMsg = error.message;
        else if (updated) {
          setDefenseRegs((prev) => ({ ...prev, [sup.thesis_id]: updated as DefenseRegistration }));
        }
      } else {
        const { data: inserted, error } = await supabase
          .from('defense_registrations')
          .insert({
            thesis_id: sup.thesis_id,
            student_id: sup.student_id,
            [field]: true,
            status: 'draft',
          })
          .select('*')
          .single();
        if (error) errMsg = error.message;
        else if (inserted) {
          setDefenseRegs((prev) => ({ ...prev, [sup.thesis_id]: inserted as DefenseRegistration }));
        }
      }

      setApprovingKey(null);
      if (errMsg) {
        showToast('Gagal menyetujui sidang', 'error', errMsg);
        return;
      }

      await sendNotification({
        userId: sup.student_id,
        title: 'Persetujuan Sidang Akhir',
        message: `${profile?.full_name} menyetujui kesiapan sidang akhir Anda.`,
        category: 'defense',
        entityType: 'defense_registrations',
      });
      await logActivity('approve_defense_readiness', 'defense_registrations', sup.thesis_id, { field });
      showToast('Persetujuan sidang akhir berhasil diberikan', 'success');
    }
  };

  const handleSessionDecision = async (status: GuidanceStatus) => {
    if (!profile || !respondingSession || savingSession) return;
    setSavingSession(true);

    const history = [
      ...(respondingSession.revision_history || []),
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
      .eq('id', respondingSession.id);

    setSavingSession(false);
    if (error) {
      showToast('Gagal memperbarui sesi bimbingan', 'error', error.message);
      return;
    }

    await sendNotification({
      userId: respondingSession.student_id,
      title: `Bimbingan ${
        status === 'scheduled'
          ? 'Dijadwalkan'
          : status === 'completed'
            ? 'Selesai'
            : status === 'rescheduled'
              ? 'Dijadwalkan Ulang'
              : 'Ditolak'
      }`,
      message:
        lecturerNotes.trim() ||
        `Dosen pembimbing memperbarui sesi bimbingan "${respondingSession.topic}".`,
      category: 'guidance',
      entityType: 'supervision_sessions',
      entityId: respondingSession.id,
    });
    await logActivity(`guidance_${status}`, 'supervision_sessions', respondingSession.id, {});

    setRespondingSession(null);
    setLecturerNotes('');
    showToast('Sesi bimbingan diperbarui', 'success');
    loadData(false);
  };

  const getSessionsForStudent = (sup: ThesisSupervisor) =>
    sessions.filter(
      (s) => s.thesis_id === sup.thesis_id || s.student_id === sup.student_id
    );

  const supColumns: ColumnDef<ThesisSupervisor>[] = [
    {
      key: 'student',
      header: 'Mahasiswa',
      sortValue: (r) => r.student?.full_name || '',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <UserAvatar name={r.student?.full_name} src={avatarUrls[r.student_id]} size="sm" />
          <div className="min-w-0">
            <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
              {r.student?.full_name}
            </p>
            <p className="text-[11px] font-mono text-slate-500">{r.student?.nim_nip || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'thesis',
      header: 'Judul Tugas Akhir',
      render: (r) => <p className="max-w-sm line-clamp-2">{r.thesis?.title || '—'}</p>,
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
      key: 'guidance',
      header: 'Sesi Bimbingan',
      render: (r) => {
        const list = getSessionsForStudent(r);
        const pending = list.filter((s) => s.status === 'requested').length;
        const completed = list.filter((s) => s.status === 'completed').length;

        return (
          <button
            type="button"
            onClick={() => setSelectedSup(r)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <MessageSquareText className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
            <span>{list.length} Sesi</span>
            {pending > 0 ? (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-semibold">
                {pending} Baru
              </span>
            ) : completed > 0 ? (
              <span className="text-slate-400 font-mono">({completed} selesai)</span>
            ) : null}
          </button>
        );
      },
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
      render: (r) => {
        const semReg = seminarRegs[r.thesis_id];
        const defReg = defenseRegs[r.thesis_id];

        const isSemApproved = Boolean(semReg?.supervisor_approved);
        const isDefApproved =
          r.supervisor_role === 'primary'
            ? Boolean(defReg?.supervisor_1_approved)
            : Boolean(defReg?.supervisor_2_approved);

        const semBusy = approvingKey === `${r.id}:seminar`;
        const defBusy = approvingKey === `${r.id}:defense`;

        return (
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              disabled={isSemApproved || Boolean(approvingKey)}
              onClick={() => approveExamReadiness(r, 'seminar')}
              title={
                isSemApproved
                  ? 'Seminar proposal sudah disetujui (klik hanya 1 kali)'
                  : 'Setujui kesiapan seminar proposal'
              }
              className={
                isSemApproved
                  ? 'inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 cursor-not-allowed opacity-90'
                  : 'inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50'
              }
            >
              {semBusy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isSemApproved ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : null}
              {isSemApproved ? 'Seminar Disetujui' : 'ACC Seminar'}
            </button>

            <button
              type="button"
              disabled={isDefApproved || Boolean(approvingKey)}
              onClick={() => approveExamReadiness(r, 'defense')}
              title={
                isDefApproved
                  ? 'Sidang akhir sudah disetujui (klik hanya 1 kali)'
                  : 'Setujui kesiapan sidang akhir'
              }
              className={
                isDefApproved
                  ? 'inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 cursor-not-allowed opacity-90'
                  : 'inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50'
              }
            >
              {defBusy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isDefApproved ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : null}
              {isDefApproved ? 'Sidang Disetujui' : 'ACC Sidang'}
            </button>
          </div>
        );
      },
    },
  ];

  const propColumns: ColumnDef<ThesisSubmission>[] = [
    {
      key: 'student',
      header: 'Mahasiswa',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <UserAvatar name={r.student?.full_name} src={avatarUrls[r.student_id]} size="sm" />
          <div>
            <p className="font-medium">{r.student?.full_name}</p>
            <p className="text-[11px] font-mono text-slate-500">{r.student?.nim_nip}</p>
          </div>
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

  const drawerSessions = selectedSup ? getSessionsForStudent(selectedSup) : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Mahasiswa Bimbingan & Review Judul</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Kelola mahasiswa bimbingan aktif, tanggapi sesi bimbingan yang diajukan, dan berikan persetujuan seminar atau sidang.
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

      {/* Supervisee Guidance Sessions Drawer */}
      <Drawer
        open={Boolean(selectedSup)}
        onClose={() => setSelectedSup(null)}
        title={`Sesi Bimbingan — ${selectedSup?.student?.full_name || ''}`}
        subtitle={`NIM: ${selectedSup?.student?.nim_nip || '—'} · ${selectedSup?.thesis?.title || ''}`}
      >
        <div className="space-y-3 text-xs">
          {drawerSessions.length === 0 ? (
            <p className="py-10 text-center text-slate-500">
              Mahasiswa ini belum mengajukan sesi bimbingan.
            </p>
          ) : (
            drawerSessions.map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                      Bab {s.chapter_number || '—'} · {s.topic}
                    </p>
                    <p className="font-mono text-[11px] text-slate-500 mt-0.5">
                      {formatDate(s.scheduled_date)} · {s.scheduled_time.slice(0, 5)}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>

                {s.student_notes && (
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    <span className="font-medium text-slate-500">Catatan Mahasiswa: </span>
                    {s.student_notes}
                  </p>
                )}

                {s.lecturer_notes && (
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    <span className="font-medium text-slate-500">Arahan Dosen: </span>
                    {s.lecturer_notes}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div>
                    {s.attachment && (
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(s.attachment || null)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Lampiran (v{s.attachment.version_number})
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRespondingSession(s);
                      setLecturerNotes(s.lecturer_notes || '');
                      setAltDate(s.alternative_date || s.scheduled_date);
                      setAltTime(s.alternative_time || s.scheduled_time.slice(0, 5));
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-700 hover:bg-blue-800 text-white"
                  >
                    Tanggapi
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Drawer>

      {/* Respond to Guidance Session Modal */}
      <Modal
        open={Boolean(respondingSession)}
        onClose={() => !savingSession && setRespondingSession(null)}
        title="Tanggapi Sesi Bimbingan"
        subtitle={respondingSession ? `${selectedSup?.student?.full_name || ''} — ${respondingSession.topic}` : ''}
      >
        {respondingSession && (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <p className="font-medium text-slate-500">Catatan Mahasiswa:</p>
              <p className="mt-1">{respondingSession.student_notes || 'Tidak ada catatan tambahan.'}</p>
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
                disabled={savingSession}
                onClick={() => handleSessionDecision('rejected')}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                Tolak
              </button>
              <button
                type="button"
                disabled={savingSession}
                onClick={() => handleSessionDecision('rescheduled')}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                <Calendar className="w-3.5 h-3.5" />
                Jadwal Alternatif
              </button>
              <button
                type="button"
                disabled={savingSession}
                onClick={() => handleSessionDecision('scheduled')}
                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                Terima Jadwal
              </button>
              <button
                type="button"
                disabled={savingSession}
                onClick={() => handleSessionDecision('completed')}
                className="inline-flex items-center gap-1 px-4 py-2 font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
              >
                {savingSession ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Tandai Selesai
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Title Review Modal */}
      <Modal
        open={Boolean(reviewThesis)}
        onClose={() => !saving && setReviewThesis(null)}
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
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                Tolak Judul
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleTitleDecision('revision_required')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                Minta Revisi
              </button>
              <button
                type="button"
                disabled={saving || reviewThesis.status === 'approved'}
                onClick={() => handleTitleDecision('approved')}
                className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {reviewThesis.status === 'approved' ? 'Judul Sudah Disetujui' : 'Setujui Judul'}
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
