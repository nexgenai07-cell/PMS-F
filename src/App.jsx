// src/App.jsx
console.log("APP IS LOADING");

import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import ProfilePage from "./components/shared/ProfilePage";

import LeadTaskDetail from "./components/lead/LeadTaskDetail";
import SupervisorTaskDetail from "./components/supervisor/SupervisorTaskDetail";
import TeamMembersPage from './components/shared/TeamMembersPage';

// AUTH
import Login from "./components/auth/Login";
import Register from './components/auth/Register';
import EmailVerification from "./components/auth/EmailVerification";

// SUPERVISOR
import SupervisorLayout from "./components/supervisor/SupervisorLayout";
import SupervisorDashboard from "./components/supervisor/SupervisorDashboard";
import SupervisorProjects from "./components/supervisor/SupervisorProjects";
import SupervisorProjectDetail from "./components/supervisor/SupervisorProjectDetail";
import SupervisorTeams from "./components/supervisor/SupervisorTeams";
import SupervisorNotifications from "./components/supervisor/SupervisorNotifications";
import SupervisorLeads from './components/supervisor/SupervisorLeads';

// LEAD
import LeadLayout from "./components/lead/LeadLayout";
import LeadDashboard from "./components/lead/LeadDashboard";
import LeadProjects from "./components/lead/LeadProjects";
import ProjectDetail from "./components/lead/ProjectDetail";
import LeadTeamMembers from "./components/lead/LeadTeamMembers";
import LeadNotifications from "./components/lead/LeadNotifications";

// Role mapping: Backend role -> Frontend route
const ROLE_TO_ROUTE = {
  'admin': '/supervisor',
  'manager': '/supervisor',
  'supervisor': '/supervisor',
  'member': '/lead',
  'lead': '/lead',
};

// Get route for a given role
const getRouteForRole = (role) => {
  if (!role) return '/lead';
  const normalizedRole = role.toLowerCase();
  return ROLE_TO_ROUTE[normalizedRole] || '/lead';
};

function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  console.log('🔵 ProtectedRoute: rendering');
  console.log('🔵 ProtectedRoute: user =', user);
  console.log('🔵 ProtectedRoute: loading =', loading);

  if (loading) {
    console.log('🔵 ProtectedRoute: still loading...');
    return <PageLoader />;
  }
  
  if (!user) {
    console.log('🔵 ProtectedRoute: ❌ no user, redirecting to login');
    // Clear localStorage if no user
    localStorage.removeItem('access_token');
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('pms_user');
    return <Navigate to="/login" replace />;
  }

  // ✅ Get user role - handle both id and u_id
  const userRole = user?.role?.toLowerCase() || 'member';
  const requiredRole = role?.toLowerCase() || 'member';

  console.log('🔵 ProtectedRoute: user role =', userRole);
  console.log('🔵 ProtectedRoute: required role =', requiredRole);

  const userRoute = ROLE_TO_ROUTE[userRole] || '/lead';
  const requiredRoute = ROLE_TO_ROUTE[requiredRole] || '/lead';

  console.log('🔵 ProtectedRoute: user route =', userRoute);
  console.log('🔵 ProtectedRoute: required route =', requiredRoute);

  if (userRoute !== requiredRoute) {
    console.log(`🔵 ProtectedRoute: ❌ role mismatch, redirecting to ${userRoute}`);
    return <Navigate to={userRoute} replace />;
  }

  console.log('🔵 ProtectedRoute: ✅ Access granted!');
  return children;
}

function PageLoader() {
  return (
    <div style={{
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg-primary)",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 48,
          height: 48,
          border: "3px solid var(--border-default)",
          borderTopColor: "var(--accent-primary)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          margin: "0 auto 16px",
        }} />
        <p style={{
          color: "var(--text-muted)",
          fontSize: 14,
          fontFamily: "var(--font-display)",
        }}>
          Loading AEEL-PMS...
        </p>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  console.log('🔵 AppRoutes: user =', user);
  console.log('🔵 AppRoutes: loading =', loading);

  if (loading) {
    return <PageLoader />;
  }

  const getRedirectPath = () => {
    if (!user) return '/login';
    return getRouteForRole(user?.role);
  };

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to={getRedirectPath()} replace /> : <Login />}
      />

      <Route
        path="/register"
        element={user ? <Navigate to={getRedirectPath()} replace /> : <Register />}
      />

      <Route path="/verify-email" element={<EmailVerification />} />

      {/* SUPERVISOR - handles 'manager', 'supervisor', and 'admin' roles */}
      <Route
        path="/supervisor"
        element={
          <ProtectedRoute role="supervisor">
            <SupervisorLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<SupervisorDashboard />} />
        <Route path="projects" element={<SupervisorProjects />} />
        <Route path="projects/:id" element={<SupervisorProjectDetail />} />
        <Route path="projects/:id/tasks/:taskId" element={<SupervisorTaskDetail />} />
        <Route path="teams" element={<SupervisorTeams />} />
        <Route path="/supervisor/members" element={<TeamMembersPage />} />
        <Route path="notifications" element={<SupervisorNotifications />} />
        <Route path="leads" element={<SupervisorLeads />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      {/* LEAD - handles 'member' and 'lead' roles */}
      <Route
        path="/lead"
        element={
          <ProtectedRoute role="lead">
            <LeadLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<LeadDashboard />} />
        <Route path="projects" element={<LeadProjects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="projects/:id/tasks/:taskId" element={<LeadTaskDetail />} />
        <Route path="team-members" element={<LeadTeamMembers />} />
        <Route path="/lead/members" element={<TeamMembersPage />} />
        <Route path="notifications" element={<LeadNotifications />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      {/* ROOT */}
      <Route path="/" element={<Navigate to={getRedirectPath()} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster position="top-right" />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}