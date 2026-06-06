'use client';
/**
 * Next-idiomatic auth guards — the equivalent of the SPA's ProtectedRoute /
 * FreelancerRoute / ClientRoute / SuperuserRoute (which relied on
 * react-router <Outlet>/<Navigate>). Here we redirect via next/navigation and
 * render the children once access is confirmed.
 *
 * Mirrors the original logic exactly:
 *  - while auth is resolving -> loading screen
 *  - unauthenticated -> /login
 *  - Supabase session present but backend user not yet synced -> loading
 *  - role mismatch -> send to the user's correct home (/welcome or /overview)
 *  - superuser-only pages -> non-superusers bounced to their home
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@front/hooks/useAuth';
import Spinner from '@front/components/ui/Spinner';

type Role = 'client' | 'freelancer';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center">
        <Spinner size="lg" />
        <p className="mt-4 text-sm text-[#B0B0B0]">Loading...</p>
      </div>
    </div>
  );
}

export function RequireAuth({
  children,
  roles,
  superuser = false,
}: {
  children: React.ReactNode;
  roles?: Role[];
  superuser?: boolean;
}) {
  const { isAuthenticated, isLoading, userRole, user, session } = useAuth();
  const router = useRouter();

  const effectiveRole: Role = (user?.role as Role) || userRole;
  const blocked =
    (superuser && !!user && !user.is_superuser) ||
    (!!roles && roles.length > 0 && !!user && !roles.includes(effectiveRole));
  const homePath = effectiveRole === 'client' ? '/welcome' : '/overview';

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    // Supabase session exists but backend user not synced yet — wait.
    if (session && !user) return;
    if (blocked) router.replace(homePath);
  }, [isLoading, isAuthenticated, session, user, blocked, homePath, router]);

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <LoadingScreen />;
  if (session && !user) return <LoadingScreen />;
  if (blocked) return <LoadingScreen />;

  return <>{children}</>;
}
