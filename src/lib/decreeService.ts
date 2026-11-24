import { generateOfficialDecreePdf } from './decreePdf';
import { logActivity, sendNotification, supabase } from './supabase';
import type {
  AcademicPeriod,
  DecreePersonSnapshot,
  DecreeType,
  DefenseRegistration,
  Department,
  ExamSchedule,
  ExaminerAssignment,
  OfficialDecree,
  OfficialDecreeSnapshot,
  Profile,
  Program,
  SystemSettings,
  ThesisSubmission,
  ThesisSupervisor,
} from '../types/database';

export function formatLecturerAcademicName(lecturer?: Partial<Profile> | null): string {
  if (!lecturer?.full_name) return 'Dosen Terdaftar';
  return [lecturer.title_prefix, lecturer.full_name, lecturer.title_suffix]
    .filter((v) => Boolean(v && v.trim()))
    .join(' ');
}

export function isSupervisorDecreeEligible(
  thesis: ThesisSubmission | null,
  supervisors: ThesisSupervisor[]
): boolean {
  return Boolean(
    thesis &&
      thesis.status === 'approved' &&
      supervisors.some((s) => s.thesis_id === thesis.id && s.status === 'active')
  );
}

export function isExaminerDecreeEligible(
  thesis: ThesisSubmission | null,
  defenseReg: DefenseRegistration | null,
  defenseSchedule: ExamSchedule | null,
  examiners: ExaminerAssignment[]
): boolean {
  if (!thesis || thesis.status !== 'approved') return false;
  if (!defenseSchedule || defenseSchedule.exam_type !== 'defense' || defenseSchedule.status === 'cancelled') {
    return false;
  }
  const hasExaminers = examiners.some((e) => e.schedule_id === defenseSchedule.id);
  if (!hasExaminers) return false;
  if (!defenseReg) return true;
  return ['approved', 'scheduled', 'completed'].includes(defenseReg.status);
}

export function buildSupervisorAssignmentHash(
  thesis: ThesisSubmission,
  supervisors: ThesisSupervisor[]
): string {
  const activeSorted = supervisors
    .filter((s) => s.thesis_id === thesis.id && s.status === 'active')
    .sort((a, b) => a.supervisor_role.localeCompare(b.supervisor_role) || a.lecturer_id.localeCompare(b.lecturer_id))
    .map((s) => `${s.supervisor_role}:${s.lecturer_id}`)
    .join('|');
  return `${thesis.title.trim()}::${activeSorted}`;
}

export function buildExaminerAssignmentHash(
  thesis: ThesisSubmission,
  schedule: ExamSchedule,
  examiners: ExaminerAssignment[]
): string {
  const sortedEx = examiners
    .filter((e) => e.schedule_id === schedule.id)
    .sort((a, b) => a.examiner_role.localeCompare(b.examiner_role) || a.lecturer_id.localeCompare(b.lecturer_id))
    .map((e) => `${e.examiner_role}:${e.lecturer_id}`)
    .join('|');
  return `${thesis.title.trim()}::${schedule.exam_date}::${schedule.start_time}::${schedule.room_name}::${sortedEx}`;
}

export function buildDefaultLetterNumber(params: {
  decreeType: DecreeType;
  programCode?: string | null;
  issuedDate?: string;
  thesisId: string;
  versionNumber: number;
}): string {
  const year = (params.issuedDate || new Date().toISOString().slice(0, 10)).slice(0, 4);
  const code = (params.programCode || 'TA').toUpperCase();
  const shortSeq = params.thesisId.replace(/-/g, '').slice(0, 4).toUpperCase();
  const prefix = params.decreeType === 'sk_pembimbing' ? 'SK-PEMB' : 'SK-PENG';
  return params.versionNumber > 1
    ? `${shortSeq}/${prefix}/${code}/${year}/V${params.versionNumber}`
    : `${shortSeq}/${prefix}/${code}/${year}`;
}

function mapExaminerRoleLabel(role: ExaminerAssignment['examiner_role']): string {
  switch (role) {
    case 'chair':
      return 'Ketua Dewan Penguji';
    case 'examiner_1':
      return 'Anggota Penguji I';
    case 'examiner_2':
      return 'Anggota Penguji II';
    case 'supervisor_1':
      return 'Pembimbing I';
    case 'supervisor_2':
      return 'Pembimbing II';
    default:
      return 'Anggota Penguji';
  }
}

export interface IssueDecreeOptions {
  thesisId: string;
  decreeType: DecreeType;
  actorProfileId?: string | null;
  isAdminAction?: boolean;
  customLetterNumber?: string;
  customIssuedDate?: string;
  customIssuerName?: string;
  customIssuerTitle?: string;
  customIssuerNip?: string | null;
  notifyStudent?: boolean;
}

export async function issueOfficialDecree(
  options: IssueDecreeOptions
): Promise<{ data: OfficialDecree | null; error: string | null }> {
  const {
    thesisId,
    decreeType,
    actorProfileId = null,
    isAdminAction = false,
    customLetterNumber,
    customIssuedDate,
    customIssuerName,
    customIssuerTitle,
    customIssuerNip,
    notifyStudent = true,
  } = options;

  // 1. Load complete contextual records from Supabase
  const [{ data: thesisRaw, error: thError }, { data: settingsRaw }, { data: existingVersions }] =
    await Promise.all([
      supabase
        .from('thesis_submissions')
        .select(
          '*, student:profiles!thesis_submissions_student_id_fkey(*, program:programs(*, department:departments(*)), department:departments(*)), program:programs(*, department:departments(*)), period:academic_periods(*)'
        )
        .eq('id', thesisId)
        .single(),
      supabase.from('system_settings').select('*').limit(1).maybeSingle(),
      supabase
        .from('official_decrees')
        .select('*')
        .eq('thesis_id', thesisId)
        .eq('decree_type', decreeType)
        .order('version_number', { ascending: false }),
    ]);

  if (thError || !thesisRaw) {
    return { data: null, error: thError?.message || 'Data Tugas Akhir tidak ditemukan.' };
  }

  const thesis = thesisRaw as ThesisSubmission & {
    student?: Profile & { program?: Program & { department?: Department }; department?: Department };
    program?: Program & { department?: Department };
    period?: AcademicPeriod;
  };
  const student = thesis.student;
  if (!student) {
    return { data: null, error: 'Profil mahasiswa tidak ditemukan.' };
  }

  const settings = (settingsRaw as SystemSettings | null) || null;
  const program = thesis.program || student.program || null;
  const department = program?.department || student.department || null;

  let period = thesis.period || null;
  if (!period) {
    const { data: activePer } = await supabase
      .from('academic_periods')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    period = (activePer as AcademicPeriod | null) || null;
  }

  const versions = (existingVersions || []) as OfficialDecree[];
  const nextVersion = versions.length > 0 ? Math.max(...versions.map((v) => v.version_number)) + 1 : 1;

  if (!isAdminAction && versions.length > 0) {
    return {
      data: versions[0],
      error: 'Perubahan data penugasan harus melalui proses penerbitan ulang oleh admin.',
    };
  }

  // 2. Validate workflow requirements & build snapshot
  let assignmentHash = '';
  const snapshot: OfficialDecreeSnapshot = {
    student_name: student.full_name,
    student_nim: student.nim_nip || '-',
    thesis_title: thesis.title,
    period_name: period?.name || 'Periode Akademik Berjalan',
    academic_year: period?.academic_year || String(new Date().getFullYear()),
    faculty_code: department?.code || 'FAK',
    program_degree: program?.degree_level || 'S1',
  };

  if (decreeType === 'sk_pembimbing') {
    const { data: supData } = await supabase
      .from('thesis_supervisors')
      .select('*, lecturer:profiles!thesis_supervisors_lecturer_id_fkey(*)')
      .eq('thesis_id', thesisId)
      .eq('status', 'active')
      .order('supervisor_role');

    const supervisors = (supData || []) as ThesisSupervisor[];
    if (!isSupervisorDecreeEligible(thesis, supervisors)) {
      return {
        data: null,
        error: 'SK Pembimbing belum memenuhi syarat (Judul harus Approved dan Dosen Pembimbing ditetapkan).',
      };
    }

    assignmentHash = buildSupervisorAssignmentHash(thesis, supervisors);
    snapshot.supervisors = supervisors.map(
      (s): DecreePersonSnapshot => ({
        lecturer_id: s.lecturer_id,
        full_name: formatLecturerAcademicName(s.lecturer),
        nim_nip: s.lecturer?.nim_nip || null,
        role_label: s.supervisor_role === 'primary' ? 'Pembimbing I (Utama)' : 'Pembimbing II',
        position: s.lecturer?.position || null,
        research_field: s.lecturer?.research_field || null,
      })
    );
  } else {
    const [{ data: defRegRaw }, { data: defSchedRaw }] = await Promise.all([
      supabase
        .from('defense_registrations')
        .select('*')
        .eq('thesis_id', thesisId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('exam_schedules')
        .select('*, examiners:examiner_assignments(*, lecturer:profiles!examiner_assignments_lecturer_id_fkey(*))')
        .eq('thesis_id', thesisId)
        .eq('exam_type', 'defense')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const defenseReg = (defRegRaw as DefenseRegistration | null) || null;
    const defenseSchedule = (defSchedRaw as (ExamSchedule & { examiners?: ExaminerAssignment[] }) | null) || null;
    const examiners = (defenseSchedule?.examiners || []) as ExaminerAssignment[];

    if (!isExaminerDecreeEligible(thesis, defenseReg, defenseSchedule, examiners) || !defenseSchedule) {
      return {
        data: null,
        error: 'SK Penguji belum memenuhi syarat (Dosen Penguji sidang harus ditetapkan dan disetujui admin).',
      };
    }

    const roleOrder: Record<ExaminerAssignment['examiner_role'], number> = {
      chair: 1,
      examiner_1: 2,
      examiner_2: 3,
      supervisor_1: 4,
      supervisor_2: 5,
    };

    const sortedExaminers = [...examiners].sort(
      (a, b) => (roleOrder[a.examiner_role] || 9) - (roleOrder[b.examiner_role] || 9)
    );

    assignmentHash = buildExaminerAssignmentHash(thesis, defenseSchedule, sortedExaminers);
    snapshot.exam_date = defenseSchedule.exam_date;
    snapshot.exam_time = `${defenseSchedule.start_time.slice(0, 5)} – ${defenseSchedule.end_time.slice(0, 5)}`;
    snapshot.room_name = defenseSchedule.room_name;
    snapshot.examiners = sortedExaminers.map(
      (ex): DecreePersonSnapshot => ({
        lecturer_id: ex.lecturer_id,
        full_name: formatLecturerAcademicName(ex.lecturer),
        nim_nip: ex.lecturer?.nim_nip || null,
        role_label: mapExaminerRoleLabel(ex.examiner_role),
        position: ex.lecturer?.position || null,
        research_field: ex.lecturer?.research_field || null,
      })
    );
  }

  // 3. Prepare formal decree metadata & generate valid A4 PDF Blob
  const issuedDate = customIssuedDate || new Date().toISOString().slice(0, 10);
  const institutionName = settings?.app_name?.trim() || 'TAFlow Academic';
  const facultyName = department?.name || 'Fakultas Akademik';
  const programName = program?.name || 'Program Studi';
  const letterNumber =
    customLetterNumber?.trim() ||
    buildDefaultLetterNumber({
      decreeType,
      programCode: program?.code,
      issuedDate,
      thesisId,
      versionNumber: nextVersion,
    });

  let actorProfile: Profile | null = null;
  if (actorProfileId) {
    const { data: ap } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', actorProfileId)
      .maybeSingle();
    actorProfile = (ap as Profile | null) || null;
  }

  const issuerName =
    customIssuerName?.trim() ||
    department?.dean_name ||
    (actorProfile ? formatLecturerAcademicName(actorProfile) : 'Dekan Fakultas');
  const issuerTitle = customIssuerTitle?.trim() || `Dekan ${facultyName}`;
  const issuerNip = customIssuerNip !== undefined ? customIssuerNip : actorProfile?.nim_nip || null;

  const verificationCode = `${thesis.id.slice(0, 4)}-${decreeType === 'sk_pembimbing' ? 'PB' : 'PG'}-V${nextVersion}`.toUpperCase();

  const pdfBlob = generateOfficialDecreePdf({
    decreeType,
    letterNumber,
    issuedDate,
    issuerName,
    issuerTitle,
    issuerNip,
    institutionName,
    facultyName,
    programName,
    contactEmail: settings?.email_config?.sender_email || null,
    versionNumber: nextVersion,
    snapshot,
    verificationCode,
  });

  // 4. Upload to private Supabase Storage bucket 'official-decrees'
  const safeNim = (student.nim_nip || student.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, '_');
  const labelPrefix = decreeType === 'sk_pembimbing' ? 'SK_Pembimbing' : 'SK_Penguji';
  const fileName = `${labelPrefix}_${safeNim}_v${nextVersion}.pdf`;
  const filePath = `${student.id}/${decreeType}/${Date.now()}_v${nextVersion}_${fileName}`;
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  const { error: uploadError } = await supabase.storage
    .from('official-decrees')
    .upload(filePath, pdfFile, {
      cacheControl: '3600',
      upsert: false,
      contentType: 'application/pdf',
    });

  if (uploadError) {
    return { data: null, error: uploadError.message };
  }

  // 5. Mark older versions non-latest (only possible when admin reissues)
  if (nextVersion > 1) {
    const { error: updatePrevErr } = await supabase
      .from('official_decrees')
      .update({ is_latest: false, needs_reissue: false })
      .eq('thesis_id', thesisId)
      .eq('decree_type', decreeType)
      .eq('is_latest', true);

    if (updatePrevErr) {
      return { data: null, error: updatePrevErr.message };
    }
  }

  // 6. Insert permanent Official Decree record
  const { data: inserted, error: insertError } = await supabase
    .from('official_decrees')
    .insert({
      thesis_id: thesisId,
      student_id: student.id,
      decree_type: decreeType,
      letter_number: letterNumber,
      issued_date: issuedDate,
      issued_by: actorProfileId,
      issuer_name: issuerName,
      issuer_title: issuerTitle,
      issuer_nip: issuerNip,
      institution_name: institutionName,
      faculty_name: facultyName,
      program_name: programName,
      version_number: nextVersion,
      is_latest: true,
      needs_reissue: false,
      assignment_hash: assignmentHash,
      snapshot_data: snapshot,
      bucket_name: 'official-decrees',
      file_path: filePath,
      file_name: fileName,
      file_size: pdfFile.size,
    })
    .select('*')
    .single();

  if (insertError) {
    return { data: null, error: insertError.message };
  }

  if (notifyStudent) {
    const docLabel = decreeType === 'sk_pembimbing' ? 'SK Pembimbing' : 'SK Penguji';
    await sendNotification({
      userId: student.id,
      title: `${docLabel} ${nextVersion > 1 ? `(v${nextVersion}) ` : ''}Tersedia`,
      message: `${docLabel} Nomor ${letterNumber} telah diterbitkan dan tersedia di section Berkas Pendukung pada Dashboard Mahasiswa.`,
      category: 'document',
      entityType: 'official_decrees',
      entityId: inserted.id,
    });
  }

  if (isAdminAction) {
    await logActivity(
      nextVersion > 1 ? `reissue_${decreeType}` : `issue_${decreeType}`,
      'official_decrees',
      inserted.id,
      {
        letter_number: letterNumber,
        version_number: nextVersion,
        thesis_id: thesisId,
      }
    );
  }

  return { data: inserted as OfficialDecree, error: null };
}

export async function ensureInitialDecreeIfEligible(params: {
  thesisId: string;
  decreeType: DecreeType;
  actorProfileId?: string | null;
  isAdminAction?: boolean;
}): Promise<OfficialDecree | null> {
  const { data: existing } = await supabase
    .from('official_decrees')
    .select('*')
    .eq('thesis_id', params.thesisId)
    .eq('decree_type', params.decreeType)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return existing as OfficialDecree;
  }

  const res = await issueOfficialDecree({
    thesisId: params.thesisId,
    decreeType: params.decreeType,
    actorProfileId: params.actorProfileId || null,
    isAdminAction: params.isAdminAction ?? false,
    notifyStudent: params.isAdminAction ?? false,
  });

  return res.data;
}

export async function downloadDecreePdf(decree: OfficialDecree): Promise<{ error: string | null }> {
  const { data: blob, error } = await supabase.storage
    .from(decree.bucket_name || 'official-decrees')
    .download(decree.file_path);

  if (error || !blob) {
    return { error: error?.message || 'Gagal mengunduh file PDF dari penyimpanan aman.' };
  }

  const pdfBlob = new Blob([blob], { type: 'application/pdf' });
  const objectUrl = URL.createObjectURL(pdfBlob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = decree.file_name?.endsWith('.pdf') ? decree.file_name : `${decree.file_name || 'SK_Resmi'}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  return { error: null };
}
