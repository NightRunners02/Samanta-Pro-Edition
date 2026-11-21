import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Eye, FileSearch, Loader2, Send } from 'lucide-react';
import { DocumentViewerModal } from '../../components/ui/DocumentViewerModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { FileUploadField } from '../../components/ui/FileUploadField';
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
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [supportingFile, setSupportingFile] = useState<File | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ThesisDocument | null>(null);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
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
        .select('*, document:thesis_documents!plagiarism_checks_document_id_fkey(*)')
        .eq('thesis_id', currentThesis.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setRecord((plagData as PlagiarismCheck) || null);
    }

    setLoading(false);
  }, [profile?.id, profile?.program_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const maxAllowed = program?.max_plagiarism_pct ?? systemSettings?.default_max_plagiarism_pct ?? 25;
  const canSubmit = !record || ['not_submitted', 'revision_required', 'rejected'].includes(record.status);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !thesis || !reportFile) {
      showToast('Unggah berkas hasil cek plagiasi terlebih dahulu', 'warning');
      return;
    }

    setSubmitting(true);
    const up = await uploadPrivateDocument({
      file: reportFile,
      userId: profile.id,
      studentId: profile.id,
      category: 'plagiarism_report',
      title: `Bukti Hasil Cek Plagiasi — ${profile.full_name}`,
      thesisId: thesis.id,
      maxUploadMb: systemSettings?.max_upload_mb || 25,
    });

    if (up.error || !up.data) {
      setSubmitting(false);
      showToast('Gagal mengunggah bukti plagiasi', 'error', up.error || 'Error');
      return;
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
      });
      if (!up2.error && up2.data) suppId = up2.data.id;
    }

    const payload = {
      thesis_id: thesis.id,
      student_id: profile.id,
      document_id: up.data.id,
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
    loadData();
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
    <div className="space-y-6 max-w-4xl">
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

          {record.document && (
            <button
              type="button"
              onClick={() => setPreviewDoc(record.document || null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Eye className="w-3.5 h-3.5" />
              Lihat Dokumen Bukti Plagiasi
            </button>
          )}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
      >
        <h2 className="text-sm font-semibold">Unggah Hasil Cek Plagiasi</h2>
        <FileUploadField
          label="Laporan Hasil Cek Kemiripan (PDF) *"
          accept=".pdf"
          selectedFile={reportFile}
          onSelectFile={setReportFile}
        />
        <FileUploadField
          label="Dokumen Pendukung (Opsional)"
          accept=".pdf,.png,.jpg"
          selectedFile={supportingFile}
          onSelectFile={setSupportingFile}
        />
        {canSubmit && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !reportFile}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Kirim Untuk Verifikasi
            </button>
          </div>
        )}
      </form>

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
