import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { DatabaseSetupView } from './components/DatabaseSetupView';
import { AppShell } from './components/layout/AppShell';
import { AuthPages } from './pages/auth/AuthPages';
import { getNavItemsForRole } from './config/navigation';

// Student Pages
import { StudentDashboard } from './pages/student/StudentDashboard';
import { TitleSubmissionPage } from './pages/student/TitleSubmissionPage';
import { ThesisGuidancePage } from './pages/student/ThesisGuidancePage';
import { ChapterProgressPage } from './pages/student/ChapterProgressPage';
import { DocumentCenterPage } from './pages/student/DocumentCenterPage';
import { SeminarProposalPage } from './pages/student/SeminarProposalPage';
import { DefenseRegistrationPage } from './pages/student/DefenseRegistrationPage';
import { PlagiarismPage } from './pages/student/PlagiarismPage';
import { YudisiumPage } from './pages/student/YudisiumPage';

// Lecturer Pages
import { LecturerDashboard } from './pages/lecturer/LecturerDashboard';
import { SuperviseesPage } from './pages/lecturer/SuperviseesPage';
import { GuidanceManagementPage } from './pages/lecturer/GuidanceManagementPage';
import { ChapterReviewPage } from './pages/lecturer/ChapterReviewPage';
import { ExaminerSchedulePage } from './pages/lecturer/ExaminerSchedulePage';

// Admin Pages
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { StudentManagementPage } from './pages/admin/StudentManagementPage';
import { LecturerManagementPage } from './pages/admin/LecturerManagementPage';
import { AdminManagementPage } from './pages/admin/AdminManagementPage';
import {
  AdminGuidancePage,
  AdminSubmissionsPage,
  DocumentVerificationPage,
  SupervisorAssignmentPage,
} from './pages/admin/AdminOperationsPages';
import {
  AdminDefensePage,
  AdminSeminarPage,
  ExamSchedulingPage,
  ExaminerManagementPage,
} from './pages/admin/ExamSchedulingPage';
import {
  AdminPlagiarismPage,
  GraduationManagementPage,
  ScoreManagementPage,
} from './pages/admin/AssessmentGraduationPages';
import {
  AcademicPeriodPage,
  ProgramManagementPage,
  RequirementsManagementPage,
} from './pages/admin/ConfigurationPages';
import {
  ActivityLogsPage,
  ReportsPage,
  SystemSettingsPage,
} from './pages/admin/ReportsAndAuditPages';

// Shared Pages
import { NotificationsPage } from './pages/shared/NotificationsPage';
import { ProfileSettingsPage } from './pages/shared/ProfileSettingsPage';
import { Loader2 } from 'lucide-react';

function TAFlowRouter() {
  const { user, profile, loading, schemaMissing, isPasswordRecovery, refreshSettings } = useAuth();
  const [activePage, setActivePage] = useState<string>('dashboard');

  const role = profile?.role_code || 'student';

  useEffect(() => {
    if (!profile) return;
    const allowed = getNavItemsForRole(profile.role_code);
    if (!allowed.some((item) => item.id === activePage)) {
      setActivePage('dashboard');
    }
  }, [profile, activePage]);

  if (schemaMissing) {
    return <DatabaseSetupView onRetry={refreshSettings} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-blue-700 dark:text-cyan-400" />
        <p className="text-xs font-medium">Memuat sesi TAFlow...</p>
      </div>
    );
  }

  if (!user || isPasswordRecovery) {
    return <AuthPages />;
  }

  const renderPage = () => {
    // Role-based route guard
    const allowed = getNavItemsForRole(role);
    const safePage = allowed.some((a) => a.id === activePage) ? activePage : 'dashboard';

    switch (safePage) {
      case 'dashboard':
        if (role === 'student') return <StudentDashboard onNavigate={setActivePage} />;
        if (role === 'supervisor' || role === 'examiner')
          return <LecturerDashboard onNavigate={setActivePage} />;
        return <AdminDashboard onNavigate={setActivePage} />;

      // Student
      case 'title-submission':
        return <TitleSubmissionPage />;
      case 'guidance':
        return <ThesisGuidancePage />;
      case 'chapters':
        return <ChapterProgressPage />;
      case 'documents':
        return <DocumentCenterPage />;
      case 'seminar':
        return <SeminarProposalPage />;
      case 'defense':
        return <DefenseRegistrationPage />;
      case 'plagiarism':
        return <PlagiarismPage />;
      case 'yudisium':
        return <YudisiumPage />;

      // Lecturer
      case 'supervisees':
        return <SuperviseesPage />;
      case 'guidance-management':
        return <GuidanceManagementPage />;
      case 'chapter-review':
        return <ChapterReviewPage />;
      case 'examiner-schedule':
        return <ExaminerSchedulePage />;

      // Admin
      case 'students':
        return <StudentManagementPage />;
      case 'lecturers':
        return <LecturerManagementPage />;
      case 'admins':
        return <AdminManagementPage />;
      case 'submissions':
        return <AdminSubmissionsPage />;
      case 'supervisors':
        return <SupervisorAssignmentPage />;
      case 'admin-guidance':
        return <AdminGuidancePage />;
      case 'document-verification':
        return <DocumentVerificationPage />;
      case 'admin-seminar':
        return <AdminSeminarPage />;
      case 'admin-defense':
        return <AdminDefensePage />;
      case 'exam-scheduling':
        return <ExamSchedulingPage />;
      case 'examiners':
        return <ExaminerManagementPage />;
      case 'scores':
        return <ScoreManagementPage />;
      case 'admin-plagiarism':
        return <AdminPlagiarismPage />;
      case 'admin-yudisium':
        return <GraduationManagementPage />;
      case 'academic-periods':
        return <AcademicPeriodPage />;
      case 'programs':
        return <ProgramManagementPage />;
      case 'requirements':
        return <RequirementsManagementPage />;
      case 'reports':
        return <ReportsPage />;
      case 'activity-logs':
        return <ActivityLogsPage />;
      case 'system-settings':
        return <SystemSettingsPage />;

      // Shared
      case 'notifications':
        return <NotificationsPage />;
      case 'profile':
        return <ProfileSettingsPage />;
      default:
        return <StudentDashboard onNavigate={setActivePage} />;
    }
  };

  return (
    <AppShell activePage={activePage} onNavigate={setActivePage}>
      {renderPage()}
    </AppShell>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <TAFlowRouter />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
