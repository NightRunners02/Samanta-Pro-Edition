import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, FileSearch, Loader2, Send } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';
import { FileUploadField } from '../../components/ui/FileUploadField';
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
import type { PlagiarismCheck, Program, ThesisDocument, ThesisSubmission } from '../../types/database';

export function PlagiarismPage() {
  const { profile, systemSettings } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [thesis, setThesis] = useState<ThesisSubmission | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [record, setRecord] = useState<PlagiarismCheck | null>(null);
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
        const { data: plagData } = await supabase
          .from('plagiarism_checks')
          .select('*')
          .eq('thesis_id', currentThesis.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const currentRecord = (plagData as PlagiarismCheck) || null;
        setRecord(currentRecord);

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

  // Realtime sync for plagiarism verification status & uploaded documents
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, loadData]);

  const maxAllowed = program?.max_plagiarism_pct ?? systemSettings?.default_max_plagiarism_pct ?? 25;
  const canSubmit = !record || ['not_submitted', 'revision_required', 'rejected'].includes(record.status);

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
          <h1 className="text-xl font-bold tracking-tight">Verifikasi Plagiasi (Berbasis Dokumen)</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Unggah hasil pemeriksaan kemiripan naskah untuk diverifikasi secara manual oleh Admin Program Studi. Batas maksimal prodi: <span className="font-mono font-semibold">{maxAllowed}%</span>.
          </p>
        </div>
        <StatusBadge status={record?.status || 'not_submitted'} />
      </div>

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

          {!canSubmit && (
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
