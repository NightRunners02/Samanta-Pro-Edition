import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  Loader2,
  Lock,
  Send,
} from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';
import { FileUploadField } from '../../components/ui/FileUploadField';
import {
  PostDefenseStepper,
  isDefenseCompleted,
} from '../../components/ui/PostDefenseStepper';
import {
  RealtimeDocumentPreviewPanel,
  SavedDocumentCard,
} from '../../components/ui/RealtimeDocumentPreviewPanel';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logActivity, supabase, uploadPrivateDocument } from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';
import type {
  DefenseRegistration,
  ExamSchedule,
  ExamScore,
  GraduationRecord,
  PlagiarismCheck,
  Program,
  ThesisDocument,
  ThesisSubmission,
} from '../../types/database';

interface PlagiarismPageProps {
  onNavigate?: (pageId: string) => void;
}

export function PlagiarismPage({ onNavigate }: PlagiarismPageProps) {
  const { profile, systemSettings } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [thesis, setThesis] = useState<ThesisSubmission | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [defenseSchedule, setDefenseSchedule] = useState<ExamSchedule | null>(null);
  const [defenseRegistration, setDefenseRegistration] = useState<DefenseRegistration | null>(null);
  const [scores, setScores] = useState<ExamScore[]>([]);
  const [fullThesisDoc, setFullThesisDoc] = useState<ThesisDocument | null>(null);
  const [record, setRecord] = useState<PlagiarismCheck | null>(null);
  const [graduation, setGraduation] = useState<GraduationRecord | null>(null);
  const [reportDoc, setReportDoc] = useState<ThesisDocument | null>(null);
  const [supportingDoc, setSupportingDoc] = useState<ThesisDocument | null>(null);

  const [reportFile, setReportFile] = useState<File | null>(null);
  const [supportingFile, setSupportingFile] = useState<File | null>(null);
  const [activePreviewSlot, setActivePreviewSlot] = useState<'report' | 'supporting'>('report');

  const loadData = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!profile?.id) return;
      if (!opts?.silent) setLoading(true);

      const [{ data: tData }, { data: pData }] = await Promise.all([
        supabase
          .from('thesis_submissions')
          .select('*')
          .eq('student_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        profile.program_id
          ? supabase.from('programs').select('*').eq('id', profile.program_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const currentThesis = (tData as ThesisSubmission) || null;
      setThesis(currentThesis);
      setProgram((pData as Program) || null);

      if (currentThesis) {
        const [
          { data: plagData },
          { data: schedData },
          { data: defRegData },
          { data: scoreData },
          { data: fullDocData },
          { data: gradData },
        ] = await Promise.all([
          supabase
            .from('plagiarism_checks')
            .select('*')
            .eq('thesis_id', currentThesis.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('exam_schedules')
            .select('*')
            .eq('thesis_id', currentThesis.id)
            .eq('exam_type', 'defense')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('defense_registrations')
            .select('*')
            .eq('thesis_id', currentThesis.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from('exam_scores').select('*').eq('thesis_id', currentThesis.id),
          supabase
            .from('thesis_documents')
            .select('*')
            .eq('thesis_id', currentThesis.id)
            .eq('category', 'full_thesis')
            .eq('is_latest', true)
            .limit(1)
            .maybeSingle(),
          supabase
            .from('graduation_records')
            .select('*')
            .eq('thesis_id', currentThesis.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        const currentRecord = (plagData as PlagiarismCheck) || null;
        setRecord(currentRecord);
        setDefenseSchedule((schedData as ExamSchedule) || null);
        setDefenseRegistration((defRegData as DefenseRegistration) || null);
        setScores((scoreData || []) as ExamScore[]);
        setFullThesisDoc((fullDocData as ThesisDocument) || null);
        setGraduation((gradData as GraduationRecord) || null);

        const docIds = [currentRecord?.document_id, currentRecord?.supporting_document_id].filter(
          Boolean
        ) as string[];
        if (docIds.length > 0) {
          const { data: docsData } = await supabase
            .from('thesis_documents')
            .select('*')
            .in('id', docIds);
          const docsMap = new Map<string, ThesisDocument>(
            ((docsData || []) as ThesisDocument[]).map((d) => [d.id, d])
          );
          setReportDoc(currentRecord?.document_id ? docsMap.get(currentRecord.document_id) || null : null);
          setSupportingDoc(
            currentRecord?.supporting_document_id
              ? docsMap.get(currentRecord.supporting_document_id) || null
              : null
          );
        } else {
          setReportDoc(null);
          setSupportingDoc(null);
        }
      } else {
        setRecord(null);
        setDefenseSchedule(null);
        setDefenseRegistration(null);
        setScores([]);
        setFullThesisDoc(null);
        setGraduation(null);
        setReportDoc(null);
        setSupportingDoc(null);
      }

      if (!opts?.silent) setLoading(false);
    },
    [profile?.id, profile?.program_id]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime sync for plagiarism verification, defense status, scores, documents, and yudisium
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`student_plagiarism_realtime_${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plagiarism_checks', filter: `student_id=eq.${profile.id}` },
        () => loadData({ silent: true })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'thesis_documents', filter: `student_id=eq.${profile.id}` },
        () => loadData({ silent: true })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exam_schedules', filter: `student_id=eq.${profile.id}` },
        () => loadData({ silent: true })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'defense_registrations', filter: `student_id=eq.${profile.id}` },
        () => loadData({ silent: true })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'graduation_records', filter: `student_id=eq.${profile.id}` },
        () => loadData({ silent: true })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, loadData]);

  const maxAllowed = program?.max_plagiarism_pct ?? systemSettings?.default_max_plagiarism_pct ?? 25;
  const defenseEnded = isDefenseCompleted(defenseSchedule, defenseRegistration, scores);
  const canSubmit =
    defenseEnded &&
    (!record || ['not_submitted', 'revision_required', 'rejected'].includes(record.status));

  const handleSelectReportFile = (file: File | null) => {
    setReportFile(file);
    if (file) setActivePreviewSlot('report');
  };

  const handleSelectSupportingFile = (file: File | null) => {
    setSupportingFile(file);
    if (file) setActivePreviewSlot('supporting');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !thesis) return;
    if (!defenseEnded) {
      showToast(
        'Sidang akhir belum berakhir',
        'warning',
        'Hasil cek plagiasi hanya dapat diunggah setelah pelaksanaan Sidang Akhir berakhir.'
      );
      return;
    }
    if (!reportFile && !record?.document_id) {
      showToast('Unggah berkas hasil cek plagiasi terlebih dahulu', 'warning');
      return;
    }

    setSubmitting(true);
    let docId = record?.document_id || null;

    if (reportFile) {
      const up = await uploadPrivateDocument({
        file: reportFile,
        userId: profile.id,
        studentId: profile.id,
        category: 'plagiarism_report',
        title: `Bukti Hasil Cek Plagiasi — ${profile.full_name}`,
        thesisId: thesis.id,
        parentDocumentId: docId,
        versionNumber: reportDoc ? reportDoc.version_number + 1 : 1,
        maxUploadMb: systemSettings?.max_upload_mb || 25,
      });

      if (up.error || !up.data) {
        setSubmitting(false);
        showToast('Gagal mengunggah bukti plagiasi', 'error', up.error || 'Error');
        return;
      }
      docId = up.data.id;
    }

    let suppId = record?.supporting_document_id || null;
    if (supportingFile) {
      const up2 = await uploadPrivateDocument({
        file: supportingFile,
        userId: profile.id,
        studentId: profile.id,
        category: 'supporting_document',
        title: `Dokumen Pendukung Plagiasi — ${profile.full_name}`,
        thesisId: thesis.id,
        parentDocumentId: suppId,
        versionNumber: supportingDoc ? supportingDoc.version_number + 1 : 1,
        maxUploadMb: systemSettings?.max_upload_mb || 25,
      });
      if (up2.error) {
        setSubmitting(false);
        showToast('Gagal mengunggah dokumen pendukung', 'error', up2.error);
        return;
      }
      if (up2.data) suppId = up2.data.id;
    }

    const payload = {
      thesis_id: thesis.id,
      student_id: profile.id,
      document_id: docId,
      supporting_document_id: suppId,
      max_allowed_percent: maxAllowed,
      tool_used: 'Manual Verification (Document Upload)',
      status: 'pending_verification',
      submitted_at: new Date().toISOString(),
    };

    const { data: saved, error } = record
      ? await supabase.from('plagiarism_checks').update(payload).eq('id', record.id).select('*').single()
      : await supabase.from('plagiarism_checks').insert(payload).select('*').single();

    setSubmitting(false);
    if (error) {
      showToast('Gagal mengirim verifikasi plagiasi', 'error', error.message);
      return;
    }

    await logActivity('submit_plagiarism_check', 'plagiarism_checks', saved.id, {});
    setReportFile(null);
    setSupportingFile(null);
    showToast('Dokumen plagiasi dikirim untuk verifikasi Admin Prodi', 'success');
    loadData({ silent: true });
  };

  if (loading) return <TableSkeleton rows={4} columns={3} />;

  if (!thesis) {
    return (
      <EmptyState
        icon={FileSearch}
        title="Belum Ada Tugas Akhir Aktif"
        description="Anda harus memiliki judul tugas akhir yang terdaftar sebelum mengunggah dokumen cek plagiasi."
      />
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Verifikasi Plagiasi (Pasca Sidang Akhir)</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Unggah hasil pemeriksaan kemiripan naskah final setelah sidang akhir berakhir sebagai syarat menuju Yudisium. Batas maksimal prodi:{' '}
            <span className="font-mono font-semibold">{maxAllowed}%</span>.
          </p>
        </div>
        <StatusBadge status={record?.status || 'not_submitted'} />
      </div>

      {/* Step-by-Step Post-Defense Progress up to Final Yudisium */}
      <PostDefenseStepper
        currentPage="plagiarism"
        defenseSchedule={defenseSchedule}
        defenseRegistration={defenseRegistration}
        scores={scores}
        fullThesisDoc={fullThesisDoc}
        plagiarism={record}
        graduation={graduation}
        onNavigate={onNavigate}
      />

      {!defenseEnded && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-3">
            <Lock className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                Unggah Hasil Cek Plagiasi Dibuka Setelah Sidang Akhir Berakhir
              </p>
              <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                Selesaikan pelaksanaan Sidang Akhir dan finalisasi penilaian terlebih dahulu sebelum mengunggah bukti cek plagiasi naskah final.
              </p>
            </div>
          </div>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('defense')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-medium shrink-0"
            >
              <span>Lihat Status Sidang</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {record?.status === 'approved' && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                Verifikasi Plagiasi Disetujui ({record.similarity_percent ?? 0}%)
              </p>
              <p className="text-emerald-800 dark:text-emerald-300 mt-0.5">
                Anda telah memenuhi syarat plagiasi. Lanjutkan ke step berikutnya untuk mengajukan berkas Yudisium hingga kelulusan resmi.
              </p>
            </div>
          </div>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('yudisium')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium shrink-0"
            >
              <span>Lanjut ke Pengajuan Yudisium</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {record && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-slate-500">Persentase Terverifikasi</p>
              <p className="text-lg font-bold font-mono tabular-nums mt-0.5">
                {record.similarity_percent !== null ? `${record.similarity_percent}%` : 'Menunggu Verifikasi'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Batas Maksimal Prodi</p>
              <p className="text-lg font-bold font-mono tabular-nums mt-0.5">{record.max_allowed_percent}%</p>
            </div>
            <div>
              <p className="text-slate-500">Tanggal Pengajuan</p>
              <p className="font-mono mt-1">{formatDateTime(record.submitted_at)}</p>
            </div>
          </div>

          {record.reviewer_notes && (
            <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-amber-800 dark:text-amber-300">{record.reviewer_notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Side-by-Side Upload & Realtime Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Unggah Hasil Cek Plagiasi</h2>
            <StatusBadge status={record?.status || 'not_submitted'} />
          </div>

          {reportDoc && (
            <SavedDocumentCard
              label="Laporan Hasil Cek Plagiasi Tersimpan"
              doc={reportDoc}
              isActivePreview={activePreviewSlot === 'report' && !reportFile}
              replacedByLocalFile={reportFile}
              onPreview={() => setActivePreviewSlot('report')}
            />
          )}

          {canSubmit && (
            <FileUploadField
              label={
                reportDoc
                  ? 'Ganti Laporan Hasil Cek Kemiripan (PDF)'
                  : 'Laporan Hasil Cek Kemiripan (PDF) *'
              }
              accept=".pdf"
              maxMb={systemSettings?.max_upload_mb || 25}
              selectedFile={reportFile}
              onSelectFile={handleSelectReportFile}
              helperText={
                reportDoc
                  ? 'Berkas tersimpan tetap aman jika Anda tidak memilih file baru.'
                  : undefined
              }
            />
          )}

          {supportingDoc && (
            <SavedDocumentCard
              label="Dokumen Pendukung Tersimpan"
              doc={supportingDoc}
              isActivePreview={activePreviewSlot === 'supporting' && !supportingFile}
              replacedByLocalFile={supportingFile}
              onPreview={() => setActivePreviewSlot('supporting')}
            />
          )}

          {canSubmit && (
            <FileUploadField
              label={
                supportingDoc
                  ? 'Ganti Dokumen Pendukung (PDF/Gambar)'
                  : 'Dokumen Pendukung (Opsional)'
              }
              accept=".pdf,.png,.jpg,.jpeg"
              maxMb={systemSettings?.max_upload_mb || 25}
              selectedFile={supportingFile}
              onSelectFile={handleSelectSupportingFile}
              helperText={
                supportingDoc
                  ? 'Berkas tersimpan tetap aman jika Anda tidak memilih file baru.'
                  : undefined
              }
            />
          )}

          {!defenseEnded && !record && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 px-3 py-2">
              Formulir unggah akan aktif otomatis setelah Sidang Akhir Anda dinyatakan selesai.
            </p>
          )}

          {defenseEnded && !canSubmit && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 px-3 py-2">
              Dokumen plagiasi Anda tetap tersimpan aman dan dapat dipratinjau atau diunduh ulang melalui panel di sebelah kanan.
            </p>
          )}

          {canSubmit && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={submitting || (!reportFile && !record?.document_id)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Kirim Untuk Verifikasi
              </button>
            </div>
          )}
        </form>

        <div className="lg:col-span-7">
          <RealtimeDocumentPreviewPanel
            title="Realtime Preview Bukti Plagiasi"
            activeSlotId={activePreviewSlot}
            onSelectSlot={(id) => setActivePreviewSlot(id as 'report' | 'supporting')}
            slots={[
              {
                id: 'report',
                label: 'Laporan Plagiasi',
                localFile: reportFile,
                savedDoc: reportDoc,
              },
              {
                id: 'supporting',
                label: 'Dokumen Pendukung',
                localFile: supportingFile,
                savedDoc: supportingDoc,
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
