import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../hooks/useAuth';
import Spinner from '../components/ui/Spinner';
import Card from '../components/ui/Card';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { getAuthItem, removeAuthItem } from '../lib/authStorage';

/**
 * OAuth callback handler page.
 *
 * This page handles the redirect from Supabase OAuth providers.
 * It extracts the session from the URL hash, syncs the user to
 * the backend, and redirects to the appropriate page based on role.
 *
 * Flow:
 * 1. Supabase Auth redirects here after OAuth success
 * 2. Session is automatically extracted by Supabase client
 * 3. We sync the user to our backend database
 * 4. Redirect to /welcome (clients) or /overview (freelancers)
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const { syncUserToBackend, supabaseUser, session } = useAuth();
  const [status, setStatus] = useState<'loading' | 'syncing' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for Supabase to establish a session
    if (!session || !supabaseUser) return;

    // Guard against double-execution (e.g. token refresh triggering this again)
    if (status !== 'loading') return;

    const handleCallback = async () => {
      setStatus('syncing');

      try {
        // Retrieve the role stored before the OAuth redirect (may be undefined for
        // returning users — the backend will preserve their existing role in that case)
        const pendingRole = (getAuthItem('llp_pending_role') as UserRole | null) || undefined;
        if (pendingRole) removeAuthItem('llp_pending_role');

        // Sync user to backend database
        const backendUser = await syncUserToBackend(pendingRole);

        if (!backendUser) {
          throw new Error('Failed to sync user to backend');
        }

        setStatus('success');

        // Brief delay to show success message, then redirect based on the
        // authoritative role returned by the backend (not Supabase metadata)
        setTimeout(() => {
          const redirectPath = backendUser.role === 'client' ? '/welcome' : '/overview';
          navigate(redirectPath, { replace: true });
        }, 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setStatus('error');
      }
    };

    handleCallback();
  }, [session, supabaseUser, status, navigate, syncUserToBackend]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-white relative overflow-hidden">
      {/* Subtle grid background */}
      <div className="absolute inset-0 bg-grid opacity-40" />

      {/* Decorative gradient orb */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-gradient-to-br from-gray-100 to-gray-200/50 rounded-full blur-3xl opacity-60" />

      <Card className="w-full max-w-sm z-10 relative" padding={false}>
        <div className="p-8 text-center">
          {/* Logo — links to landing page */}
          <div className="flex justify-center mb-6">
            <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <img src="/favicon.svg" alt="Cold Scout" className="h-9 w-9 object-contain" />
              <span className="text-2xl font-bold tracking-tight text-black">Cold Scout</span>
            </Link>
          </div>

          {/* Status Display */}
          {(status === 'loading' || status === 'syncing') && (
            <>
              <div className="flex justify-center mb-4">
                <Spinner size="lg" />
              </div>
              <h2 className="text-lg font-semibold text-black mb-2">
                {status === 'loading' ? 'Completing sign in...' : 'Setting up your account...'}
              </h2>
              <p className="text-sm text-gray-500">
                {status === 'loading'
                  ? 'Please wait while we verify your credentials'
                  : 'Creating your profile in our system'}
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-black mb-2">Sign in successful!</h2>
              <p className="text-sm text-gray-500">Redirecting you to your dashboard...</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-lg font-semibold text-black mb-2">Authentication failed</h2>
              <p className="text-sm text-red-600 mb-4">{error || 'Something went wrong'}</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-2.5 px-4 bg-black text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Back to Login
              </button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
