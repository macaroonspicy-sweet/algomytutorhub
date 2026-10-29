import '@/api/base44Client';
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from 'sonner'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { AppAuthProvider, useAppAuth } from '@/lib/AppAuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

// Pages
import Login from '@/pages/Login';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import AdminPage from '@/pages/admin/AdminPage';
import StudentFeedback from '@/pages/StudentFeedback';
import WeeklyFeedback from '@/pages/WeeklyFeedback';
import QCSubmissions from '@/pages/QCSubmissions';
import Tasks from '@/pages/Tasks';
import CoursesCategory from '@/pages/categories/CoursesCategory';

import MyProfile from '@/pages/MyProfile';
import QCMonthlyPage from '@/pages/admin/QCMonthlyPage';
import QCTutor from '@/pages/admin/QCTutor';
import QCEvaluationAspectPage from '@/pages/categories/QCEvaluationAspectPage';
import MyQCEvaluations from '@/pages/MyQCEvaluations';
import ModuleCategoryPage from '@/pages/categories/ModuleCategory';
import StudentPerformanceCategoryPage from '@/pages/categories/StudentPerformanceCategory';
import PdfSettings from '@/pages/categories/PdfSettings';
import UnauthorizedPage from '@/pages/Unauthorized';

function ProtectedAppLayout() {
  const { currentUser, isLoadingAppAuth } = useAppAuth();
  if (isLoadingAppAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }
  if (!currentUser) return <Navigate to="/login" replace />;
  return <Layout />;
}

function RbacRoute({ rbacKey, children }) {
  const { hasPermission } = useAppAuth();
  if (!hasPermission(rbacKey)) return <Navigate to="/unauthorized" replace />;
  return children;
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    else if (authError.type === 'auth_required') { navigateToLogin(); return null; }
  }

  return (
    <AppAuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedAppLayout />}>
          <Route path="/" element={<RbacRoute rbacKey="dashboard"><Dashboard /></RbacRoute>} />
          <Route path="/admin/users" element={<RbacRoute rbacKey="admin_crud"><AdminPage /></RbacRoute>} />
          <Route path="/admin/qc-tutor" element={<RbacRoute rbacKey="qc_records"><QCTutor /></RbacRoute>} />
          <Route path="/admin/qc-monthly" element={<RbacRoute rbacKey="qc_monthly"><QCMonthlyPage /></RbacRoute>} />
          <Route path="/categories/qc-aspects" element={<RbacRoute rbacKey="category_qc"><QCEvaluationAspectPage /></RbacRoute>} />
          <Route path="/student-feedback" element={<RbacRoute rbacKey="student_feedback"><StudentFeedback /></RbacRoute>} />
          <Route path="/weekly-feedback" element={<RbacRoute rbacKey="weekly_feedback"><WeeklyFeedback /></RbacRoute>} />
          <Route path="/qc/submissions" element={<RbacRoute rbacKey="qc_submissions"><QCSubmissions /></RbacRoute>} />
          <Route path="/tasks" element={<RbacRoute rbacKey="task_management"><Tasks /></RbacRoute>} />
          <Route path="/categories/courses" element={<RbacRoute rbacKey="category_courses"><CoursesCategory /></RbacRoute>} />

          <Route path="/categories/module" element={<RbacRoute rbacKey="category_module"><ModuleCategoryPage /></RbacRoute>} />
          <Route path="/categories/student-performance" element={<RbacRoute rbacKey="category_module"><StudentPerformanceCategoryPage /></RbacRoute>} />
          <Route path="/categories/pdf-settings" element={<RbacRoute rbacKey="pdf_settings"><PdfSettings /></RbacRoute>} />
          <Route path="/my-qc" element={<RbacRoute rbacKey="my_qc"><MyQCEvaluations /></RbacRoute>} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/profile" element={<MyProfile />} />
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </AppAuthProvider>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <SonnerToaster position="bottom-right" richColors />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;