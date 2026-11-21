-- ============================================================================
-- TAFlow — 0004_taflow_complete.sql
-- Consolidated, Idempotent Supabase Migration (Schema, RLS, RPC, Triggers, Storage, Realtime & Seed)
-- ============================================================================

-- ============================================================================
-- SECTION 1: EXTENSIONS & CORE UTILITY FUNCTIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- SECTION 2: COMPLETE POSTGRESQL SCHEMA (22 TABLES)
-- ============================================================================

-- 1. roles
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code IN ('super_admin', 'program_admin', 'supervisor', 'examiner', 'student')),
  name TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. departments (Faculties)
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  dean_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. programs (Study Programs / Prodi)
CREATE TABLE IF NOT EXISTS public.programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  degree_level TEXT NOT NULL DEFAULT 'S1' CHECK (degree_level IN ('D3', 'D4', 'S1', 'S2', 'S3')),
  min_sks INTEGER NOT NULL DEFAULT 110 CHECK (min_sks >= 0),
  min_gpa NUMERIC(3,2) NOT NULL DEFAULT 2.75 CHECK (min_gpa >= 0 AND min_gpa <= 4.00),
  max_plagiarism_pct NUMERIC(5,2) NOT NULL DEFAULT 25.00 CHECK (max_plagiarism_pct >= 0 AND max_plagiarism_pct <= 100),
  max_supervisors INTEGER NOT NULL DEFAULT 2 CHECK (max_supervisors BETWEEN 1 AND 3),
  min_guidance_sessions INTEGER NOT NULL DEFAULT 8 CHECK (min_guidance_sessions >= 1),
  allow_proposed_supervisor BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_programs_department ON public.programs(department_id);

-- 4. academic_periods
CREATE TABLE IF NOT EXISTS public.academic_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  semester TEXT NOT NULL CHECK (semester IN ('Ganjil', 'Genap', 'Pendek')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  submission_open DATE,
  submission_close DATE,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_period_dates CHECK (end_date >= start_date)
);

-- 5. profiles (Linked 1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES public.roles(id) ON DELETE SET NULL,
  role_code TEXT NOT NULL DEFAULT 'student' CHECK (role_code IN ('super_admin', 'program_admin', 'supervisor', 'examiner', 'student')),
  full_name TEXT NOT NULL,
  nim_nip TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  entry_year INTEGER,
  semester INTEGER DEFAULT 7,
  gpa NUMERIC(3,2) DEFAULT 0.00 CHECK (gpa >= 0 AND gpa <= 4.00),
  completed_sks INTEGER DEFAULT 0 CHECK (completed_sks >= 0),
  academic_status TEXT NOT NULL DEFAULT 'active' CHECK (academic_status IN ('active', 'leave', 'graduated', 'inactive')),
  title_prefix TEXT,
  title_suffix TEXT,
  position TEXT,
  research_field TEXT,
  consultation_schedule TEXT,
  max_supervisee_quota INTEGER NOT NULL DEFAULT 10 CHECK (max_supervisee_quota >= 0),
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notification_prefs JSONB NOT NULL DEFAULT '{"email": true, "realtime": true, "schedule_alerts": true, "review_alerts": true}'::jsonb,
  privacy_prefs JSONB NOT NULL DEFAULT '{"show_email": true, "show_phone": false}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role_code);
CREATE INDEX IF NOT EXISTS idx_profiles_program ON public.profiles(program_id);
CREATE INDEX IF NOT EXISTS idx_profiles_nim_nip ON public.profiles(nim_nip);

-- 6. submission_requirements (Configurable by Admin per program & stage)
CREATE TABLE IF NOT EXISTS public.submission_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID REFERENCES public.programs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('title_submission', 'seminar_proposal', 'defense_registration', 'yudisium')),
  title TEXT NOT NULL,
  description TEXT,
  requirement_type TEXT NOT NULL DEFAULT 'academic' CHECK (requirement_type IN ('academic', 'administrative', 'document', 'guidance')),
  rule_key TEXT,
  rule_value TEXT,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requirements_stage ON public.submission_requirements(stage, program_id);

-- 7. thesis_submissions
CREATE TABLE IF NOT EXISTS public.thesis_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  period_id UUID REFERENCES public.academic_periods(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  abstract TEXT,
  background TEXT NOT NULL,
  problem_statement TEXT NOT NULL,
  research_objectives TEXT NOT NULL,
  research_methodology TEXT NOT NULL,
  research_field TEXT NOT NULL,
  proposed_supervisor_1 UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  proposed_supervisor_2 UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  proposal_document_id UUID,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'revision_required')),
  current_stage TEXT NOT NULL DEFAULT 'title_submission' CHECK (
    current_stage IN (
      'title_submission',
      'supervisor_assignment',
      'consultation',
      'proposal_seminar',
      'defense_registration',
      'final_defense',
      'final_assessment',
      'plagiarism_verification',
      'yudisium',
      'completed'
    )
  ),
  reviewer_notes TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thesis_student ON public.thesis_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_thesis_program ON public.thesis_submissions(program_id);
CREATE INDEX IF NOT EXISTS idx_thesis_status ON public.thesis_submissions(status);

-- 8. thesis_supervisors
CREATE TABLE IF NOT EXISTS public.thesis_supervisors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES public.thesis_submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lecturer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  supervisor_role TEXT NOT NULL CHECK (supervisor_role IN ('primary', 'secondary')),
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'replaced', 'completed')),
  notes TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (thesis_id, supervisor_role),
  UNIQUE (thesis_id, lecturer_id)
);

CREATE INDEX IF NOT EXISTS idx_supervisors_lecturer ON public.thesis_supervisors(lecturer_id);
CREATE INDEX IF NOT EXISTS idx_supervisors_student ON public.thesis_supervisors(student_id);

-- 9. thesis_documents (Document Center + Version History)
CREATE TABLE IF NOT EXISTS public.thesis_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID REFERENCES public.thesis_submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (
    category IN (
      'proposal',
      'chapter_1',
      'chapter_2',
      'chapter_3',
      'chapter_4',
      'chapter_5',
      'full_thesis',
      'research_letter',
      'payment_receipt',
      'seminar_document',
      'defense_document',
      'plagiarism_report',
      'graduation_document',
      'supporting_document'
    )
  ),
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  bucket_name TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT NOT NULL DEFAULT 0,
  version_number INTEGER NOT NULL DEFAULT 1,
  parent_document_id UUID REFERENCES public.thesis_documents(id) ON DELETE SET NULL,
  is_latest BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'revision_required')),
  revision_notes TEXT,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_student ON public.thesis_documents(student_id);
CREATE INDEX IF NOT EXISTS idx_documents_thesis ON public.thesis_documents(thesis_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON public.thesis_documents(category);

-- 10. document_reviews
CREATE TABLE IF NOT EXISTS public.document_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.thesis_documents(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'revision_required', 'comment')),
  comments TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_reviews_doc ON public.document_reviews(document_id);

-- 11. thesis_progress (Chapters 1 to 5)
CREATE TABLE IF NOT EXISTS public.thesis_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES public.thesis_submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL CHECK (chapter_number BETWEEN 1 AND 5),
  chapter_title TEXT NOT NULL,
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'submitted', 'needs_revision', 'approved')),
  latest_document_id UUID REFERENCES public.thesis_documents(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  revision_count INTEGER NOT NULL DEFAULT 0,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (thesis_id, chapter_number)
);

CREATE INDEX IF NOT EXISTS idx_progress_student ON public.thesis_progress(student_id);

-- 12. supervision_sessions (Thesis Guidance)
CREATE TABLE IF NOT EXISTS public.supervision_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES public.thesis_submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lecturer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chapter_number INTEGER CHECK (chapter_number BETWEEN 1 AND 5),
  topic TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  alternative_date DATE,
  alternative_time TIME,
  student_notes TEXT,
  lecturer_notes TEXT,
  attachment_document_id UUID REFERENCES public.thesis_documents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'scheduled', 'completed', 'rejected', 'rescheduled')),
  revision_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guidance_student ON public.supervision_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_guidance_lecturer ON public.supervision_sessions(lecturer_id);

-- 13. seminar_registrations
CREATE TABLE IF NOT EXISTS public.seminar_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES public.thesis_submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_id UUID REFERENCES public.academic_periods(id) ON DELETE SET NULL,
  proposal_document_id UUID REFERENCES public.thesis_documents(id) ON DELETE SET NULL,
  supporting_document_id UUID REFERENCES public.thesis_documents(id) ON DELETE SET NULL,
  requirements_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  supervisor_approved BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'verification', 'approved', 'scheduled', 'completed', 'rejected', 'revision_required')),
  admin_notes TEXT,
  verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seminar_student ON public.seminar_registrations(student_id);

-- 14. defense_registrations
CREATE TABLE IF NOT EXISTS public.defense_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES public.thesis_submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_id UUID REFERENCES public.academic_periods(id) ON DELETE SET NULL,
  full_thesis_document_id UUID REFERENCES public.thesis_documents(id) ON DELETE SET NULL,
  supporting_document_id UUID REFERENCES public.thesis_documents(id) ON DELETE SET NULL,
  requirements_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  supervisor_1_approved BOOLEAN NOT NULL DEFAULT FALSE,
  supervisor_2_approved BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'verification', 'approved', 'scheduled', 'completed', 'rejected', 'revision_required')),
  admin_notes TEXT,
  verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_defense_student ON public.defense_registrations(student_id);

-- 15. exam_schedules
CREATE TABLE IF NOT EXISTS public.exam_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES public.thesis_submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('seminar', 'defense')),
  seminar_registration_id UUID REFERENCES public.seminar_registrations(id) ON DELETE SET NULL,
  defense_registration_id UUID REFERENCES public.defense_registrations(id) ON DELETE SET NULL,
  exam_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room_name TEXT NOT NULL,
  meeting_link TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'ongoing', 'completed', 'cancelled', 'rescheduled')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_exam_time CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_schedules_date ON public.exam_schedules(exam_date, room_name);
CREATE INDEX IF NOT EXISTS idx_schedules_student ON public.exam_schedules(student_id);

-- 16. examiner_assignments
CREATE TABLE IF NOT EXISTS public.examiner_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.exam_schedules(id) ON DELETE CASCADE,
  thesis_id UUID NOT NULL REFERENCES public.thesis_submissions(id) ON DELETE CASCADE,
  lecturer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  examiner_role TEXT NOT NULL CHECK (examiner_role IN ('chair', 'examiner_1', 'examiner_2', 'supervisor_1', 'supervisor_2')),
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'revision_required')),
  revision_notes TEXT,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (schedule_id, lecturer_id)
);

CREATE INDEX IF NOT EXISTS idx_examiners_lecturer ON public.examiner_assignments(lecturer_id);

-- 17. exam_scores
CREATE TABLE IF NOT EXISTS public.exam_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.exam_schedules(id) ON DELETE CASCADE,
  thesis_id UUID NOT NULL REFERENCES public.thesis_submissions(id) ON DELETE CASCADE,
  examiner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  presentation_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (presentation_score BETWEEN 0 AND 100),
  substance_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (substance_score BETWEEN 0 AND 100),
  methodology_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (methodology_score BETWEEN 0 AND 100),
  results_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (results_score BETWEEN 0 AND 100),
  mastery_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (mastery_score BETWEEN 0 AND 100),
  revision_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (revision_score BETWEEN 0 AND 100),
  weighted_total NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (weighted_total BETWEEN 0 AND 100),
  evaluation_notes TEXT,
  revision_notes TEXT,
  is_finalized BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (schedule_id, examiner_id)
);

CREATE INDEX IF NOT EXISTS idx_scores_thesis ON public.exam_scores(thesis_id);

-- 18. plagiarism_checks
CREATE TABLE IF NOT EXISTS public.plagiarism_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES public.thesis_submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.thesis_documents(id) ON DELETE SET NULL,
  supporting_document_id UUID REFERENCES public.thesis_documents(id) ON DELETE SET NULL,
  similarity_percent NUMERIC(5,2) CHECK (similarity_percent BETWEEN 0 AND 100),
  max_allowed_percent NUMERIC(5,2) NOT NULL DEFAULT 25.00,
  tool_used TEXT DEFAULT 'Manual Verification (Document Upload)',
  status TEXT NOT NULL DEFAULT 'not_submitted' CHECK (status IN ('not_submitted', 'pending_verification', 'approved', 'rejected', 'revision_required')),
  reviewer_notes TEXT,
  verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plagiarism_student ON public.plagiarism_checks(student_id);

-- 19. graduation_records (Yudisium)
CREATE TABLE IF NOT EXISTS public.graduation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES public.thesis_submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_id UUID REFERENCES public.academic_periods(id) ON DELETE SET NULL,
  yudisium_period TEXT,
  checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  final_score NUMERIC(5,2),
  final_grade TEXT,
  status TEXT NOT NULL DEFAULT 'incomplete' CHECK (status IN ('incomplete', 'submitted', 'under_verification', 'revision_required', 'approved', 'graduated')),
  graduation_date DATE,
  certificate_number TEXT,
  admin_notes TEXT,
  validated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graduation_student ON public.graduation_records(student_id);

-- 20. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  entity_type TEXT,
  entity_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);

-- 21. activity_logs (Immutable audit log)
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.activity_logs(user_id);

-- 22. system_settings (Singleton configuration table)
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_name TEXT NOT NULL DEFAULT 'TAFlow',
  logo_url TEXT,
  favicon_url TEXT,
  active_period_id UUID REFERENCES public.academic_periods(id) ON DELETE SET NULL,
  max_supervisors INTEGER NOT NULL DEFAULT 2,
  max_examiners INTEGER NOT NULL DEFAULT 3,
  default_min_sks INTEGER NOT NULL DEFAULT 110,
  default_min_gpa NUMERIC(3,2) NOT NULL DEFAULT 2.75,
  default_max_plagiarism_pct NUMERIC(5,2) NOT NULL DEFAULT 25.00,
  max_upload_mb INTEGER NOT NULL DEFAULT 25,
  allowed_file_formats TEXT[] NOT NULL DEFAULT ARRAY['pdf', 'docx', 'png', 'jpg'],
  scoring_weights JSONB NOT NULL DEFAULT '{"presentation": 15, "substance": 25, "methodology": 20, "results": 20, "mastery": 15, "revision": 5}'::jsonb,
  email_config JSONB NOT NULL DEFAULT '{"sender_name": "TAFlow Academic", "sender_email": "noreply@taflow.ac.id", "smtp_enabled": false}'::jsonb,
  notification_settings JSONB NOT NULL DEFAULT '{"notify_on_submission": true, "notify_on_schedule": true, "notify_on_grade": true}'::jsonb,
  maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Attach updated_at triggers
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'departments', 'programs', 'academic_periods', 'profiles', 'submission_requirements',
    'thesis_submissions', 'thesis_documents', 'thesis_progress', 'supervision_sessions',
    'seminar_registrations', 'defense_registrations', 'exam_schedules', 'exam_scores',
    'plagiarism_checks', 'graduation_records', 'system_settings'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', tbl, tbl);
  END LOOP;
END $$;

-- ============================================================================
-- SECTION 3: HELPER ROLE & CONTEXT FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role_code FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_program_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT program_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'super_admin', FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_program_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() IN ('super_admin', 'program_admin'), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_lecturer()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() IN ('supervisor', 'examiner'), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_supervisor(p_thesis_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.thesis_supervisors
    WHERE thesis_id = p_thesis_id
      AND lecturer_id = auth.uid()
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_examiner(p_thesis_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.examiner_assignments
    WHERE thesis_id = p_thesis_id
      AND lecturer_id = auth.uid()
  );
$$;

-- ============================================================================
-- SECTION 4: AUTH SIGNUP & WORKFLOW PROGRESSION TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_role_id UUID;
  v_department_id UUID;
  v_program_id UUID;
  v_entry_year INTEGER;
  v_full_name TEXT;
  v_nim TEXT;
BEGIN
  SELECT id INTO v_student_role_id FROM public.roles WHERE code = 'student' LIMIT 1;

  v_full_name := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1));
  v_nim := NULLIF(TRIM(NEW.raw_user_meta_data->>'nim_nip'), '');

  BEGIN
    v_department_id := NULLIF(NEW.raw_user_meta_data->>'department_id', '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_department_id := NULL;
  END;

  BEGIN
    v_program_id := NULLIF(NEW.raw_user_meta_data->>'program_id', '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_program_id := NULL;
  END;

  BEGIN
    v_entry_year := NULLIF(NEW.raw_user_meta_data->>'entry_year', '')::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    v_entry_year := EXTRACT(YEAR FROM NOW())::INTEGER;
  END;

  INSERT INTO public.profiles (
    id, role_id, role_code, full_name, nim_nip, email,
    department_id, program_id, entry_year, academic_status, is_active
  ) VALUES (
    NEW.id,
    v_student_role_id,
    'student', -- Hardcoded: registrations NEVER grant admin or lecturer access
    v_full_name,
    v_nim,
    NEW.email,
    v_department_id,
    v_program_id,
    COALESCE(v_entry_year, EXTRACT(YEAR FROM NOW())::INTEGER),
    'active',
    TRUE
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_thesis_approved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_titles TEXT[] := ARRAY[
    'Bab 1 — Pendahuluan',
    'Bab 2 — Tinjauan Pustaka',
    'Bab 3 — Metodologi Penelitian',
    'Bab 4 — Hasil dan Pembahasan',
    'Bab 5 — Kesimpulan'
  ];
  i INTEGER;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    NEW.approved_at := COALESCE(NEW.approved_at, NOW());
    IF NEW.current_stage = 'title_submission' THEN
      NEW.current_stage := 'supervisor_assignment';
    END IF;

    FOR i IN 1..5 LOOP
      INSERT INTO public.thesis_progress (thesis_id, student_id, chapter_number, chapter_title)
      VALUES (NEW.id, NEW.student_id, i, v_titles[i])
      ON CONFLICT (thesis_id, chapter_number) DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_thesis_approved ON public.thesis_submissions;
CREATE TRIGGER trg_thesis_approved
  BEFORE UPDATE ON public.thesis_submissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_thesis_approved();

CREATE OR REPLACE FUNCTION public.handle_supervisor_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.thesis_submissions
  SET current_stage = 'consultation'
  WHERE id = NEW.thesis_id
    AND current_stage IN ('title_submission', 'supervisor_assignment');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supervisor_assigned ON public.thesis_supervisors;
CREATE TRIGGER trg_supervisor_assigned
  AFTER INSERT ON public.thesis_supervisors
  FOR EACH ROW EXECUTE FUNCTION public.handle_supervisor_assigned();

CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role_code IS DISTINCT FROM OLD.role_code OR NEW.role_id IS DISTINCT FROM OLD.role_id THEN
    IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') AND NOT public.is_super_admin() THEN
      IF public.current_user_role() NOT IN ('super_admin', 'program_admin') THEN
        RAISE EXCEPTION 'Direct role modification is prohibited';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_escalation();

-- ============================================================================
-- SECTION 5: SECURE RPC FUNCTIONS
-- ============================================================================

-- Resolve NIM/NIP to email for login without exposing profiles publicly
CREATE OR REPLACE FUNCTION public.login_lookup_email(p_identifier TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF p_identifier LIKE '%@%' THEN
    RETURN LOWER(TRIM(p_identifier));
  END IF;

  SELECT email INTO v_email
  FROM public.profiles
  WHERE LOWER(nim_nip) = LOWER(TRIM(p_identifier))
    AND is_active = TRUE
  LIMIT 1;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.login_lookup_email(TEXT) TO anon, authenticated;

-- Direct student registration RPC (optional/dummy email, zero email rate limit, instant confirmation, always student role)
CREATE OR REPLACE FUNCTION public.register_student_account(
  p_full_name TEXT,
  p_nim TEXT,
  p_password TEXT,
  p_department_id UUID,
  p_program_id UUID,
  p_entry_year INTEGER DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_instance_id UUID;
  v_clean_name TEXT := TRIM(COALESCE(p_full_name, ''));
  v_clean_nim TEXT := TRIM(COALESCE(p_nim, ''));
  v_clean_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_entry_year INTEGER := COALESCE(p_entry_year, EXTRACT(YEAR FROM NOW())::INTEGER);
  v_nim_slug TEXT;
BEGIN
  IF v_clean_name = '' THEN
    RAISE EXCEPTION 'Nama lengkap wajib diisi.';
  END IF;

  IF v_clean_nim = '' THEN
    RAISE EXCEPTION 'NIM wajib diisi.';
  END IF;

  IF LENGTH(COALESCE(p_password, '')) < 8 THEN
    RAISE EXCEPTION 'Kata sandi minimal 8 karakter.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(nim_nip) = LOWER(v_clean_nim)) THEN
    RAISE EXCEPTION 'NIM % sudah terdaftar. Silakan masuk menggunakan NIM Anda.', v_clean_nim;
  END IF;

  IF v_clean_email = '' THEN
    v_nim_slug := LOWER(REGEXP_REPLACE(v_clean_nim, '[^a-zA-Z0-9._-]', '', 'g'));
    IF v_nim_slug = '' THEN
      v_nim_slug := REPLACE(v_user_id::text, '-', '');
    END IF;
    v_clean_email := v_nim_slug || '@taflow.ac.id';
    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_clean_email) THEN
      v_clean_email := v_nim_slug || '.' || SUBSTRING(REPLACE(v_user_id::text, '-', '') FROM 1 FOR 6) || '@taflow.ac.id';
    END IF;
  ELSE
    IF POSITION('@' IN v_clean_email) = 0 THEN
      v_clean_email := REGEXP_REPLACE(v_clean_email, '[^a-zA-Z0-9._-]', '', 'g') || '@taflow.ac.id';
    ELSIF POSITION('.' IN SPLIT_PART(v_clean_email, '@', 2)) = 0 THEN
      v_clean_email := v_clean_email || '.id';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_clean_email)
       OR EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(email) = v_clean_email) THEN
      RAISE EXCEPTION 'Email % sudah terdaftar. Gunakan email lain atau kosongkan kolom email.', v_clean_email;
    END IF;
  END IF;

  SELECT COALESCE((SELECT instance_id FROM auth.users LIMIT 1), '00000000-0000-0000-0000-000000000000'::uuid)
  INTO v_instance_id;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    v_instance_id,
    v_user_id,
    'authenticated',
    'authenticated',
    v_clean_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'full_name', v_clean_name,
      'nim_nip', v_clean_nim,
      'department_id', p_department_id,
      'program_id', p_program_id,
      'entry_year', v_entry_year
    ),
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    v_user_id::text,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_clean_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  RETURN jsonb_build_object(
    'user_id', v_user_id,
    'email', v_clean_email,
    'nim_nip', v_clean_nim
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_student_account(TEXT, TEXT, TEXT, UUID, UUID, INTEGER, TEXT) TO anon, authenticated;

-- Admin-only account creation RPC (optional/dummy email, zero email rate limit, preserves admin session)
CREATE OR REPLACE FUNCTION public.admin_create_user_account(
  p_full_name TEXT,
  p_nim_nip TEXT,
  p_password TEXT,
  p_role_code TEXT DEFAULT 'student',
  p_department_id UUID DEFAULT NULL,
  p_program_id UUID DEFAULT NULL,
  p_entry_year INTEGER DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_semester INTEGER DEFAULT 7,
  p_completed_sks INTEGER DEFAULT 0,
  p_gpa NUMERIC DEFAULT 0.00,
  p_academic_status TEXT DEFAULT 'active',
  p_position TEXT DEFAULT NULL,
  p_research_field TEXT DEFAULT NULL,
  p_max_supervisee_quota INTEGER DEFAULT 10,
  p_consultation_schedule TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller_role TEXT;
  v_user_id UUID := gen_random_uuid();
  v_instance_id UUID;
  v_role_id UUID;
  v_clean_name TEXT := TRIM(COALESCE(p_full_name, ''));
  v_clean_nim_nip TEXT := TRIM(COALESCE(p_nim_nip, ''));
  v_clean_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_slug TEXT;
BEGIN
  v_caller_role := public.current_user_role();
  IF v_caller_role NOT IN ('super_admin', 'program_admin') THEN
    RAISE EXCEPTION 'Unauthorized: hanya administrator yang dapat menambahkan akun.';
  END IF;

  IF v_caller_role = 'program_admin' AND p_role_code IN ('super_admin', 'program_admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin Prodi tidak dapat membuat akun Administrator.';
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE code = p_role_code LIMIT 1;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role tidak valid: %', p_role_code;
  END IF;

  IF v_clean_name = '' OR v_clean_nim_nip = '' THEN
    RAISE EXCEPTION 'Nama lengkap dan NIM/NIP wajib diisi.';
  END IF;

  IF LENGTH(COALESCE(p_password, '')) < 8 THEN
    RAISE EXCEPTION 'Kata sandi minimal 8 karakter.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(nim_nip) = LOWER(v_clean_nim_nip)) THEN
    RAISE EXCEPTION 'NIM / NIP / NIDN % sudah terdaftar.', v_clean_nim_nip;
  END IF;

  IF v_clean_email = '' THEN
    v_slug := LOWER(REGEXP_REPLACE(v_clean_nim_nip, '[^a-zA-Z0-9._-]', '', 'g'));
    IF v_slug = '' THEN
      v_slug := REPLACE(v_user_id::text, '-', '');
    END IF;
    v_clean_email := v_slug || '@taflow.ac.id';
    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_clean_email) THEN
      v_clean_email := v_slug || '.' || SUBSTRING(REPLACE(v_user_id::text, '-', '') FROM 1 FOR 6) || '@taflow.ac.id';
    END IF;
  ELSE
    IF POSITION('@' IN v_clean_email) = 0 THEN
      v_clean_email := REGEXP_REPLACE(v_clean_email, '[^a-zA-Z0-9._-]', '', 'g') || '@taflow.ac.id';
    ELSIF POSITION('.' IN SPLIT_PART(v_clean_email, '@', 2)) = 0 THEN
      v_clean_email := v_clean_email || '.id';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_clean_email)
       OR EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(email) = v_clean_email) THEN
      RAISE EXCEPTION 'Email % sudah terdaftar.', v_clean_email;
    END IF;
  END IF;

  SELECT COALESCE((SELECT instance_id FROM auth.users LIMIT 1), '00000000-0000-0000-0000-000000000000'::uuid)
  INTO v_instance_id;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    v_instance_id,
    v_user_id,
    'authenticated',
    'authenticated',
    v_clean_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'full_name', v_clean_name,
      'nim_nip', v_clean_nim_nip,
      'department_id', p_department_id,
      'program_id', p_program_id,
      'entry_year', COALESCE(p_entry_year, EXTRACT(YEAR FROM NOW())::INTEGER)
    ),
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    v_user_id::text,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_clean_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  UPDATE public.profiles
  SET
    role_code = p_role_code,
    role_id = v_role_id,
    department_id = COALESCE(p_department_id, department_id),
    program_id = COALESCE(p_program_id, program_id),
    semester = COALESCE(p_semester, semester),
    completed_sks = COALESCE(p_completed_sks, completed_sks),
    gpa = COALESCE(p_gpa, gpa),
    academic_status = COALESCE(NULLIF(p_academic_status, ''), academic_status),
    position = p_position,
    research_field = p_research_field,
    max_supervisee_quota = COALESCE(p_max_supervisee_quota, max_supervisee_quota),
    consultation_schedule = p_consultation_schedule
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'user_id', v_user_id,
    'email', v_clean_email,
    'nim_nip', v_clean_nim_nip
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_user_account(TEXT, TEXT, TEXT, TEXT, UUID, UUID, INTEGER, TEXT, INTEGER, INTEGER, NUMERIC, TEXT, TEXT, TEXT, INTEGER, TEXT) TO authenticated;

-- Admin-only email update RPC (syncs auth.users, auth.identities, and public.profiles)
CREATE OR REPLACE FUNCTION public.admin_update_user_email(p_target_user_id UUID, p_new_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller_role TEXT;
  v_caller_program UUID;
  v_target_role TEXT;
  v_target_program UUID;
  v_clean_email TEXT := LOWER(TRIM(COALESCE(p_new_email, '')));
  v_actor_name TEXT;
BEGIN
  v_caller_role := public.current_user_role();
  v_caller_program := public.current_user_program_id();

  IF v_caller_role NOT IN ('super_admin', 'program_admin') THEN
    RAISE EXCEPTION 'Unauthorized: hanya administrator yang dapat mengubah email pengguna.';
  END IF;

  SELECT role_code, program_id INTO v_target_role, v_target_program
  FROM public.profiles
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengguna tidak ditemukan.';
  END IF;

  IF v_caller_role = 'program_admin' THEN
    IF v_target_role IN ('super_admin', 'program_admin') THEN
      RAISE EXCEPTION 'Unauthorized: Admin Prodi tidak dapat mengubah akun Administrator.';
    END IF;
    IF v_caller_program IS NOT NULL AND v_target_program IS NOT NULL AND v_target_program <> v_caller_program THEN
      RAISE EXCEPTION 'Unauthorized: pengguna berada di luar program studi Anda.';
    END IF;
  END IF;

  IF v_clean_email = '' THEN
    RAISE EXCEPTION 'Email tidak boleh kosong.';
  END IF;

  IF POSITION('@' IN v_clean_email) = 0 THEN
    v_clean_email := REGEXP_REPLACE(v_clean_email, '[^a-zA-Z0-9._-]', '', 'g') || '@taflow.ac.id';
  ELSIF POSITION('.' IN SPLIT_PART(v_clean_email, '@', 2)) = 0 THEN
    v_clean_email := v_clean_email || '.id';
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.users WHERE LOWER(email) = v_clean_email AND id <> p_target_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE LOWER(email) = v_clean_email AND id <> p_target_user_id
  ) THEN
    RAISE EXCEPTION 'Email % sudah digunakan oleh akun lain.', v_clean_email;
  END IF;

  UPDATE auth.users
  SET
    email = v_clean_email,
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
  WHERE id = p_target_user_id;

  UPDATE auth.identities
  SET
    identity_data = COALESCE(identity_data, '{}'::jsonb) || jsonb_build_object('email', v_clean_email, 'email_verified', true),
    updated_at = NOW()
  WHERE user_id = p_target_user_id AND provider = 'email';

  UPDATE public.profiles
  SET email = v_clean_email
  WHERE id = p_target_user_id;

  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.activity_logs (user_id, actor_name, actor_role, action, entity, entity_id, metadata)
  VALUES (
    auth.uid(),
    COALESCE(v_actor_name, 'Administrator'),
    v_caller_role,
    'email_updated',
    'profiles',
    p_target_user_id,
    jsonb_build_object('new_email', v_clean_email)
  );

  RETURN v_clean_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_email(UUID, TEXT) TO authenticated;

-- Admin-only role assignment RPC
CREATE OR REPLACE FUNCTION public.admin_update_user_role(p_target_user_id UUID, p_new_role_code TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_role_id UUID;
  v_actor_name TEXT;
BEGIN
  v_caller_role := public.current_user_role();
  IF v_caller_role NOT IN ('super_admin', 'program_admin') THEN
    RAISE EXCEPTION 'Unauthorized: only administrators can change roles';
  END IF;

  IF v_caller_role = 'program_admin' AND p_new_role_code IN ('super_admin', 'program_admin') THEN
    RAISE EXCEPTION 'Unauthorized: Program Admin cannot grant admin roles';
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE code = p_new_role_code;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Invalid role code: %', p_new_role_code;
  END IF;

  UPDATE public.profiles
  SET role_code = p_new_role_code,
      role_id = v_role_id
  WHERE id = p_target_user_id;

  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.activity_logs (user_id, actor_name, actor_role, action, entity, entity_id, metadata)
  VALUES (
    auth.uid(),
    COALESCE(v_actor_name, 'Administrator'),
    v_caller_role,
    'role_updated',
    'profiles',
    p_target_user_id,
    jsonb_build_object('new_role', p_new_role_code)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_role(UUID, TEXT) TO authenticated;

-- Immutable activity logging RPC
CREATE OR REPLACE FUNCTION public.log_user_activity(
  p_action TEXT,
  p_entity TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  v_role TEXT;
BEGIN
  SELECT full_name, role_code INTO v_name, v_role
  FROM public.profiles
  WHERE id = auth.uid();

  INSERT INTO public.activity_logs (user_id, actor_name, actor_role, action, entity, entity_id, metadata)
  VALUES (
    auth.uid(),
    COALESCE(v_name, 'System User'),
    COALESCE(v_role, 'unknown'),
    p_action,
    p_entity,
    p_entity_id,
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_user_activity(TEXT, TEXT, UUID, JSONB) TO authenticated;

-- Exam Schedule Conflict Detection RPC
CREATE OR REPLACE FUNCTION public.check_exam_schedule_conflicts(
  p_exam_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_room_name TEXT,
  p_student_id UUID,
  p_lecturer_ids UUID[],
  p_exclude_schedule_id UUID DEFAULT NULL
)
RETURNS TABLE (
  conflict_type TEXT,
  conflict_detail TEXT,
  schedule_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Room conflict
  RETURN QUERY
  SELECT
    'room_conflict'::TEXT,
    format('Room %s is already booked on %s (%s - %s)', es.room_name, es.exam_date, es.start_time, es.end_time),
    es.id
  FROM public.exam_schedules es
  WHERE es.exam_date = p_exam_date
    AND LOWER(TRIM(es.room_name)) = LOWER(TRIM(p_room_name))
    AND es.status NOT IN ('cancelled')
    AND (p_exclude_schedule_id IS NULL OR es.id <> p_exclude_schedule_id)
    AND (p_start_time < es.end_time AND p_end_time > es.start_time);

  -- 2. Student conflict
  RETURN QUERY
  SELECT
    'student_conflict'::TEXT,
    format('Student already has an exam scheduled on %s (%s - %s)', es.exam_date, es.start_time, es.end_time),
    es.id
  FROM public.exam_schedules es
  WHERE es.exam_date = p_exam_date
    AND es.student_id = p_student_id
    AND es.status NOT IN ('cancelled')
    AND (p_exclude_schedule_id IS NULL OR es.id <> p_exclude_schedule_id)
    AND (p_start_time < es.end_time AND p_end_time > es.start_time);

  -- 3. Lecturer / Examiner conflict
  RETURN QUERY
  SELECT
    'lecturer_conflict'::TEXT,
    format('Lecturer %s already assigned to an overlapping exam (%s - %s)', p.full_name, es.start_time, es.end_time),
    es.id
  FROM public.examiner_assignments ea
  JOIN public.exam_schedules es ON es.id = ea.schedule_id
  JOIN public.profiles p ON p.id = ea.lecturer_id
  WHERE es.exam_date = p_exam_date
    AND ea.lecturer_id = ANY(p_lecturer_ids)
    AND es.status NOT IN ('cancelled')
    AND (p_exclude_schedule_id IS NULL OR es.id <> p_exclude_schedule_id)
    AND (p_start_time < es.end_time AND p_end_time > es.start_time);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_exam_schedule_conflicts(DATE, TIME, TIME, TEXT, UUID, UUID[], UUID) TO authenticated;

-- ============================================================================
-- SECTION 6: ROW LEVEL SECURITY (RLS) ON ALL 22 TABLES (IDEMPOTENT)
-- ============================================================================

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thesis_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thesis_supervisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thesis_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thesis_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervision_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seminar_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defense_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examiner_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plagiarism_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graduation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Reference Tables
DROP POLICY IF EXISTS "roles_read_all" ON public.roles;
CREATE POLICY "roles_read_all" ON public.roles FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "roles_super_admin_write" ON public.roles;
CREATE POLICY "roles_super_admin_write" ON public.roles FOR ALL USING (public.is_super_admin());

DROP POLICY IF EXISTS "departments_read_all" ON public.departments;
CREATE POLICY "departments_read_all" ON public.departments FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "departments_super_admin_write" ON public.departments;
CREATE POLICY "departments_super_admin_write" ON public.departments FOR ALL USING (public.is_program_admin());

DROP POLICY IF EXISTS "programs_read_all" ON public.programs;
CREATE POLICY "programs_read_all" ON public.programs FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "programs_admin_write" ON public.programs;
CREATE POLICY "programs_admin_write" ON public.programs FOR ALL USING (public.is_program_admin());

DROP POLICY IF EXISTS "periods_read_all" ON public.academic_periods;
CREATE POLICY "periods_read_all" ON public.academic_periods FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "periods_admin_write" ON public.academic_periods;
CREATE POLICY "periods_admin_write" ON public.academic_periods FOR ALL USING (public.is_program_admin());

DROP POLICY IF EXISTS "settings_read_all" ON public.system_settings;
CREATE POLICY "settings_read_all" ON public.system_settings FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "settings_admin_write" ON public.system_settings;
CREATE POLICY "settings_admin_write" ON public.system_settings FOR ALL USING (public.is_super_admin());

DROP POLICY IF EXISTS "requirements_read_all" ON public.submission_requirements;
CREATE POLICY "requirements_read_all" ON public.submission_requirements FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "requirements_admin_write" ON public.submission_requirements;
CREATE POLICY "requirements_admin_write" ON public.submission_requirements FOR ALL USING (
  public.is_super_admin() OR (public.is_program_admin() AND (program_id IS NULL OR program_id = public.current_user_program_id()))
);

-- Profiles RLS
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles FOR SELECT USING (
  id = auth.uid()
  OR public.is_super_admin()
  OR (public.is_program_admin() AND (program_id = public.current_user_program_id() OR role_code IN ('supervisor', 'examiner')))
  OR role_code IN ('supervisor', 'examiner')
  OR EXISTS (
    SELECT 1 FROM public.thesis_supervisors ts
    WHERE ts.student_id = profiles.id AND ts.lecturer_id = auth.uid() AND ts.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.examiner_assignments ea
    JOIN public.thesis_submissions t ON t.id = ea.thesis_id
    WHERE t.student_id = profiles.id AND ea.lecturer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (
  id = auth.uid()
  OR public.is_super_admin()
  OR (
    public.is_program_admin()
    AND role_code IN ('student', 'supervisor', 'examiner')
    AND (program_id IS NULL OR program_id = public.current_user_program_id())
  )
) WITH CHECK (
  id = auth.uid()
  OR public.is_super_admin()
  OR (
    public.is_program_admin()
    AND role_code IN ('student', 'supervisor', 'examiner')
    AND (program_id IS NULL OR program_id = public.current_user_program_id())
  )
);

DROP POLICY IF EXISTS "profiles_insert_admin" ON public.profiles;
CREATE POLICY "profiles_insert_admin" ON public.profiles FOR INSERT WITH CHECK (
  public.is_super_admin() OR public.is_program_admin()
);

-- Thesis Submissions RLS
DROP POLICY IF EXISTS "thesis_select" ON public.thesis_submissions;
CREATE POLICY "thesis_select" ON public.thesis_submissions FOR SELECT USING (
  student_id = auth.uid()
  OR public.is_super_admin()
  OR (public.is_program_admin() AND program_id = public.current_user_program_id())
  OR public.is_assigned_supervisor(id)
  OR public.is_assigned_examiner(id)
  OR proposed_supervisor_1 = auth.uid()
  OR proposed_supervisor_2 = auth.uid()
);

DROP POLICY IF EXISTS "thesis_insert_student" ON public.thesis_submissions;
CREATE POLICY "thesis_insert_student" ON public.thesis_submissions FOR INSERT WITH CHECK (
  student_id = auth.uid() OR public.is_program_admin()
);

DROP POLICY IF EXISTS "thesis_update" ON public.thesis_submissions;
CREATE POLICY "thesis_update" ON public.thesis_submissions FOR UPDATE USING (
  (student_id = auth.uid() AND status IN ('draft', 'submitted', 'revision_required'))
  OR public.is_super_admin()
  OR (public.is_program_admin() AND program_id = public.current_user_program_id())
  OR public.is_assigned_supervisor(id)
  OR proposed_supervisor_1 = auth.uid()
);

DROP POLICY IF EXISTS "thesis_delete" ON public.thesis_submissions;
CREATE POLICY "thesis_delete" ON public.thesis_submissions FOR DELETE USING (
  (student_id = auth.uid() AND status = 'draft') OR public.is_super_admin()
);

-- Thesis Supervisors RLS
DROP POLICY IF EXISTS "supervisors_select" ON public.thesis_supervisors;
CREATE POLICY "supervisors_select" ON public.thesis_supervisors FOR SELECT USING (
  student_id = auth.uid()
  OR lecturer_id = auth.uid()
  OR public.is_super_admin()
  OR public.is_program_admin()
);

DROP POLICY IF EXISTS "supervisors_admin_write" ON public.thesis_supervisors;
CREATE POLICY "supervisors_admin_write" ON public.thesis_supervisors FOR ALL USING (
  public.is_program_admin()
);

-- Thesis Documents RLS
DROP POLICY IF EXISTS "documents_select" ON public.thesis_documents;
CREATE POLICY "documents_select" ON public.thesis_documents FOR SELECT USING (
  student_id = auth.uid()
  OR uploaded_by = auth.uid()
  OR public.is_super_admin()
  OR public.is_program_admin()
  OR (thesis_id IS NOT NULL AND (public.is_assigned_supervisor(thesis_id) OR public.is_assigned_examiner(thesis_id)))
);

DROP POLICY IF EXISTS "documents_insert" ON public.thesis_documents;
CREATE POLICY "documents_insert" ON public.thesis_documents FOR INSERT WITH CHECK (
  student_id = auth.uid() OR uploaded_by = auth.uid() OR public.is_program_admin()
);

DROP POLICY IF EXISTS "documents_update" ON public.thesis_documents;
CREATE POLICY "documents_update" ON public.thesis_documents FOR UPDATE USING (
  student_id = auth.uid()
  OR public.is_program_admin()
  OR (thesis_id IS NOT NULL AND public.is_assigned_supervisor(thesis_id))
);

DROP POLICY IF EXISTS "documents_delete" ON public.thesis_documents;
CREATE POLICY "documents_delete" ON public.thesis_documents FOR DELETE USING (
  (student_id = auth.uid() AND status IN ('pending', 'revision_required'))
  OR public.is_program_admin()
);

-- Document Reviews RLS
DROP POLICY IF EXISTS "doc_reviews_select" ON public.document_reviews;
CREATE POLICY "doc_reviews_select" ON public.document_reviews FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.thesis_documents td
    WHERE td.id = document_id
      AND (
        td.student_id = auth.uid()
        OR public.is_program_admin()
        OR (td.thesis_id IS NOT NULL AND (public.is_assigned_supervisor(td.thesis_id) OR public.is_assigned_examiner(td.thesis_id)))
      )
  )
);

DROP POLICY IF EXISTS "doc_reviews_insert" ON public.document_reviews;
CREATE POLICY "doc_reviews_insert" ON public.document_reviews FOR INSERT WITH CHECK (
  reviewer_id = auth.uid() AND (public.is_program_admin() OR public.is_lecturer())
);

-- Thesis Progress (Chapters) RLS
DROP POLICY IF EXISTS "progress_select" ON public.thesis_progress;
CREATE POLICY "progress_select" ON public.thesis_progress FOR SELECT USING (
  student_id = auth.uid()
  OR public.is_program_admin()
  OR public.is_assigned_supervisor(thesis_id)
  OR public.is_assigned_examiner(thesis_id)
);

DROP POLICY IF EXISTS "progress_write" ON public.thesis_progress;
CREATE POLICY "progress_write" ON public.thesis_progress FOR ALL USING (
  student_id = auth.uid()
  OR public.is_program_admin()
  OR public.is_assigned_supervisor(thesis_id)
);

-- Supervision Sessions (Guidance) RLS
DROP POLICY IF EXISTS "guidance_select" ON public.supervision_sessions;
CREATE POLICY "guidance_select" ON public.supervision_sessions FOR SELECT USING (
  student_id = auth.uid()
  OR lecturer_id = auth.uid()
  OR public.is_program_admin()
);

DROP POLICY IF EXISTS "guidance_insert" ON public.supervision_sessions;
CREATE POLICY "guidance_insert" ON public.supervision_sessions FOR INSERT WITH CHECK (
  student_id = auth.uid() OR lecturer_id = auth.uid() OR public.is_program_admin()
);

DROP POLICY IF EXISTS "guidance_update" ON public.supervision_sessions;
CREATE POLICY "guidance_update" ON public.supervision_sessions FOR UPDATE USING (
  student_id = auth.uid() OR lecturer_id = auth.uid() OR public.is_program_admin()
);

-- Seminar Registrations RLS
DROP POLICY IF EXISTS "seminar_select" ON public.seminar_registrations;
CREATE POLICY "seminar_select" ON public.seminar_registrations FOR SELECT USING (
  student_id = auth.uid()
  OR public.is_program_admin()
  OR public.is_assigned_supervisor(thesis_id)
  OR public.is_assigned_examiner(thesis_id)
);

DROP POLICY IF EXISTS "seminar_write" ON public.seminar_registrations;
CREATE POLICY "seminar_write" ON public.seminar_registrations FOR ALL USING (
  student_id = auth.uid()
  OR public.is_program_admin()
  OR public.is_assigned_supervisor(thesis_id)
);

-- Defense Registrations RLS
DROP POLICY IF EXISTS "defense_select" ON public.defense_registrations;
CREATE POLICY "defense_select" ON public.defense_registrations FOR SELECT USING (
  student_id = auth.uid()
  OR public.is_program_admin()
  OR public.is_assigned_supervisor(thesis_id)
  OR public.is_assigned_examiner(thesis_id)
);

DROP POLICY IF EXISTS "defense_write" ON public.defense_registrations;
CREATE POLICY "defense_write" ON public.defense_registrations FOR ALL USING (
  student_id = auth.uid()
  OR public.is_program_admin()
  OR public.is_assigned_supervisor(thesis_id)
);

-- Exam Schedules & Examiners RLS
DROP POLICY IF EXISTS "schedules_select" ON public.exam_schedules;
CREATE POLICY "schedules_select" ON public.exam_schedules FOR SELECT USING (
  student_id = auth.uid()
  OR public.is_program_admin()
  OR public.is_assigned_supervisor(thesis_id)
  OR public.is_assigned_examiner(thesis_id)
);

DROP POLICY IF EXISTS "schedules_admin_write" ON public.exam_schedules;
CREATE POLICY "schedules_admin_write" ON public.exam_schedules FOR ALL USING (
  public.is_program_admin()
);

DROP POLICY IF EXISTS "examiners_select" ON public.examiner_assignments;
CREATE POLICY "examiners_select" ON public.examiner_assignments FOR SELECT USING (
  lecturer_id = auth.uid()
  OR public.is_program_admin()
  OR EXISTS (SELECT 1 FROM public.thesis_submissions t WHERE t.id = thesis_id AND t.student_id = auth.uid())
);

DROP POLICY IF EXISTS "examiners_write" ON public.examiner_assignments;
CREATE POLICY "examiners_write" ON public.examiner_assignments FOR ALL USING (
  public.is_program_admin() OR lecturer_id = auth.uid()
);

-- Exam Scores RLS (Students can view their scores, NEVER modify them)
DROP POLICY IF EXISTS "scores_select" ON public.exam_scores;
CREATE POLICY "scores_select" ON public.exam_scores FOR SELECT USING (
  examiner_id = auth.uid()
  OR public.is_program_admin()
  OR EXISTS (SELECT 1 FROM public.thesis_submissions t WHERE t.id = thesis_id AND t.student_id = auth.uid())
  OR public.is_assigned_supervisor(thesis_id)
);

DROP POLICY IF EXISTS "scores_insert_examiner" ON public.exam_scores;
CREATE POLICY "scores_insert_examiner" ON public.exam_scores FOR INSERT WITH CHECK (
  (examiner_id = auth.uid() AND public.is_assigned_examiner(thesis_id))
  OR public.is_program_admin()
);

DROP POLICY IF EXISTS "scores_update_examiner" ON public.exam_scores;
CREATE POLICY "scores_update_examiner" ON public.exam_scores FOR UPDATE USING (
  (examiner_id = auth.uid() AND public.is_assigned_examiner(thesis_id))
  OR public.is_program_admin()
);

-- Plagiarism Checks RLS
DROP POLICY IF EXISTS "plagiarism_select" ON public.plagiarism_checks;
CREATE POLICY "plagiarism_select" ON public.plagiarism_checks FOR SELECT USING (
  student_id = auth.uid()
  OR public.is_program_admin()
  OR public.is_assigned_supervisor(thesis_id)
);

DROP POLICY IF EXISTS "plagiarism_insert_student" ON public.plagiarism_checks;
CREATE POLICY "plagiarism_insert_student" ON public.plagiarism_checks FOR INSERT WITH CHECK (
  student_id = auth.uid() OR public.is_program_admin()
);

DROP POLICY IF EXISTS "plagiarism_update" ON public.plagiarism_checks;
CREATE POLICY "plagiarism_update" ON public.plagiarism_checks FOR UPDATE USING (
  (student_id = auth.uid() AND status IN ('not_submitted', 'revision_required', 'rejected'))
  OR public.is_program_admin()
);

-- Graduation / Yudisium RLS
DROP POLICY IF EXISTS "graduation_select" ON public.graduation_records;
CREATE POLICY "graduation_select" ON public.graduation_records FOR SELECT USING (
  student_id = auth.uid()
  OR public.is_program_admin()
  OR public.is_assigned_supervisor(thesis_id)
);

DROP POLICY IF EXISTS "graduation_insert_student" ON public.graduation_records;
CREATE POLICY "graduation_insert_student" ON public.graduation_records FOR INSERT WITH CHECK (
  student_id = auth.uid() OR public.is_program_admin()
);

DROP POLICY IF EXISTS "graduation_update" ON public.graduation_records;
CREATE POLICY "graduation_update" ON public.graduation_records FOR UPDATE USING (
  (student_id = auth.uid() AND status IN ('incomplete', 'revision_required'))
  OR public.is_program_admin()
);

-- Notifications RLS
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_insert_auth" ON public.notifications;
CREATE POLICY "notifications_insert_auth" ON public.notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Activity Logs RLS (Immutable: read-only for admins & own logs, insert via RPC)
DROP POLICY IF EXISTS "activity_logs_select" ON public.activity_logs;
CREATE POLICY "activity_logs_select" ON public.activity_logs FOR SELECT USING (
  user_id = auth.uid() OR public.is_program_admin()
);

DROP POLICY IF EXISTS "activity_logs_insert" ON public.activity_logs;
CREATE POLICY "activity_logs_insert" ON public.activity_logs FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

-- ============================================================================
-- SECTION 6B: POSTGRESQL TABLE, SCHEMA & SEQUENCE GRANTS (REQUIRED FOR SUPABASE)
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Publicly readable reference & configuration tables (RLS still enforced)
GRANT SELECT ON
  public.roles,
  public.departments,
  public.programs,
  public.academic_periods,
  public.submission_requirements,
  public.system_settings
TO anon, authenticated;

-- Authenticated read/write permissions (RLS enforces strict per-user & role access)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.roles,
  public.departments,
  public.programs,
  public.academic_periods,
  public.submission_requirements,
  public.system_settings,
  public.profiles,
  public.thesis_submissions,
  public.thesis_supervisors,
  public.thesis_documents,
  public.document_reviews,
  public.thesis_progress,
  public.supervision_sessions,
  public.seminar_registrations,
  public.defense_registrations,
  public.exam_schedules,
  public.examiner_assignments,
  public.exam_scores,
  public.plagiarism_checks,
  public.graduation_records,
  public.notifications
TO authenticated;

-- Activity logs remain immutable (append-only for authenticated)
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- ============================================================================
-- SECTION 7: PRIVATE STORAGE BUCKETS & STORAGE RLS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', FALSE),
  ('thesis-documents', 'thesis-documents', FALSE),
  ('thesis-proposals', 'thesis-proposals', FALSE),
  ('seminar-documents', 'seminar-documents', FALSE),
  ('defense-documents', 'defense-documents', FALSE),
  ('plagiarism-documents', 'plagiarism-documents', FALSE),
  ('graduation-documents', 'graduation-documents', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "storage_authenticated_upload" ON storage.objects;
CREATE POLICY "storage_authenticated_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN (
    'avatars', 'thesis-documents', 'thesis-proposals',
    'seminar-documents', 'defense-documents', 'plagiarism-documents', 'graduation-documents'
  )
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_program_admin()
  )
);

DROP POLICY IF EXISTS "storage_authenticated_read" ON storage.objects;
CREATE POLICY "storage_authenticated_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id IN (
    'avatars', 'thesis-documents', 'thesis-proposals',
    'seminar-documents', 'defense-documents', 'plagiarism-documents', 'graduation-documents'
  )
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_program_admin()
    OR public.is_lecturer()
    OR bucket_id = 'avatars'
  )
);

DROP POLICY IF EXISTS "storage_authenticated_update" ON storage.objects;
CREATE POLICY "storage_authenticated_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  (storage.foldername(name))[1] = auth.uid()::text
  OR public.is_program_admin()
);

DROP POLICY IF EXISTS "storage_authenticated_delete" ON storage.objects;
CREATE POLICY "storage_authenticated_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  (storage.foldername(name))[1] = auth.uid()::text
  OR public.is_program_admin()
);

-- ============================================================================
-- SECTION 8: SUPABASE REALTIME PUBLICATION
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'profiles',
    'academic_periods',
    'departments',
    'programs',
    'submission_requirements',
    'thesis_submissions',
    'thesis_supervisors',
    'thesis_progress',
    'supervision_sessions',
    'thesis_documents',
    'seminar_registrations',
    'defense_registrations',
    'exam_schedules',
    'exam_scores',
    'plagiarism_checks',
    'graduation_records',
    'notifications'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', tbl);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- SECTION 9: STRUCTURAL SEED DATA (ROLES, FACULTIES, PROGRAMS, PERIOD, SETTINGS)
-- ============================================================================

INSERT INTO public.roles (code, name, description, permissions) VALUES
  ('super_admin', 'Super Admin', 'Full institutional system administration across all faculties and programs.', '["*"]'::jsonb),
  ('program_admin', 'Admin Program Studi', 'Manages students, lecturers, submissions, scheduling, scoring, plagiarism, and yudisium for assigned program.', '["program.*"]'::jsonb),
  ('supervisor', 'Dosen Pembimbing', 'Supervises assigned students, reviews titles/chapters, conducts guidance sessions, approves seminar/defense.', '["supervision.*"]'::jsonb),
  ('examiner', 'Dosen Penguji', 'Evaluates scheduled seminars and final defenses, submits rubric scores and revision notes.', '["examination.*"]'::jsonb),
  ('student', 'Mahasiswa', 'Submits thesis title, uploads chapters/documents, attends guidance, registers for seminar, defense, and yudisium.', '["thesis.*"]'::jsonb)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.departments (code, name, dean_name) VALUES
  ('FT', 'Fakultas Teknik', 'Prof. Dr. Ir. Hendra Kusuma, M.T.'),
  ('FEB', 'Fakultas Ekonomi dan Bisnis', 'Dr. Ratna Sari Dewi, M.Si.'),
  ('FISIP', 'Fakultas Ilmu Sosial dan Ilmu Politik', 'Dr. Ahmad Fauzi, M.Si.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.programs (department_id, code, name, degree_level, min_sks, min_gpa, max_plagiarism_pct, max_supervisors, min_guidance_sessions)
SELECT id, 'IF', 'Informatika', 'S1', 110, 2.75, 25.00, 2, 8 FROM public.departments WHERE code = 'FT'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.programs (department_id, code, name, degree_level, min_sks, min_gpa, max_plagiarism_pct, max_supervisors, min_guidance_sessions)
SELECT id, 'SI', 'Sistem Informasi', 'S1', 110, 2.75, 25.00, 2, 8 FROM public.departments WHERE code = 'FT'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.programs (department_id, code, name, degree_level, min_sks, min_gpa, max_plagiarism_pct, max_supervisors, min_guidance_sessions)
SELECT id, 'MJ', 'Manajemen', 'S1', 114, 2.75, 20.00, 2, 8 FROM public.departments WHERE code = 'FEB'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.programs (department_id, code, name, degree_level, min_sks, min_gpa, max_plagiarism_pct, max_supervisors, min_guidance_sessions)
SELECT id, 'AK', 'Akuntansi', 'S1', 114, 2.80, 20.00, 2, 8 FROM public.departments WHERE code = 'FEB'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.programs (department_id, code, name, degree_level, min_sks, min_gpa, max_plagiarism_pct, max_supervisors, min_guidance_sessions)
SELECT id, 'IK', 'Ilmu Komunikasi', 'S1', 110, 2.75, 25.00, 2, 8 FROM public.departments WHERE code = 'FISIP'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.programs (department_id, code, name, degree_level, min_sks, min_gpa, max_plagiarism_pct, max_supervisors, min_guidance_sessions)
SELECT id, 'HI', 'Hubungan Internasional', 'S1', 110, 2.80, 25.00, 2, 8 FROM public.departments WHERE code = 'FISIP'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.academic_periods (code, name, academic_year, semester, start_date, end_date, submission_open, submission_close, is_active)
VALUES
  ('2026-1', 'Semester Ganjil 2026/2027', '2026/2027', 'Ganjil', '2026-09-01', '2027-01-31', '2026-09-01', '2026-12-31', TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.system_settings (app_name, active_period_id, max_supervisors, max_examiners, default_min_sks, default_min_gpa, default_max_plagiarism_pct, max_upload_mb)
SELECT 'TAFlow', id, 2, 3, 110, 2.75, 25.00, 25
FROM public.academic_periods WHERE code = '2026-1'
AND NOT EXISTS (SELECT 1 FROM public.system_settings);

-- Default configurable submission requirements
INSERT INTO public.submission_requirements (program_id, stage, title, description, requirement_type, rule_key, rule_value, is_required, sort_order)
SELECT NULL, 'title_submission', 'Status Mahasiswa Aktif', 'Mahasiswa terdaftar aktif pada semester berjalan.', 'academic', 'active_status', 'active', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM public.submission_requirements WHERE stage = 'title_submission' AND rule_key = 'active_status');

INSERT INTO public.submission_requirements (program_id, stage, title, description, requirement_type, rule_key, rule_value, is_required, sort_order)
SELECT NULL, 'title_submission', 'Minimum SKS Lulus', 'Telah menempuh dan lulus minimal SKS sesuai ketentuan program studi.', 'academic', 'min_sks', '110', TRUE, 2
WHERE NOT EXISTS (SELECT 1 FROM public.submission_requirements WHERE stage = 'title_submission' AND rule_key = 'min_sks');

INSERT INTO public.submission_requirements (program_id, stage, title, description, requirement_type, rule_key, rule_value, is_required, sort_order)
SELECT NULL, 'title_submission', 'Minimum IPK', 'Memenuhi batas minimal Indeks Prestasi Kumulatif (IPK).', 'academic', 'min_gpa', '2.75', TRUE, 3
WHERE NOT EXISTS (SELECT 1 FROM public.submission_requirements WHERE stage = 'title_submission' AND rule_key = 'min_gpa');

INSERT INTO public.submission_requirements (program_id, stage, title, description, requirement_type, rule_key, rule_value, is_required, sort_order)
SELECT NULL, 'title_submission', 'Lulus Mata Kuliah Metodologi Penelitian', 'Telah menyelesaikan mata kuliah wajib Metodologi Penelitian.', 'academic', 'mandatory_course', 'Metodologi Penelitian', TRUE, 4
WHERE NOT EXISTS (SELECT 1 FROM public.submission_requirements WHERE stage = 'title_submission' AND rule_key = 'mandatory_course');

INSERT INTO public.submission_requirements (program_id, stage, title, description, requirement_type, rule_key, rule_value, is_required, sort_order)
SELECT NULL, 'defense_registration', 'Seluruh Bab 1 - 5 Disetujui', 'Seluruh bab tugas akhir telah diverifikasi dan disetujui oleh dosen pembimbing.', 'document', 'chapters_approved', '5', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM public.submission_requirements WHERE stage = 'defense_registration' AND rule_key = 'chapters_approved');

INSERT INTO public.submission_requirements (program_id, stage, title, description, requirement_type, rule_key, rule_value, is_required, sort_order)
SELECT NULL, 'defense_registration', 'Kuota Bimbingan Terpenuhi', 'Minimal 8 sesi bimbingan berstatus selesai.', 'guidance', 'min_guidance', '8', TRUE, 2
WHERE NOT EXISTS (SELECT 1 FROM public.submission_requirements WHERE stage = 'defense_registration' AND rule_key = 'min_guidance');

INSERT INTO public.submission_requirements (program_id, stage, title, description, requirement_type, rule_key, rule_value, is_required, sort_order)
SELECT NULL, 'defense_registration', 'Persetujuan Pembimbing', 'Dosen Pembimbing 1 dan Pembimbing 2 telah memberikan persetujuan sidang.', 'academic', 'supervisor_approval', 'true', TRUE, 3
WHERE NOT EXISTS (SELECT 1 FROM public.submission_requirements WHERE stage = 'defense_registration' AND rule_key = 'supervisor_approval');
