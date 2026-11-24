import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Ban,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  History,
  Image as ImageIcon,
  Loader2,
  QrCode,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldAlert,
  Upload,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { generateGraduationCertificatePdf } from '../../lib/certificatePdf';
import {
  buildCertificateVerificationUrl,
  downloadCertificatePdf,
  formatCertificateNumber,
  getSignedCertificateUrl,
  issueGraduationCertificate,
  resolveCertificateConfig,
  revokeGraduationCertificate,
} from '../../lib/certificateService';
import { logActivity, supabase } from '../../lib/supabase';
import { cn, formatDate, formatDateTime } from '../../lib/utils';
import type {
  CertificateConfig,
  CertificateTemplateStyle,
  GraduationCertificate,
  GraduationRecord,
  Profile,
} from '../../types/database';
import { DataTable, type ColumnDef } from '../ui/DataTable';
import { Modal } from '../ui/Modal';

interface GraduationCertificatesPanelProps {
  graduatedRecords: GraduationRecord[];
  certificates: GraduationCertificate[];
  loading: boolean;
  onRefresh: () => void;
}

interface GraduatedRow {
  record: GraduationRecord;
  latestCert: GraduationCertificate | null;
  allVersions: GraduationCertificate[];
}

async function fileToNormalizedPngDataUrl(file: File, maxDim = 420): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round((img.width || 256) * scale));
        const h = Math.max(1, Math.round((img.height || 256) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context tidak tersedia.'));
          return;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('File gambar tidak valid.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

export function GraduationCertificatesPanel({
  graduatedRecords,
  certificates,
  loading,
  onRefresh,
}: GraduationCertificatesPanelProps) {
  const { profile, systemSettings, refreshSettings } = useAuth();
  const { showToast } = useToast();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'revoked' | 'unissued'>('all');
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  // Settings Form State
  const [certConfig, setCertConfig] = useState<CertificateConfig>(() =>
    resolveCertificateConfig(systemSettings)
  );
  const [savingConfig, setSavingConfig] = useState(false);
  const [previewSampleUrl, setPreviewSampleUrl] = useState<string | null>(null);
  const [generatingSample, setGeneratingSample] = useState(false);

  // Row Actions State
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [issuingRecordId, setIssuingRecordId] = useState<string | null>(null);
  const [previewCert, setPreviewCert] = useState<GraduationCertificate | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [historyRow, setHistoryRow] = useState<GraduatedRow | null>(null);
  const [reissueTarget, setReissueTarget] = useState<GraduatedRow | null>(null);
  const [reissueForm, setReissueForm] = useState({
    certificateNumber: '',
    issueDate: new Date().toISOString().slice(0, 10),
    signatoryName: '',
    signatoryTitle: '',
    signatoryNip: '',
    reason: '',
  });
  const [submittingReissue, setSubmittingReissue] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<GraduationCertificate | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [submittingRevoke, setSubmittingRevoke] = useState(false);

  // Sync config when systemSettings updates
  useEffect(() => {
    setCertConfig(resolveCertificateConfig(systemSettings));
  }, [systemSettings]);

  // Cleanup preview sample object URL
  useEffect(() => {
    return () => {
      if (previewSampleUrl) URL.revokeObjectURL(previewSampleUrl);
    };
  }, [previewSampleUrl]);

  // Load real PDF Preview via Signed URL
  useEffect(() => {
    let active = true;
    if (!previewCert) {
      setPreviewError(null);
      setPreviewUrl((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    const load = async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      const signed = await getSignedCertificateUrl(previewCert, 3600);
      if (!active) return;

      if (!signed) {
        setPreviewError('Gagal membuat Signed URL sertifikat.');
        setPreviewLoading(false);
        return;
      }

      try {
        const res = await fetch(signed);
        if (res.ok) {
          const blob = await res.blob();
          const obj = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
          if (!active) {
            URL.revokeObjectURL(obj);
            return;
          }
          setPreviewUrl((prev) => {
            if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
            return obj;
          });
          setPreviewLoading(false);
          return;
        }
      } catch {
        // fallback to signed url directly
      }
      setPreviewUrl(signed);
      setPreviewLoading(false);
    };

    load();
    return () => {
      active = false;
    };
  }, [previewCert]);

  // Merge graduated records with certificate versions
  const mergedRows = useMemo<GraduatedRow[]>(() => {
    return graduatedRecords.map((rec) => {
      const versions = certificates
        .filter((c) => c.graduation_record_id === rec.id)
        .sort((a, b) => b.version - a.version);
      const latest = versions.find((v) => v.is_latest) || versions[0] || null;
      return {
        record: rec,
        latestCert: latest,
        allVersions: versions,
      };
    });
  }, [graduatedRecords, certificates]);

  const availablePeriods = useMemo(() => {
    const set = new Set<string>();
    for (const row of mergedRows) {
      if (row.record.yudisium_period) set.add(row.record.yudisium_period);
    }
    return Array.from(set);
  }, [mergedRows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return mergedRows.filter((row) => {
      if (periodFilter !== 'all' && row.record.yudisium_period !== periodFilter) {
        return false;
      }
      if (statusFilter === 'valid' && row.latestCert?.certificate_status !== 'valid') {
        return false;
      }
      if (statusFilter === 'revoked' && row.latestCert?.certificate_status !== 'revoked') {
        return false;
      }
      if (statusFilter === 'unissued' && row.latestCert !== null) {
        return false;
      }
      if (!q) return true;
      const name = row.record.student?.full_name?.toLowerCase() || '';
      const nim = row.record.student?.nim_nip?.toLowerCase() || '';
      const certNo = row.latestCert?.certificate_number?.toLowerCase() || '';
      const verifyCode = row.latestCert?.verification_code?.toLowerCase() || '';
      return (
        name.includes(q) ||
        nim.includes(q) ||
        certNo.includes(q) ||
        verifyCode.includes(q)
      );
    });
  }, [mergedRows, periodFilter, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = mergedRows.length;
    const valid = mergedRows.filter((r) => r.latestCert?.certificate_status === 'valid').length;
    const revoked = mergedRows.filter((r) => r.latestCert?.certificate_status === 'revoked').length;
    const unissued = mergedRows.filter((r) => !r.latestCert).length;
    return { total, valid, revoked, unissued };
  }, [mergedRows]);

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'logo_url' | 'signature_image_url' | 'stamp_image_url'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      showToast('Format gambar tidak valid', 'warning', 'Unggah file PNG, JPG, SVG, atau WEBP.');
      return;
    }
    try {
      const dataUrl = await fileToNormalizedPngDataUrl(file, field === 'logo_url' ? 320 : 420);
      setCertConfig((prev) => ({ ...prev, [field]: dataUrl }));
      showToast('Gambar berhasil dimuat ke formulir', 'success', 'Klik "Simpan Pengaturan Sertifikat" untuk menerapkan.');
    } catch (err) {
      showToast('Gagal memproses gambar', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    const { error } = await supabase.rpc('save_certificate_config', {
      p_config: certConfig,
    });
    setSavingConfig(false);

    if (error) {
      showToast('Gagal menyimpan pengaturan sertifikat', 'error', error.message);
      return;
    }

    await refreshSettings();
    await logActivity('update_certificate_settings', 'system_settings', systemSettings?.id || null, {
      template_style: certConfig.template_style,
      university_name: certConfig.university_name,
      number_format: certConfig.number_format,
    });
    showToast('Pengaturan template & pejabat sertifikat disimpan', 'success');
  };

  const handlePreviewTemplateSample = async () => {
    setGeneratingSample(true);
    const baseRow = mergedRows[0]?.record;
    const sampleDate = new Date().toISOString().slice(0, 10);
    const sampleNumber = formatCertificateNumber({
      formatPattern: certConfig.number_format,
      sequenceNumber: Math.max(1, mergedRows.length + 1),
      programCode: baseRow?.student?.program?.code || 'IF',
      facultyCode: baseRow?.student?.department?.code || 'FT',
      issueDate: sampleDate,
      version: 1,
    });

    const blob = await generateGraduationCertificatePdf({
      certificateNumber: sampleNumber,
      certificateType: certConfig.certificate_title || 'SERTIFIKAT KELULUSAN TUGAS AKHIR',
      issueDate: sampleDate,
      graduationDate: baseRow?.graduation_date || sampleDate,
      certificateStatus: 'valid',
      verificationCode: 'TFC-PREVIEW-SAMPLE-V1',
      verificationUrl: buildCertificateVerificationUrl('TFC-PREVIEW-SAMPLE-V1'),
      version: 1,
      metadata: {
        template_style: certConfig.template_style,
        university_name: certConfig.university_name,
        university_subtitle: certConfig.university_subtitle,
        city: certConfig.city || certConfig.university_name,
        faculty_name: baseRow?.student?.department?.name || 'Fakultas Akademik',
        faculty_code: baseRow?.student?.department?.code || 'FAK',
        program_name: baseRow?.student?.program?.name || 'Program Studi Terdaftar',
        student_name: baseRow?.student?.full_name || 'Nama Mahasiswa Lulus',
        student_nim: baseRow?.student?.nim_nip || 'NIM Mahasiswa',
        thesis_title:
          baseRow?.thesis?.title ||
          'Judul Tugas Akhir Mahasiswa Akan Tampil Secara Dinamis dari Database Supabase',
        yudisium_period: baseRow?.yudisium_period || 'Yudisium Periode Berjalan',
        final_score: baseRow?.final_score ?? null,
        final_grade: baseRow?.final_grade ?? null,
        signatory_name:
          certConfig.signatory_name?.trim() ||
          baseRow?.student?.department?.dean_name ||
          'Nama Pejabat Penandatangan',
        signatory_title:
          certConfig.signatory_title?.trim() || 'Dekan Fakultas',
        signatory_nip: certConfig.signatory_nip?.trim() || null,
        show_official_stamp: certConfig.show_official_stamp,
      },
      logoUrl: certConfig.logo_url || systemSettings?.logo_url || systemSettings?.favicon_url || null,
      signatureImageUrl: certConfig.signature_image_url,
      stampImageUrl: certConfig.stamp_image_url,
    });

    const url = URL.createObjectURL(blob);
    setPreviewSampleUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setGeneratingSample(false);
  };

  const handleIssueInitial = async (record: GraduationRecord) => {
    setIssuingRecordId(record.id);
    const { data, error } = await issueGraduationCertificate({
      graduationRecordId: record.id,
      actorProfileId: profile?.id || null,
      isReissue: false,
      notifyStudent: true,
    });
    setIssuingRecordId(null);

    if (error || !data) {
      showToast('Gagal menerbitkan sertifikat', 'error', error || undefined);
      return;
    }
    showToast('Sertifikat kelulusan diterbitkan', 'success', `No: ${data.certificate_number}`);
    onRefresh();
  };

  const openReissueModal = (row: GraduatedRow) => {
    const nextVer = (row.latestCert?.version || 0) + 1;
    const today = new Date().toISOString().slice(0, 10);
    const suggestedNumber = formatCertificateNumber({
      formatPattern: certConfig.number_format,
      sequenceNumber: mergedRows.indexOf(row) + 1,
      programCode: row.record.student?.program?.code,
      facultyCode: row.record.student?.department?.code,
      issueDate: today,
      version: nextVer,
    });

    setReissueTarget(row);
    setReissueForm({
      certificateNumber: suggestedNumber,
      issueDate: today,
      signatoryName:
        row.latestCert?.certificate_metadata?.signatory_name ||
        certConfig.signatory_name ||
        row.record.student?.department?.dean_name ||
        '',
      signatoryTitle:
        row.latestCert?.certificate_metadata?.signatory_title ||
        certConfig.signatory_title ||
        '',
      signatoryNip:
        row.latestCert?.certificate_metadata?.signatory_nip ||
        certConfig.signatory_nip ||
        '',
      reason: '',
    });
  };

  const handleSubmitReissue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reissueTarget || !profile) return;
    setSubmittingReissue(true);
    const { data, error } = await issueGraduationCertificate({
      graduationRecordId: reissueTarget.record.id,
      actorProfileId: profile.id,
      isReissue: Boolean(reissueTarget.latestCert),
      customCertificateNumber: reissueForm.certificateNumber,
      customIssueDate: reissueForm.issueDate,
      customSignatoryName: reissueForm.signatoryName,
      customSignatoryTitle: reissueForm.signatoryTitle,
      customSignatoryNip: reissueForm.signatoryNip || null,
      reissueReason: reissueForm.reason.trim() || 'Pembaruan resmi sertifikat oleh Admin',
      notifyStudent: true,
    });
    setSubmittingReissue(false);

    if (error || !data) {
      showToast('Gagal menerbitkan ulang sertifikat', 'error', error || undefined);
      return;
    }

    setReissueTarget(null);
    showToast(
      `Sertifikat versi v${data.version} diterbitkan`,
      'success',
      `Nomor: ${data.certificate_number}`
    );
    onRefresh();
  };

  const handleSubmitRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeTarget || !profile) return;
    setSubmittingRevoke(true);
    const { error } = await revokeGraduationCertificate({
      certificate: revokeTarget,
      reason: revokeReason,
      actorProfileId: profile.id,
    });
    setSubmittingRevoke(false);

    if (error) {
      showToast('Gagal membatalkan sertifikat', 'error', error);
      return;
    }

    setRevokeTarget(null);
    setRevokeReason('');
    showToast('Sertifikat dibatalkan (Revoked)', 'warning');
    onRefresh();
  };

  const handleDownload = async (cert: GraduationCertificate) => {
    setDownloadingId(cert.id);
    const { error } = await downloadCertificatePdf(cert);
    setDownloadingId(null);
    if (error) {
      showToast('Gagal mengunduh PDF sertifikat', 'error', error);
      return;
    }
    showToast('Sertifikat PDF diunduh', 'success');
  };

  const columns: ColumnDef<GraduatedRow>[] = [
    {
      key: 'student',
      header: 'Mahasiswa Lulus',
      sortValue: (r) => r.record.student?.full_name || '',
      render: (r) => (
        <div className="min-w-0">
          <p className="font-medium text-slate-900 dark:text-slate-100">
            {r.record.student?.full_name || '—'}
          </p>
          <p className="text-[11px] font-mono text-slate-500">
            {r.record.student?.nim_nip || '—'} · {r.record.student?.program?.name || 'Program Studi'}
          </p>
        </div>
      ),
    },
    {
      key: 'period',
      header: 'Periode & Tgl Lulus',
      sortValue: (r) => r.record.graduation_date || '',
      render: (r) => (
        <div>
          <p className="text-xs">{r.record.yudisium_period || '—'}</p>
          <p className="text-[11px] font-mono tabular-nums text-slate-500">
            {formatDate(r.record.graduation_date)}
          </p>
        </div>
      ),
    },
    {
      key: 'certificate',
      header: 'Nomor & Kode QR',
      render: (r) =>
        r.latestCert ? (
          <div>
            <p className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
              {r.latestCert.certificate_number}
            </p>
            <p className="text-[11px] font-mono text-slate-500">
              QR: {r.latestCert.verification_code} · v{r.latestCert.version}
            </p>
          </div>
        ) : (
          <span className="text-xs text-slate-400">Belum diterbitkan</span>
        ),
    },
    {
      key: 'cert_status',
      header: 'Status Sertifikat',
      render: (r) => {
        if (!r.latestCert) {
          return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              <Loader2 className="w-3.5 h-3.5" />
              Belum Terbit
            </span>
          );
        }
        const valid = r.latestCert.certificate_status === 'valid';
        return (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-semibold',
              valid ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
            )}
          >
            {valid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            <span>{valid ? 'Valid' : 'Revoked'}</span>
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Kelola Sertifikat',
      align: 'right',
      render: (r) => (
        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
          {!r.latestCert ? (
            <button
              type="button"
              disabled={issuingRecordId === r.record.id}
              onClick={() => handleIssueInitial(r.record)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50"
            >
              {issuingRecordId === r.record.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Award className="w-3.5 h-3.5" />
              )}
              <span>Terbitkan</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                title="Preview Sertifikat PDF"
                onClick={() => setPreviewCert(r.latestCert)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>

              <button
                type="button"
                title="Download PDF"
                disabled={downloadingId === r.latestCert.id}
                onClick={() => r.latestCert && handleDownload(r.latestCert)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50"
              >
                {downloadingId === r.latestCert.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>PDF</span>
              </button>

              <button
                type="button"
                title="Terbitkan Ulang Versi Baru"
                onClick={() => openReissueModal(r)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Terbitkan Ulang</span>
              </button>

              {r.latestCert.certificate_status === 'valid' && (
                <button
                  type="button"
                  title="Batalkan Sertifikat"
                  onClick={() => {
                    setRevokeTarget(r.latestCert);
                    setRevokeReason('');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Batalkan</span>
                </button>
              )}

              <button
                type="button"
                title="Riwayat Penerbitan"
                onClick={() => setHistoryRow(r)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-mono"
              >
                <History className="w-3.5 h-3.5" />
                <span>{r.allVersions.length}</span>
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const sampleCertNumber = formatCertificateNumber({
    formatPattern: certConfig.number_format,
    sequenceNumber: Math.max(1, stats.total + 1),
    programCode: 'IF',
    facultyCode: 'FT',
    issueDate: new Date().toISOString().slice(0, 10),
    version: 1,
  });

  return (
    <div className="space-y-5">
      {/* KPI & Settings Trigger Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Total Mahasiswa Lulus</p>
            <p className="text-xl font-bold font-mono tabular-nums mt-0.5">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Sertifikat Valid</p>
            <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">
              {stats.valid}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Dibatalkan (Revoked)</p>
            <p className="text-xl font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400 mt-0.5">
              {stats.revoked}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Belum Diterbitkan</p>
            <p className="text-xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400 mt-0.5">
              {stats.unissued}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowSettingsDrawer((v) => !v)}
          className={cn(
            'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap shrink-0',
            showSettingsDrawer
              ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-cyan-400'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
          )}
        >
          <Settings2 className="w-4 h-4" />
          <span>{showSettingsDrawer ? 'Tutup Pengaturan Template' : 'Atur Template & Pejabat'}</span>
        </button>
      </div>

      {/* Collapsible Certificate Template, Institution Logo, Number Format & Signatory Configurator */}
      {showSettingsDrawer && (
        <form
          onSubmit={handleSaveConfig}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5 text-xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-semibold">
                Pengaturan Template, Identitas Universitas, & Pejabat Penandatangan
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Seluruh penerbitan sertifikat otomatis maupun penerbitan ulang menggunakan konfigurasi ini secara dinamis.
              </p>
            </div>
            <button
              type="button"
              disabled={generatingSample}
              onClick={handlePreviewTemplateSample}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium whitespace-nowrap"
            >
              {generatingSample ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
              <span>Preview Desain Template</span>
            </button>
          </div>

          {/* Template Style Selection */}
          <div>
            <label className="block font-medium mb-2">Pilih Gaya Template Sertifikat (A4 Landscape)</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  {
                    id: 'academic_navy',
                    name: 'Academic Navy & Gold',
                    desc: 'Bingkai formal biru tua dengan garis emas dan sudut ornamen klasik.',
                  },
                  {
                    id: 'classic_gold',
                    name: 'Classic Burgundy & Gold',
                    desc: 'Gaya akademis klasik bernuansa merah marun institusi dan emas.',
                  },
                  {
                    id: 'modern_minimal',
                    name: 'Modern Institusional',
                    desc: 'Tata letak minimalis simetris dengan aksen biru modern.',
                  },
                ] as Array<{ id: CertificateTemplateStyle; name: string; desc: string }>
              ).map((tpl) => {
                const active = certConfig.template_style === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setCertConfig((p) => ({ ...p, template_style: tpl.id }))}
                    className={cn(
                      'text-left p-3.5 rounded-xl border transition-colors',
                      active
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30 dark:border-cyan-400'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    )}
                  >
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{tpl.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{tpl.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* University Identity & Number Format */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium mb-1">Nama Universitas / Institusi</label>
              <input
                type="text"
                required
                value={certConfig.university_name}
                onChange={(e) => setCertConfig({ ...certConfig, university_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block font-medium mb-1">Subjudul / Keterangan Institusi</label>
              <input
                type="text"
                value={certConfig.university_subtitle}
                onChange={(e) =>
                  setCertConfig({ ...certConfig, university_subtitle: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block font-medium mb-1">Kota Penerbitan</label>
              <input
                type="text"
                value={certConfig.city}
                onChange={(e) => setCertConfig({ ...certConfig, city: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block font-medium mb-1">Judul Sertifikat</label>
              <input
                type="text"
                required
                value={certConfig.certificate_title}
                onChange={(e) =>
                  setCertConfig({ ...certConfig, certificate_title: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-medium mb-1">
                Format Nomor Sertifikat (Token: <code className="font-mono">{'{SEQ}'}</code>,{' '}
                <code className="font-mono">{'{PRODI}'}</code>,{' '}
                <code className="font-mono">{'{FAK}'}</code>,{' '}
                <code className="font-mono">{'{MONTH}'}</code>,{' '}
                <code className="font-mono">{'{YEAR}'}</code>,{' '}
                <code className="font-mono">{'{VER}'}</code>)
              </label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <input
                  type="text"
                  required
                  value={certConfig.number_format}
                  onChange={(e) => setCertConfig({ ...certConfig, number_format: e.target.value })}
                  className="flex-1 px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <span className="text-[11px] font-mono text-slate-500 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 whitespace-nowrap">
                  Contoh: {sampleCertNumber}
                </span>
              </div>
            </div>
          </div>

          {/* Signatory & Date Default */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block font-medium mb-1">Nama Pejabat Penandatangan</label>
              <input
                type="text"
                placeholder="Kosongkan untuk gunakan Dekan Fakultas"
                value={certConfig.signatory_name}
                onChange={(e) => setCertConfig({ ...certConfig, signatory_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block font-medium mb-1">Jabatan Pejabat</label>
              <input
                type="text"
                placeholder="Contoh: Dekan Fakultas Teknik"
                value={certConfig.signatory_title}
                onChange={(e) => setCertConfig({ ...certConfig, signatory_title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block font-medium mb-1">NIP / NIDN Pejabat</label>
              <input
                type="text"
                placeholder="Opsional"
                value={certConfig.signatory_nip}
                onChange={(e) => setCertConfig({ ...certConfig, signatory_nip: e.target.value })}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block font-medium mb-1">Default Tanggal Penerbitan</label>
              <select
                value={certConfig.default_issue_mode}
                onChange={(e) =>
                  setCertConfig({
                    ...certConfig,
                    default_issue_mode: e.target.value as 'graduation_date' | 'today',
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="graduation_date">Sesuai Tanggal Kelulusan</option>
                <option value="today">Tanggal Penerbitan Sistem (Hari Ini)</option>
              </select>
            </div>
          </div>

          {/* Visual Assets Upload: Logo, Signature Image, Stamp Image */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            {[
              {
                field: 'logo_url' as const,
                label: 'Logo Resmi Universitas',
                hint: 'Tampil pada kop tengah sertifikat.',
                current: certConfig.logo_url,
              },
              {
                field: 'signature_image_url' as const,
                label: 'Gambar Tanda Tangan Pejabat (Opsional)',
                hint: 'Gunakan PNG transparan untuk hasil terbaik.',
                current: certConfig.signature_image_url,
              },
              {
                field: 'stamp_image_url' as const,
                label: 'Gambar Stempel Resmi (Opsional)',
                hint: 'Gunakan stempel vektor resmi jika kosong.',
                current: certConfig.stamp_image_url,
              },
            ].map((asset) => (
              <div
                key={asset.field}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 flex items-center gap-3"
              >
                <div className="w-12 h-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden shrink-0">
                  {asset.current ? (
                    <img
                      src={asset.current}
                      alt={asset.label}
                      className="w-full h-full object-contain p-1"
                    />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    {asset.label}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">{asset.hint}</p>
                  <div className="flex items-center gap-1.5">
                    <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-700 hover:bg-blue-800 text-white text-[11px] font-medium cursor-pointer">
                      <Upload className="w-3 h-3" />
                      <span>Pilih Gambar</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(e) => handleImageUpload(e, asset.field)}
                      />
                    </label>
                    {asset.current && (
                      <button
                        type="button"
                        onClick={() => setCertConfig({ ...certConfig, [asset.field]: null })}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={certConfig.show_official_stamp}
                onChange={(e) =>
                  setCertConfig({ ...certConfig, show_official_stamp: e.target.checked })
                }
              />
              <span>Tampilkan Stempel Resmi Universitas/Fakultas pada Sertifikat PDF</span>
            </label>

            <button
              type="submit"
              disabled={savingConfig}
              className="inline-flex items-center gap-2 px-4 py-2 font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50"
            >
              {savingConfig ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Simpan Pengaturan Sertifikat</span>
            </button>
          </div>
        </form>
      )}

      {/* Search & Filter Toolbar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
        <div className="md:col-span-5 relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama mahasiswa, NIM, nomor sertifikat, atau kode QR..."
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
          />
        </div>

        <div className="md:col-span-4">
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            <option value="all">Semua Periode Kelulusan</option>
            {availablePeriods.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'all' | 'valid' | 'revoked' | 'unissued')
            }
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            <option value="all">Semua Status Sertifikat</option>
            <option value="valid">Valid</option>
            <option value="revoked">Revoked / Tidak Berlaku</option>
            <option value="unissued">Belum Diterbitkan</option>
          </select>
        </div>
      </div>

      {/* Certificates DataTable */}
      <DataTable
        data={filteredRows}
        columns={columns}
        keyField={(r) => r.record.id}
        loading={loading}
        emptyTitle="Belum ada mahasiswa berstatus Graduated"
        emptyDescription="Sertifikat otomatis diterbitkan ketika Admin memvalidasi status yudisium menjadi Graduated / Selesai."
      />

      {/* Preview Real Certificate Modal */}
      {previewCert && (
        <Modal
          open={Boolean(previewCert)}
          onClose={() => setPreviewCert(null)}
          title={`Preview Sertifikat — ${previewCert.certificate_number}`}
          subtitle={`Versi v${previewCert.version} · Status: ${
            previewCert.certificate_status === 'valid' ? 'Valid' : 'Revoked / Tidak Berlaku'
          } · Kode QR: ${previewCert.verification_code}`}
          maxWidth="2xl"
          footer={
            <div className="w-full flex flex-wrap items-center justify-between gap-2">
              <a
                href={buildCertificateVerificationUrl(previewCert.verification_code)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Buka Halaman Verifikasi QR</span>
              </a>
              <div className="flex items-center gap-2">
                {previewUrl && (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Tab Baru</span>
                  </a>
                )}
                <button
                  type="button"
                  disabled={downloadingId === previewCert.id}
                  onClick={() => handleDownload(previewCert)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
              </div>
            </div>
          }
        >
          {previewLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin mb-2 text-blue-600" />
              <p className="text-xs">Memuat Sertifikat PDF via Signed URL...</p>
            </div>
          )}
          {!previewLoading && previewError && (
            <p className="py-12 text-center text-xs text-rose-600">{previewError}</p>
          )}
          {!previewLoading && !previewError && previewUrl && (
            <iframe
              src={previewUrl}
              title={previewCert.certificate_number}
              className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950"
            />
          )}
        </Modal>
      )}

      {/* Template Sample Preview Modal */}
      {previewSampleUrl && (
        <Modal
          open={Boolean(previewSampleUrl)}
          onClose={() => {
            URL.revokeObjectURL(previewSampleUrl);
            setPreviewSampleUrl(null);
          }}
          title="Preview Desain Template Sertifikat"
          subtitle={`Gaya aktif: ${certConfig.template_style} · Ukuran A4 Landscape`}
          maxWidth="2xl"
        >
          <iframe
            src={previewSampleUrl}
            title="Preview Template Sertifikat"
            className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950"
          />
        </Modal>
      )}

      {/* Re-issue Modal */}
      {reissueTarget && (
        <Modal
          open={Boolean(reissueTarget)}
          onClose={() => setReissueTarget(null)}
          title="Terbitkan Ulang Sertifikat Kelulusan"
          subtitle={`${reissueTarget.record.student?.full_name} (${reissueTarget.record.student?.nim_nip || '—'})`}
        >
          <form onSubmit={handleSubmitReissue} className="space-y-4 text-xs">
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 px-3.5 py-2.5 text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <RefreshCw className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Penerbitan ulang akan membuat versi baru (v{(reissueTarget.latestCert?.version || 0) + 1}) dengan Kode QR Verifikasi baru dan mencatat riwayat penerbitan secara permanen.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Nomor Sertifikat Baru</label>
                <input
                  type="text"
                  required
                  value={reissueForm.certificateNumber}
                  onChange={(e) =>
                    setReissueForm({ ...reissueForm, certificateNumber: e.target.value })
                  }
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Tanggal Penerbitan</label>
                <input
                  type="date"
                  required
                  value={reissueForm.issueDate}
                  onChange={(e) => setReissueForm({ ...reissueForm, issueDate: e.target.value })}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Pejabat Penandatangan</label>
                <input
                  type="text"
                  required
                  value={reissueForm.signatoryName}
                  onChange={(e) =>
                    setReissueForm({ ...reissueForm, signatoryName: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Jabatan Pejabat</label>
                <input
                  type="text"
                  required
                  value={reissueForm.signatoryTitle}
                  onChange={(e) =>
                    setReissueForm({ ...reissueForm, signatoryTitle: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-medium mb-1">NIP / NIDN Pejabat</label>
                <input
                  type="text"
                  value={reissueForm.signatoryNip}
                  onChange={(e) =>
                    setReissueForm({ ...reissueForm, signatoryNip: e.target.value })
                  }
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-medium mb-1">Alasan Penerbitan Ulang</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Contoh: Perbaikan ejaan nama mahasiswa / pembaruan pejabat penandatangan..."
                  value={reissueForm.reason}
                  onChange={(e) => setReissueForm({ ...reissueForm, reason: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReissueTarget(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submittingReissue}
                className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50"
              >
                {submittingReissue ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>Terbitkan Versi Baru PDF</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Revoke Certificate Modal */}
      {revokeTarget && (
        <Modal
          open={Boolean(revokeTarget)}
          onClose={() => setRevokeTarget(null)}
          title="Batalkan Sertifikat Kelulusan (Revoke)"
          subtitle={`No. Sertifikat: ${revokeTarget.certificate_number}`}
          maxWidth="sm"
        >
          <form onSubmit={handleSubmitRevoke} className="space-y-4 text-xs">
            <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/20 px-3.5 py-2.5 text-rose-800 dark:text-rose-300 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Sertifikat yang dibatalkan akan berstatus <strong>Revoked / Tidak Berlaku</strong> pada Dashboard Mahasiswa maupun saat QR Code dipindai.
              </span>
            </div>

            <div>
              <label className="block font-medium mb-1">Alasan Pembatalan Resmi (Wajib)</label>
              <textarea
                rows={3}
                required
                placeholder="Jelaskan alasan pembatalan sertifikat secara resmi..."
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRevokeTarget(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submittingRevoke || !revokeReason.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50"
              >
                {submittingRevoke ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Ban className="w-3.5 h-3.5" />
                )}
                <span>Konfirmasi Batalkan Sertifikat</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Version History Modal */}
      {historyRow && (
        <Modal
          open={Boolean(historyRow)}
          onClose={() => setHistoryRow(null)}
          title="Riwayat Penerbitan Sertifikat"
          subtitle={`${historyRow.record.student?.full_name} (${historyRow.record.student?.nim_nip || '—'})`}
          maxWidth="lg"
        >
          <div className="space-y-3 text-xs">
            {historyRow.allVersions.map((ver) => (
              <div
                key={ver.id}
                className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      v{ver.version}
                    </span>
                    <span className="font-mono font-semibold text-blue-700 dark:text-cyan-400">
                      {ver.certificate_number}
                    </span>
                    <span
                      className={cn(
                        'font-semibold',
                        ver.certificate_status === 'valid'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      )}
                    >
                      · {ver.certificate_status === 'valid' ? 'Valid' : 'Revoked'}
                    </span>
                    {ver.is_latest && (
                      <span className="text-[11px] text-slate-500 font-medium">· Versi Aktif</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    Terbit: {formatDate(ver.issue_date)} · QR: {ver.verification_code} · Dibuat:{' '}
                    {formatDateTime(ver.created_at)}
                  </p>
                  {ver.issuer && (
                    <p className="text-[11px] text-slate-500">
                      Diterbitkan oleh: {(ver.issuer as Profile).full_name}
                    </p>
                  )}
                  {ver.certificate_metadata?.reissue_reason && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      Catatan Penerbitan Ulang: {ver.certificate_metadata.reissue_reason}
                    </p>
                  )}
                  {ver.revocation_reason && (
                    <p className="text-[11px] text-rose-700 dark:text-rose-400">
                      Alasan Pembatalan: {ver.revocation_reason}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryRow(null);
                      setPreviewCert(ver);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(ver)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-700 hover:bg-blue-800 text-white font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
