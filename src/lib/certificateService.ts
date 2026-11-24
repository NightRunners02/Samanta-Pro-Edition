import { generateGraduationCertificatePdf } from './certificatePdf';
import { formatLecturerAcademicName } from './decreeService';
import { getSignedDocumentUrl, logActivity, sendNotification, supabase } from './supabase';
import type {
  AcademicPeriod,
  CertificateConfig,
  Department,
  GraduationCertificate,
  GraduationCertificateMetadata,
  GraduationRecord,
  Profile,
  Program,
  SystemSettings,
  ThesisSubmission,
} from '../types/database';

export const CERTIFICATE_BUCKET = 'graduation-certificates';

export const DEFAULT_CERTIFICATE_CONFIG: CertificateConfig = {
  template_style: 'academic_navy',
  university_name: 'TAFlow Academic University',
  university_subtitle: 'Terakreditasi Institusi · Layanan Akademik Terintegrasi',
  city: 'Indonesia',
  certificate_title: 'SERTIFIKAT KELULUSAN TUGAS AKHIR',
  number_format: '{SEQ}/SERT-TA/{PRODI}/{YEAR}',
  signatory_name: '',
  signatory_title: '',
  signatory_nip: '',
  logo_url: null,
  signature_image_url: null,
  stamp_image_url: null,
  show_official_stamp: true,
  default_issue_mode: 'graduation_date',
};

export function resolveCertificateConfig(
  settings?: SystemSettings | null
): CertificateConfig {
  const raw = (settings?.certificate_config || {}) as Partial<CertificateConfig>;
  return {
    ...DEFAULT_CERTIFICATE_CONFIG,
    university_name:
      raw.university_name?.trim() ||
      settings?.app_name?.trim() ||
      DEFAULT_CERTIFICATE_CONFIG.university_name,
    logo_url: raw.logo_url ?? settings?.logo_url ?? settings?.favicon_url ?? null,
    ...raw,
  };
}

export function buildCertificateVerificationUrl(verificationCode: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://taflow.ac.id';
  return `${origin}/?verify_cert=${encodeURIComponent(verificationCode)}`;
}

export function generateVerificationCode(params: {
  graduationRecordId: string;
  version: number;
}): string {
  const cleanId = params.graduationRecordId.replace(/-/g, '').slice(0, 6).toUpperCase();
  const randBytes = new Uint8Array(4);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randBytes);
  } else {
    for (let i = 0; i < randBytes.length; i += 1) {
      randBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const randomHex = Array.from(randBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `TFC-${cleanId}-${randomHex}-V${params.version}`;
}

export function formatCertificateNumber(params: {
  formatPattern: string;
  sequenceNumber: number;
  programCode?: string | null;
  facultyCode?: string | null;
  issueDate: string;
  version: number;
}): string {
  const dateObj = new Date(params.issueDate);
  const year = !Number.isNaN(dateObj.getTime())
    ? String(dateObj.getFullYear())
    : params.issueDate.slice(0, 4) || String(new Date().getFullYear());
  const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const monthRoman = !Number.isNaN(dateObj.getTime())
    ? romanMonths[dateObj.getMonth()] || 'I'
    : 'I';

  const seqPadded = String(Math.max(1, params.sequenceNumber)).padStart(4, '0');
  const prodi = (params.programCode || 'TA').toUpperCase();
  const fak = (params.facultyCode || 'FAK').toUpperCase();
  const pattern = params.formatPattern?.trim() || DEFAULT_CERTIFICATE_CONFIG.number_format;

  const hasVerToken = pattern.includes('{VER}');
  let formatted = pattern
    .replace(/\{SEQ\}/g, seqPadded)
    .replace(/\{PRODI\}/g, prodi)
    .replace(/\{FAK\}/g, fak)
    .replace(/\{MONTH\}/g, monthRoman)
    .replace(/\{YEAR\}/g, year)
    .replace(/\{VER\}/g, `V${params.version}`);

  if (!hasVerToken && params.version > 1) {
    formatted = `${formatted}/V${params.version}`;
  }
  return formatted;
}

export interface IssueCertificateOptions {
  graduationRecordId: string;
  actorProfileId?: string | null;
  isReissue?: boolean;
  customCertificateNumber?: string;
  customIssueDate?: string;
  customSignatoryName?: string;
  customSignatoryTitle?: string;
  customSignatoryNip?: string | null;
  reissueReason?: string | null;
  notifyStudent?: boolean;
}

export async function issueGraduationCertificate(
  options: IssueCertificateOptions
): Promise<{ data: GraduationCertificate | null; error: string | null }> {
  const {
    graduationRecordId,
    actorProfileId = null,
    isReissue = false,
    customCertificateNumber,
    customIssueDate,
    customSignatoryName,
    customSignatoryTitle,
    customSignatoryNip,
    reissueReason = null,
    notifyStudent = true,
  } = options;

  // 1. Fetch graduation record + student + thesis + program + department + system_settings + existing versions
  const [{ data: recordRaw, error: recError }, { data: settingsRaw }, { data: existingRaw }] =
    await Promise.all([
      supabase
        .from('graduation_records')
        .select(
          '*, student:profiles!graduation_records_student_id_fkey(*, program:programs(*, department:departments(*)), department:departments(*)), thesis:thesis_submissions(*, program:programs(*, department:departments(*)), period:academic_periods(*))'
        )
        .eq('id', graduationRecordId)
        .single(),
      supabase.from('system_settings').select('*').limit(1).maybeSingle(),
      supabase
        .from('graduation_certificates')
        .select('*')
        .eq('graduation_record_id', graduationRecordId)
        .order('version', { ascending: false }),
    ]);

  if (recError || !recordRaw) {
    return { data: null, error: recError?.message || 'Data kelulusan tidak ditemukan.' };
  }

  const record = recordRaw as GraduationRecord & {
    student?: Profile & { program?: Program & { department?: Department }; department?: Department };
    thesis?: ThesisSubmission & { program?: Program & { department?: Department }; period?: AcademicPeriod };
  };

  // STRICT ELIGIBILITY GUARD: Never issue certificate unless status === 'graduated'
  if (record.status !== 'graduated') {
    return {
      data: null,
      error: 'Sertifikat hanya dapat diterbitkan untuk mahasiswa dengan status kelulusan Graduated / Selesai.',
    };
  }

  const existingVersions = (existingRaw || []) as GraduationCertificate[];

  // Idempotency guard for automatic initial issuance
  if (!isReissue && existingVersions.length > 0) {
    const latestExisting = existingVersions.find((c) => c.is_latest) || existingVersions[0];
    return { data: latestExisting, error: null };
  }

  const student = record.student;
  const thesis = record.thesis;
  if (!student || !thesis) {
    return { data: null, error: 'Data mahasiswa atau Tugas Akhir terkait tidak lengkap.' };
  }

  const settings = (settingsRaw as SystemSettings | null) || null;
  const certConfig = resolveCertificateConfig(settings);
  const program = thesis.program || student.program || null;
  const department = program?.department || student.department || null;

  const nextVersion =
    existingVersions.length > 0 ? Math.max(...existingVersions.map((c) => c.version)) + 1 : 1;

  const graduationDate = record.graduation_date || new Date().toISOString().slice(0, 10);
  const issueDate =
    customIssueDate?.trim() ||
    (certConfig.default_issue_mode === 'graduation_date'
      ? graduationDate
      : new Date().toISOString().slice(0, 10));

  // Count existing certificates to build a sequential non-colliding sequence number
  const { count: totalCertsCount } = await supabase
    .from('graduation_certificates')
    .select('id', { count: 'exact', head: true });
  const sequenceNum = (totalCertsCount || 0) + 1;

  let certificateNumber =
    customCertificateNumber?.trim() ||
    (!isReissue && record.certificate_number?.trim()
      ? record.certificate_number.trim()
      : formatCertificateNumber({
          formatPattern: certConfig.number_format,
          sequenceNumber: sequenceNum,
          programCode: program?.code,
          facultyCode: department?.code,
          issueDate,
          version: nextVersion,
        }));

  // Ensure uniqueness if a caller passed or reused a number already in graduation_certificates
  if (existingVersions.some((v) => v.certificate_number === certificateNumber)) {
    certificateNumber = `${certificateNumber}/V${nextVersion}`;
  }

  let actorProfile: Profile | null = null;
  if (actorProfileId) {
    const { data: ap } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', actorProfileId)
      .maybeSingle();
    actorProfile = (ap as Profile | null) || null;
  }

  const facultyName = department?.name || 'Fakultas Akademik';
  const programFullName = program
    ? `${program.degree_level ? `${program.degree_level} ` : ''}${program.name}`
    : 'Program Studi';

  const signatoryName =
    customSignatoryName?.trim() ||
    certConfig.signatory_name?.trim() ||
    department?.dean_name ||
    (actorProfile ? formatLecturerAcademicName(actorProfile) : 'Dekan Fakultas');

  const signatoryTitle =
    customSignatoryTitle?.trim() ||
    certConfig.signatory_title?.trim() ||
    `Dekan ${facultyName}`;

  const signatoryNip =
    customSignatoryNip !== undefined
      ? customSignatoryNip
      : certConfig.signatory_nip?.trim() || actorProfile?.nim_nip || null;

  const verificationCode = generateVerificationCode({
    graduationRecordId: record.id,
    version: nextVersion,
  });
  const verificationUrl = buildCertificateVerificationUrl(verificationCode);

  const metadata: GraduationCertificateMetadata = {
    template_style: certConfig.template_style || 'academic_navy',
    university_name: certConfig.university_name,
    university_subtitle: certConfig.university_subtitle,
    city: certConfig.city || certConfig.university_name,
    faculty_name: facultyName,
    faculty_code: department?.code || 'FAK',
    program_name: programFullName,
    program_code: program?.code || 'TA',
    student_name: student.full_name,
    student_nim: student.nim_nip || '-',
    thesis_title: thesis.title,
    yudisium_period: record.yudisium_period,
    final_score: record.final_score,
    final_grade: record.final_grade,
    signatory_name: signatoryName,
    signatory_title: signatoryTitle,
    signatory_nip: signatoryNip,
    show_official_stamp: certConfig.show_official_stamp ?? true,
    reissue_reason: reissueReason,
  };

  // 2. Render authentic A4 Landscape Certificate PDF Blob
  const pdfBlob = await generateGraduationCertificatePdf({
    certificateNumber,
    certificateType: certConfig.certificate_title || 'Sertifikat Kelulusan Tugas Akhir',
    issueDate,
    graduationDate,
    certificateStatus: 'valid',
    verificationCode,
    verificationUrl,
    version: nextVersion,
    metadata,
    logoUrl: certConfig.logo_url || settings?.logo_url || settings?.favicon_url || null,
    signatureImageUrl: certConfig.signature_image_url || null,
    stampImageUrl: certConfig.stamp_image_url || null,
  });

  // 3. Upload permanently to private bucket 'graduation-certificates'
  const safeNim = (student.nim_nip || student.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Sertifikat_Kelulusan_${safeNim}_v${nextVersion}.pdf`;
  const storagePath = `${student.id}/${record.id}/${Date.now()}_v${nextVersion}_${fileName}`;
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  const { error: uploadError } = await supabase.storage
    .from(CERTIFICATE_BUCKET)
    .upload(storagePath, pdfFile, {
      cacheControl: '3600',
      upsert: false,
      contentType: 'application/pdf',
    });

  if (uploadError) {
    return { data: null, error: uploadError.message };
  }

  // 4. Mark previous versions non-latest (only on admin re-issue)
  if (nextVersion > 1) {
    await supabase
      .from('graduation_certificates')
      .update({ is_latest: false })
      .eq('graduation_record_id', record.id)
      .eq('is_latest', true);
  }

  // 5. Save certificate metadata in graduation_certificates
  const { data: inserted, error: insertError } = await supabase
    .from('graduation_certificates')
    .insert({
      student_id: student.id,
      thesis_submission_id: thesis.id,
      graduation_record_id: record.id,
      certificate_number: certificateNumber,
      certificate_type: certConfig.certificate_title || 'Sertifikat Kelulusan Tugas Akhir',
      issue_date: issueDate,
      graduation_date: graduationDate,
      certificate_status: 'valid',
      pdf_storage_path: storagePath,
      verification_code: verificationCode,
      version: nextVersion,
      is_latest: true,
      issued_by: actorProfileId,
      certificate_metadata: metadata,
    })
    .select('*')
    .single();

  if (insertError) {
    return { data: null, error: insertError.message };
  }

  // Keep graduation_records.certificate_number synced cleanly
  await supabase
    .from('graduation_records')
    .update({ certificate_number: certificateNumber })
    .eq('id', record.id);

  if (notifyStudent) {
    await sendNotification({
      userId: student.id,
      title:
        nextVersion > 1
          ? `Sertifikat Kelulusan Diperbarui (v${nextVersion})`
          : 'Sertifikat Kelulusan Tersedia',
      message: `Sertifikat Kelulusan Tugas Akhir Nomor ${certificateNumber} telah diterbitkan dan tersedia di Dashboard Mahasiswa.`,
      category: 'graduation',
      entityType: 'graduation_certificates',
      entityId: inserted.id,
    });
  }

  await logActivity(
    nextVersion > 1 ? 'reissue_graduation_certificate' : 'issue_graduation_certificate',
    'graduation_certificates',
    inserted.id,
    {
      certificate_number: certificateNumber,
      verification_code: verificationCode,
      version: nextVersion,
      graduation_record_id: record.id,
    }
  );

  return { data: inserted as GraduationCertificate, error: null };
}

export async function ensureInitialCertificateIfEligible(params: {
  graduationRecordId: string;
  actorProfileId?: string | null;
}): Promise<GraduationCertificate | null> {
  const { data: existing } = await supabase
    .from('graduation_certificates')
    .select('*')
    .eq('graduation_record_id', params.graduationRecordId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return existing as GraduationCertificate;
  }

  const res = await issueGraduationCertificate({
    graduationRecordId: params.graduationRecordId,
    actorProfileId: params.actorProfileId || null,
    isReissue: false,
    notifyStudent: true,
  });

  return res.data;
}

export async function revokeGraduationCertificate(params: {
  certificate: GraduationCertificate;
  reason: string;
  actorProfileId: string;
}): Promise<{ data: GraduationCertificate | null; error: string | null }> {
  const cleanReason = params.reason.trim();
  if (!cleanReason) {
    return { data: null, error: 'Alasan pembatalan sertifikat wajib diisi.' };
  }

  const { data, error } = await supabase
    .from('graduation_certificates')
    .update({
      certificate_status: 'revoked',
      revoked_at: new Date().toISOString(),
      revocation_reason: cleanReason,
    })
    .eq('id', params.certificate.id)
    .select('*')
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  await sendNotification({
    userId: params.certificate.student_id,
    title: 'Sertifikat Kelulusan Dibatalkan',
    message: `Sertifikat Nomor ${params.certificate.certificate_number} dinyatakan tidak berlaku (Revoked). Alasan: ${cleanReason}`,
    category: 'graduation',
    entityType: 'graduation_certificates',
    entityId: params.certificate.id,
  });

  await logActivity('revoke_graduation_certificate', 'graduation_certificates', params.certificate.id, {
    certificate_number: params.certificate.certificate_number,
    reason: cleanReason,
    revoked_by: params.actorProfileId,
  });

  return { data: data as GraduationCertificate, error: null };
}

export async function getSignedCertificateUrl(
  certificate: GraduationCertificate,
  expiresIn = 3600
): Promise<string | null> {
  return getSignedDocumentUrl(CERTIFICATE_BUCKET, certificate.pdf_storage_path, expiresIn);
}

export async function downloadCertificatePdf(
  certificate: GraduationCertificate
): Promise<{ error: string | null }> {
  const signedUrl = await getSignedCertificateUrl(certificate, 300);
  if (!signedUrl) {
    return { error: 'Gagal membuat Signed URL untuk mengunduh sertifikat PDF.' };
  }

  try {
    const response = await fetch(signedUrl);
    if (!response.ok) {
      return { error: `Gagal mengunduh PDF sertifikat (HTTP ${response.status}).` };
    }
    const blob = await response.blob();
    const pdfBlob = new Blob([blob], { type: 'application/pdf' });
    const objectUrl = URL.createObjectURL(pdfBlob);
    const anchor = document.createElement('a');
    const safeNo = certificate.certificate_number.replace(/[^a-zA-Z0-9_-]/g, '_');
    anchor.href = objectUrl;
    anchor.download = `Sertifikat_Kelulusan_${safeNo}_v${certificate.version}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    return { error: null };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Gagal mengunduh file PDF sertifikat.',
    };
  }
}
