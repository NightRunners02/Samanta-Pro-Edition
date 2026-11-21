export type RoleCode = 'super_admin' | 'program_admin' | 'supervisor' | 'examiner' | 'student';

export type AcademicStatus = 'active' | 'leave' | 'graduated' | 'inactive';

export type ThesisStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'revision_required';

export type ThesisStage =
  | 'title_submission'
  | 'supervisor_assignment'
  | 'consultation'
  | 'proposal_seminar'
  | 'defense_registration'
  | 'final_defense'
  | 'final_assessment'
  | 'plagiarism_verification'
  | 'yudisium'
  | 'completed';

export type DocumentCategory =
  | 'proposal'
  | 'chapter_1'
  | 'chapter_2'
  | 'chapter_3'
  | 'chapter_4'
  | 'chapter_5'
  | 'full_thesis'
  | 'research_letter'
  | 'payment_receipt'
  | 'seminar_document'
  | 'defense_document'
  | 'plagiarism_report'
  | 'graduation_document'
  | 'supporting_document';

export type DocumentStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'revision_required';

export type GuidanceStatus =
  | 'requested'
  | 'scheduled'
  | 'completed'
  | 'rejected'
  | 'rescheduled';

export type ChapterStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'needs_revision'
  | 'approved';

export type ExamRegistrationStatus =
  | 'draft'
  | 'submitted'
  | 'verification'
  | 'approved'
  | 'scheduled'
  | 'completed'
  | 'rejected'
  | 'revision_required';

export type PlagiarismStatus =
  | 'not_submitted'
  | 'pending_verification'
  | 'approved'
  | 'rejected'
  | 'revision_required';

export type GraduationStatus =
  | 'incomplete'
  | 'submitted'
  | 'under_verification'
  | 'revision_required'
  | 'approved'
  | 'graduated';

export interface Department {
  id: string;
  code: string;
  name: string;
  dean_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Program {
  id: string;
  department_id: string;
  code: string;
  name: string;
  degree_level: string;
  min_sks: number;
  min_gpa: number;
  max_plagiarism_pct: number;
  max_supervisors: number;
  min_guidance_sessions: number;
  allow_proposed_supervisor: boolean;
  is_active: boolean;
  created_at: string;
  department?: Department;
}

export interface AcademicPeriod {
  id: string;
  code: string;
  name: string;
  academic_year: string;
  semester: 'Ganjil' | 'Genap' | 'Pendek';
  start_date: string;
  end_date: string;
  submission_open: string | null;
  submission_close: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  role_id: string | null;
  role_code: RoleCode;
  full_name: string;
  nim_nip: string | null;
  email: string;
  phone: string | null;
  department_id: string | null;
  program_id: string | null;
  entry_year: number | null;
  semester: number | null;
  gpa: number | null;
  completed_sks: number | null;
  academic_status: AcademicStatus;
  title_prefix: string | null;
  title_suffix: string | null;
  position: string | null;
  research_field: string | null;
  consultation_schedule: string | null;
  max_supervisee_quota: number;
  avatar_url: string | null;
  is_active: boolean;
  notification_prefs: {
    email: boolean;
    realtime: boolean;
    schedule_alerts: boolean;
    review_alerts: boolean;
  };
  privacy_prefs: {
    show_email: boolean;
    show_phone: boolean;
  };
  created_at: string;
  updated_at: string;
  department?: Department | null;
  program?: Program | null;
}

export interface SubmissionRequirement {
  id: string;
  program_id: string | null;
  stage: 'title_submission' | 'seminar_proposal' | 'defense_registration' | 'yudisium';
  title: string;
  description: string | null;
  requirement_type: 'academic' | 'administrative' | 'document' | 'guidance';
  rule_key: string | null;
  rule_value: string | null;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface ThesisSubmission {
  id: string;
  student_id: string;
  program_id: string | null;
  period_id: string | null;
  title: string;
  abstract: string | null;
  background: string;
  problem_statement: string;
  research_objectives: string;
  research_methodology: string;
  research_field: string;
  proposed_supervisor_1: string | null;
  proposed_supervisor_2: string | null;
  proposal_document_id: string | null;
  status: ThesisStatus;
  current_stage: ThesisStage;
  reviewer_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  student?: Profile;
  program?: Program;
  period?: AcademicPeriod;
}

export interface ThesisSupervisor {
  id: string;
  thesis_id: string;
  student_id: string;
  lecturer_id: string;
  supervisor_role: 'primary' | 'secondary';
  assigned_by: string | null;
  status: 'active' | 'replaced' | 'completed';
  notes: string | null;
  assigned_at: string;
  lecturer?: Profile;
  student?: Profile;
  thesis?: ThesisSubmission;
}

export interface ThesisDocument {
  id: string;
  thesis_id: string | null;
  student_id: string;
  category: DocumentCategory;
  title: string;
  file_name: string;
  file_path: string;
  bucket_name: string;
  mime_type: string | null;
  file_size: number;
  version_number: number;
  parent_document_id: string | null;
  is_latest: boolean;
  status: DocumentStatus;
  revision_notes: string | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  student?: Profile;
}

export interface DocumentReview {
  id: string;
  document_id: string;
  reviewer_id: string;
  decision: 'approved' | 'rejected' | 'revision_required' | 'comment';
  comments: string;
  created_at: string;
  reviewer?: Profile;
}

export interface ThesisProgress {
  id: string;
  thesis_id: string;
  student_id: string;
  chapter_number: number;
  chapter_title: string;
  progress_percent: number;
  status: ChapterStatus;
  latest_document_id: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  revision_count: number;
  feedback: string | null;
  updated_at: string;
  latest_document?: ThesisDocument | null;
}

export interface SupervisionSession {
  id: string;
  thesis_id: string;
  student_id: string;
  lecturer_id: string;
  chapter_number: number | null;
  topic: string;
  scheduled_date: string;
  scheduled_time: string;
  alternative_date: string | null;
  alternative_time: string | null;
  student_notes: string | null;
  lecturer_notes: string | null;
  attachment_document_id: string | null;
  status: GuidanceStatus;
  revision_history: Array<{
    timestamp: string;
    actor: string;
    note: string;
    status: string;
  }>;
  created_at: string;
  updated_at: string;
  student?: Profile;
  lecturer?: Profile;
  thesis?: ThesisSubmission;
  attachment?: ThesisDocument | null;
}

export interface SeminarRegistration {
  id: string;
  thesis_id: string;
  student_id: string;
  period_id: string | null;
  proposal_document_id: string | null;
  supporting_document_id: string | null;
  requirements_checklist: Array<{ id: string; title: string; met: boolean }>;
  supervisor_approved: boolean;
  status: ExamRegistrationStatus;
  admin_notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  submitted_at: string | null;
  created_at: string;
  student?: Profile;
  thesis?: ThesisSubmission;
}

export interface DefenseRegistration {
  id: string;
  thesis_id: string;
  student_id: string;
  period_id: string | null;
  full_thesis_document_id: string | null;
  supporting_document_id: string | null;
  requirements_checklist: Array<{ id: string; title: string; met: boolean }>;
  supervisor_1_approved: boolean;
  supervisor_2_approved: boolean;
  status: ExamRegistrationStatus;
  admin_notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  submitted_at: string | null;
  created_at: string;
  student?: Profile;
  thesis?: ThesisSubmission;
}

export interface ExamSchedule {
  id: string;
  thesis_id: string;
  student_id: string;
  exam_type: 'seminar' | 'defense';
  seminar_registration_id: string | null;
  defense_registration_id: string | null;
  exam_date: string;
  start_time: string;
  end_time: string;
  room_name: string;
  meeting_link: string | null;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled' | 'rescheduled';
  notes: string | null;
  created_at: string;
  student?: Profile;
  thesis?: ThesisSubmission;
  examiners?: ExaminerAssignment[];
}

export interface ExaminerAssignment {
  id: string;
  schedule_id: string;
  thesis_id: string;
  lecturer_id: string;
  examiner_role: 'chair' | 'examiner_1' | 'examiner_2' | 'supervisor_1' | 'supervisor_2';
  approval_status: 'pending' | 'approved' | 'revision_required';
  revision_notes: string | null;
  lecturer?: Profile;
}

export interface ExamScore {
  id: string;
  schedule_id: string;
  thesis_id: string;
  examiner_id: string;
  presentation_score: number;
  substance_score: number;
  methodology_score: number;
  results_score: number;
  mastery_score: number;
  revision_score: number;
  weighted_total: number;
  evaluation_notes: string | null;
  revision_notes: string | null;
  is_finalized: boolean;
  created_at: string;
  examiner?: Profile;
}

export interface PlagiarismCheck {
  id: string;
  thesis_id: string;
  student_id: string;
  document_id: string | null;
  supporting_document_id: string | null;
  similarity_percent: number | null;
  max_allowed_percent: number;
  tool_used: string | null;
  status: PlagiarismStatus;
  reviewer_notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  submitted_at: string | null;
  created_at: string;
  student?: Profile;
  thesis?: ThesisSubmission;
  document?: ThesisDocument | null;
}

export interface GraduationRecord {
  id: string;
  thesis_id: string;
  student_id: string;
  period_id: string | null;
  yudisium_period: string | null;
  checklist: Record<string, boolean>;
  final_score: number | null;
  final_grade: string | null;
  status: GraduationStatus;
  graduation_date: string | null;
  certificate_number: string | null;
  admin_notes: string | null;
  validated_at: string | null;
  submitted_at: string | null;
  created_at: string;
  student?: Profile;
  thesis?: ThesisSubmission;
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  category: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  actor_name: string;
  actor_role: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ScoringWeights {
  presentation: number;
  substance: number;
  methodology: number;
  results: number;
  mastery: number;
  revision: number;
}

export interface SystemSettings {
  id: string;
  app_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  active_period_id: string | null;
  max_supervisors: number;
  max_examiners: number;
  default_min_sks: number;
  default_min_gpa: number;
  default_max_plagiarism_pct: number;
  max_upload_mb: number;
  allowed_file_formats: string[];
  scoring_weights: ScoringWeights;
  email_config: {
    sender_name: string;
    sender_email: string;
    smtp_enabled: boolean;
  };
  notification_settings: {
    notify_on_submission: boolean;
    notify_on_schedule: boolean;
    notify_on_grade: boolean;
  };
  maintenance_mode: boolean;
  updated_at: string;
}

export interface LecturerQuotaSummary {
  id: string;
  full_name: string;
  title_prefix: string | null;
  title_suffix: string | null;
  role_code: RoleCode;
  program_name: string | null;
  research_field: string | null;
  consultation_schedule: string | null;
  max_quota: number;
  active_count: number;
  available_quota: number;
  is_available: boolean;
}
