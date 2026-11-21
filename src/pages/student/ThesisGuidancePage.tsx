import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, Clock, Eye, Loader2, MessageSquarePlus, Send, User } from 'lucide-react';
import { DocumentViewerModal } from '../../components/ui/DocumentViewerModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { FileUploadField } from '../../components/ui/FileUploadField';
import { Modal } from '../../components/ui/Modal';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  getSignedDocumentUrl,
  logActivity,
  sendNotification,
  supabase,
  uploadPrivateDocument,
} from '../../lib/supabase';
import { formatDate, formatDateTime } from '../../lib/utils';
import type {
  SupervisionSession,
  ThesisDocument,
  ThesisSubmission,
  ThesisSupervisor,
} from '../../types/database';

export function ThesisGuidancePage() {
  const { profile, systemSettings } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [thesis, setThesis] = useState<ThesisSubmission | null>(null);
  const [supervisors, setSupervisors] = useState<ThesisSupervisor[]>([]);
  const [supervisorLoads, setSupervisorLoads] = useState<Record<string, number>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [sessions, setSessions] = useState<SupervisionSession[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lecturerId, setLecturerId] = useState('');
  const [chapterNumber, setChapterNumber] = useState(1);
  const [topic, setTopic] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('10:00');
  const [studentNotes, setStudentNotes] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const [revisionSession, setRevisionSession] = useState<SupervisionSession | null>(null);
  const [revisionNote, setRevisionNote] = useState('');
  const [revisionFile, setRevisionFile] = useState<File | null>(null);

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
      const [{ data: supData }, { data: sessData }] = await Promise.all([
        supabase
          .from('thesis_supervisors')
          .select('*, lecturer:profiles!thesis_supervisors_lecturer_id_fkey(*, program:programs(*))')
          .eq('thesis_id', currentThesis.id)
          .eq('status', 'active')
          .order('supervisor_role'),
        supabase
          .from('supervision_sessions')
          .select('*, lecturer:profiles!supervision_sessions_lecturer_id_fkey(*), attachment:thesis_documents(*)')
          .eq('thesis_id', currentThesis.id)
          .order('scheduled_date', { ascending: false }),
      ]);

      const sups = (supData || []) as ThesisSupervisor[];
      setSupervisors(sups);
      if (sups.length > 0 && !lecturerId) {
        setLecturerId(sups[0].lecturer_id);
      }

      // Fetch supervisee counts & avatars for assigned lecturers
      const loads: Record<string, number> = {};
      const urls: Record<string, string> = {};
      await Promise.all(
        sups.map(async (s) => {
          const { count } = await supabase
            .from('thesis_supervisors')
            .select('id', { count: 'exact', head: true })
            .eq('lecturer_id', s.lecturer_id)
            .eq('status', 'active');
          loads[s.lecturer_id] = count || 0;
          if (s.lecturer?.avatar_url) {
            const url = await getSignedDocumentUrl('avatars', s.lecturer.avatar_url, 3600);
            if (url) urls[s.lecturer_id] = url;
          }
        })
      );
      setSupervisorLoads(loads);
      setAvatarUrls(urls);
      setSessions((sessData || []) as SupervisionSession[]);
    }

    setLoading(false);
  }, [profile?.id, lecturerId]);

  useEffect(() => {
    loadData();
    if (!profile?.id) return;
    const channel = supabase
      .channel(`student_guidance_${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'supervision_sessions', filter: `student_id=eq.${profile.id}` },
        loadData
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData, profile?.id]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !thesis || !lecturerId || !topic.trim() || !scheduledDate) {
      showToast('Lengkapi semua kolom wajib', 'warning');
      return;
    }

    setSubmitting(true);
    let attachmentId: string | null = null;
    if (attachmentFile) {
      const cat = (`chapter_${chapterNumber}`) as ThesisDocument['category'];
      const up = await uploadPrivateDocument({
        file: attachmentFile,
        userId: profile.id,
        studentId: profile.id,
        category: cat,
        title: `Lampiran Bimbingan Bab ${chapterNumber} — ${topic.trim()}`,
        thesisId: thesis.id,
        maxUploadMb: systemSettings?.max_upload_mb || 25,
        allowedFormats: systemSettings?.allowed_file_formats || ['pdf', 'docx'],
      });
      if (up.error) {
        setSubmitting(false);
        showToast('Gagal mengunggah lampiran', 'error', up.error);
        return;
      }
      attachmentId = up.data?.id || null;
    }

    const historyEntry = {
      timestamp: new Date().toISOString(),
      actor: profile.full_name,
      note: studentNotes.trim() || 'Mengajukan jadwal bimbingan.',
      status: 'requested',
    };

    const { data: inserted, error } = await supabase
      .from('supervision_sessions')
      .insert({
        thesis_id: thesis.id,
        student_id: profile.id,
        lecturer_id: lecturerId,
        chapter_number: chapterNumber,
        topic: topic.trim(),
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        student_notes: studentNotes.trim() || null,
        attachment_document_id: attachmentId,
        status: 'requested',
        revision_history: [historyEntry],
      })
      .select('*')
      .single();

    setSubmitting(false);
    if (error) {
      showToast('Gagal membuat permintaan bimbingan', 'error', error.message);
      return;
    }

    await sendNotification({
      userId: lecturerId,
      title: 'Permintaan Bimbingan Baru',
      message: `${profile.full_name} mengajukan bimbingan Bab ${chapterNumber} pada ${formatDate(scheduledDate)} pukul ${scheduledTime}.`,
      category: 'guidance',
      entityType: 'supervision_sessions',
      entityId: inserted.id,
    });
    await logActivity('request_guidance', 'supervision_sessions', inserted.id, {
      chapter: chapterNumber,
      topic: topic.trim(),
    });

    setModalOpen(false);
    setTopic('');
    setStudentNotes('');
    setAttachmentFile(null);
    showToast('Permintaan bimbingan dikirim', 'success');
    loadData();
  };

  const handleSendRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !thesis || !revisionSession || !revisionNote.trim()) return;
    setSubmitting(true);

    let attachmentId = revisionSession.attachment_document_id;
    if (revisionFile) {
      const cat = (`chapter_${revisionSession.chapter_number || 1}`) as ThesisDocument['category'];
      const up = await uploadPrivateDocument({
        file: revisionFile,
        userId: profile.id,
        studentId: profile.id,
        category: cat,
        title: `Revisi Bimbingan — ${revisionSession.topic}`,
        thesisId: thesis.id,
        parentDocumentId: revisionSession.attachment_document_id,
        versionNumber: (revisionSession.attachment?.version_number || 1) + 1,
      });
      if (up.error) {
        setSubmitting(false);
        showToast('Gagal mengunggah berkas revisi', 'error', up.error);
        return;
      }
      attachmentId = up.data?.id || attachmentId;
    }

    const updatedHistory = [
      ...(revisionSession.revision_history || []),
      {
        timestamp: new Date().toISOString(),
        actor: profile.full_name,
        note: revisionNote.trim(),
        status: 'revision_submitted',
      },
    ];

    const { error } = await supabase
      .from('supervision_sessions')
      .update({
        student_notes: revisionNote.trim(),
        attachment_document_id: attachmentId,
        revision_history: updatedHistory,
      })
      .eq('id', revisionSession.id);

    setSubmitting(false);
    if (error) {
      showToast('Gagal mengirim revisi', 'error', error.message);
      return;
    }

    await sendNotification({
      userId: revisionSession.lecturer_id,
      title: 'Revisi Bimbingan Dikirim',
      message: `${profile.full_name} mengirim pembaruan revisi untuk sesi "${revisionSession.topic}".`,
      category: 'guidance',
      entityType: 'supervision_sessions',
      entityId: revisionSession.id,
    });
    await logActivity('submit_guidance_revision', 'supervision_sessions', revisionSession.id, {});

    setRevisionSession(null);
    setRevisionNote('');
    setRevisionFile(null);
    showToast('Revisi bimbingan terkirim', 'success');
    loadData();
  };

  if (loading) return <TableSkeleton rows={5} columns={4} />;

  if (!thesis) {
    return (
      <EmptyState
        title="Belum ada pengajuan tugas akhir"
        description="Ajukan judul tugas akhir dan tunggu penetapan dosen pembimbing sebelum menjadwalkan sesi bimbingan."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Bimbingan Tugas Akhir & Pembimbing</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Informasi dosen pembimbing, permintaan jadwal konsultasi, serta riwayat bimbingan kronologis.
          </p>
        </div>
        <button
          type="button"
          disabled={supervisors.length === 0}
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white transition-colors disabled:opacity-50"
        >
          <MessageSquarePlus className="w-4 h-4" />
          Ajukan Bimbingan
        </button>
      </div>

      {/* Supervisors Info Cards */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Dosen Pembimbing Anda</h2>
        {supervisors.length === 0 ? (
          <EmptyState
            title="Dosen pembimbing belum ditetapkan"
            description="Admin Program Studi akan menetapkan Dosen Pembimbing 1 dan Pembimbing 2 setelah judul tugas akhir Anda disetujui."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {supervisors.map((sup) => {
              const lec = sup.lecturer;
              const fullTitle = [lec?.title_prefix, lec?.full_name, lec?.title_suffix]
                .filter(Boolean)
                .join(' ');
              return (
                <div
                  key={sup.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex items-start gap-4"
                >
                  <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                    {avatarUrls[sup.lecturer_id] ? (
                      <img
                        src={avatarUrls[sup.lecturer_id]}
                        alt={lec?.full_name || 'Dosen'}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[11px] font-medium text-blue-700 dark:text-cyan-400">
                      {sup.supervisor_role === 'primary' ? 'Pembimbing 1' : 'Pembimbing 2'}
                    </p>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {fullTitle || lec?.full_name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {lec?.position || 'Dosen Tetap'} · {lec?.program?.name || 'Program Studi'}
                    </p>
                    <div className="pt-1.5 text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
                      <p>Email: {lec?.email}</p>
                      <p>Jadwal Konsultasi: {lec?.consultation_schedule || 'Sesuai janji temu'}</p>
                      <p className="font-mono tabular-nums">
                        Mahasiswa Bimbingan Aktif: {supervisorLoads[sup.lecturer_id] ?? 0} / {lec?.max_supervisee_quota ?? 10}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Chronological Guidance History */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Riwayat Bimbingan Kronologis</h2>
        {sessions.length === 0 ? (
          <EmptyState
            title="Belum ada sesi bimbingan"
            description="Buat permintaan bimbingan pertama Anda untuk berkonsultasi mengenai penyusunan bab skripsi."
            actionLabel={supervisors.length > 0 ? 'Ajukan Bimbingan' : undefined}
            onAction={() => setModalOpen(true)}
          />
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        Bab {s.chapter_number || '—'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                        <Calendar className="w-3 h-3" />
                        {formatDate(s.scheduled_date)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                        <Clock className="w-3 h-3" />
                        {s.scheduled_time.slice(0, 5)}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold mt-1">{s.topic}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Pembimbing: {s.lecturer?.full_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={s.status} />
                  </div>
                </div>

                {s.status === 'rescheduled' && s.alternative_date && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    Jadwal Alternatif Dosen: {formatDate(s.alternative_date)} pukul{' '}
                    {s.alternative_time?.slice(0, 5)}
                  </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="font-medium text-slate-500 dark:text-slate-400 mb-1">Catatan Mahasiswa</p>
                    <p className="text-slate-800 dark:text-slate-200 leading-relaxed">
                      {s.student_notes || 'Tidak ada catatan.'}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-500 dark:text-slate-400 mb-1">Catatan & Arahan Dosen</p>
                    <p className="text-slate-800 dark:text-slate-200 leading-relaxed">
                      {s.lecturer_notes || 'Menunggu tanggapan dosen pembimbing.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <div className="flex items-center gap-2">
                    {s.attachment && (
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(s.attachment || null)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Lampiran (v{s.attachment.version_number})
                      </button>
                    )}
                  </div>
                  {s.status !== 'rejected' && (
                    <button
                      type="button"
                      onClick={() => setRevisionSession(s)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-cyan-400 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Kirim Revisi / Tindak Lanjut
                    </button>
                  )}
                </div>

                {s.revision_history && s.revision_history.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                    <p className="text-[11px] font-medium text-slate-400">Riwayat Aktivitas Sesi</p>
                    {s.revision_history.map((h, i) => (
                      <p key={i} className="text-[11px] text-slate-600 dark:text-slate-400">
                        <span className="font-mono">{formatDateTime(h.timestamp)}</span> ·{' '}
                        <span className="font-medium text-slate-800 dark:text-slate-200">{h.actor}</span>: {h.note}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Request Guidance Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Ajukan Sesi Bimbingan"
        subtitle="Pilih dosen pembimbing, bab yang dikonsultasikan, dan usulan waktu."
      >
        <form onSubmit={handleCreateSession} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Dosen Pembimbing *</label>
              <select
                required
                value={lecturerId}
                onChange={(e) => setLecturerId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {supervisors.map((s) => (
                  <option key={s.id} value={s.lecturer_id}>
                    {s.lecturer?.full_name} ({s.supervisor_role === 'primary' ? 'Pembimbing 1' : 'Pembimbing 2'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Bab yang Dikerjakan *</label>
              <select
                value={chapterNumber}
                onChange={(e) => setChapterNumber(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value={1}>Bab 1 — Pendahuluan</option>
                <option value={2}>Bab 2 — Tinjauan Pustaka</option>
                <option value={3}>Bab 3 — Metodologi Penelitian</option>
                <option value={4}>Bab 4 — Hasil dan Pembahasan</option>
                <option value={5}>Bab 5 — Kesimpulan</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Topik Konsultasi *</label>
              <input
                type="text"
                required
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Contoh: Konsultasi perancangan arsitektur sistem Bab 3"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Tanggal *</label>
              <input
                type="date"
                required
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Waktu *</label>
              <input
                type="time"
                required
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Catatan Konsultasi</label>
              <textarea
                rows={3}
                value={studentNotes}
                onChange={(e) => setStudentNotes(e.target.value)}
                placeholder="Tuliskan poin pertanyaan atau bagian yang ingin direview..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="sm:col-span-2">
              <FileUploadField
                label="Lampiran Dokumen (Opsional)"
                selectedFile={attachmentFile}
                onSelectFile={setAttachmentFile}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Kirim Permintaan
            </button>
          </div>
        </form>
      </Modal>

      {/* Send Revision Modal */}
      <Modal
        open={Boolean(revisionSession)}
        onClose={() => setRevisionSession(null)}
        title="Kirim Revisi Bimbingan"
        subtitle={revisionSession?.topic}
      >
        <form onSubmit={handleSendRevision} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Catatan Perbaikan / Revisi *</label>
            <textarea
              rows={3}
              required
              value={revisionNote}
              onChange={(e) => setRevisionNote(e.target.value)}
              placeholder="Jelaskan perbaikan yang telah Anda lakukan..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <FileUploadField
            label="Unggah Dokumen Revisi (Opsional)"
            selectedFile={revisionFile}
            onSelectFile={setRevisionFile}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRevisionSession(null)}
              className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
            >
              {submitting ? 'Mengirim...' : 'Kirim Revisi'}
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
