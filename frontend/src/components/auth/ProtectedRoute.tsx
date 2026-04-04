/**
 * Authentication Guard Component.
 *
 * Protects dashboard routes from unauthorized access.
 * Implements role-based routing:
 * - Clients are redirected to /welcome
 * - Freelancers can access the full dashboard
 *
 * Redirects unauthenticated users to the login page and displays a loading spinner
 * while the initial authentication state is being resolved.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Spinner from '../ui/Spinner';

interface ProtectedRouteProps {
  /** Optional: Restrict access to specific roles */
  allowedRoles?: ('client' | 'freelancer')[];
  /** Optional: Custom redirect path for unauthorized users */
  redirectTo?: string;
}

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-white">
    <div className="text-center">
      <Spinner size="lg" />
      <p className="mt-4 text-sm text-gray-500">Loading...</p>
    </div>
  </div>
);

export default function ProtectedRoute({
  allowedRoles,
  redirectTo = '/login',
}: ProtectedRouteProps = {}) {
  const { isAuthenticated, isLoading, userRole, user, session } = useAuth();
  const location = useLocation();

  // Show loading spinner while initial auth state is being resolved
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Redirect unauthenticated users to login
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // If a Supabase session is active but the backend user hasn't been synced yet,
  // show a spinner instead of the wrong page. The auto-sync in useAuth will
  // populate `user` with the authoritative role from the backend.
  if (session && !user) {
    return <LoadingScreen />;
  }

  // Use backend user role as the authority; fall back to Supabase metadata role
  const effectiveRole = user?.role || userRole;

  // Check role-based access if specific roles are required
  if (allowedRoles && allowedRoles.length > 0) {
    if (!allowedRoles.includes(effectiveRole)) {
      const defaultPath = effectiveRole === 'client' ? '/welcome' : '/overview';
      return <Navigate to={defaultPath} replace />;
    }
  }

  return <Outlet />;
}

/**
 * Wrapper for routes that should only be accessible to freelancers.
 * Clients attempting to access these routes will be redirected to /welcome.
 */
export function FreelancerRoute() {
  return <ProtectedRoute allowedRoles={['freelancer']} />;
}

/**
 * Wrapper for routes that should only be accessible to clients.
 * Freelancers attempting to access these routes will be redirected to /overview.
 */
export function ClientRoute() {
  return <ProtectedRoute allowedRoles={['client']} />;
}
