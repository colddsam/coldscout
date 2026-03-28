import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { UserRole, OAuthProvider } from '../hooks/useAuth';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { LogIn, Mail, Github, Chrome } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import Spinner from '../components/ui/Spinner';

/**
 * Social login provider configuration.
 */
const socialProviders: { id: OAuthProvider; name: string; icon: React.ReactNode }[] = [
  { id: 'google', name: 'Google', icon: <Chrome className="w-4 h-4" /> },
  { id: 'github', name: 'GitHub', icon: <Github className="w-4 h-4" /> },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  {
    id: 'linkedin_oidc',
    name: 'LinkedIn',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
];

/**
 * The authentication entry point to the system dashboard.
 *
 * Provides both social login (Google, GitHub, Facebook, LinkedIn) and
 * email/password authentication. Users can select their role (Client or Freelancer)
 * which determines their post-login redirect destination.
 */
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<OAuthProvider | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('freelancer');
  const [error, setError] = useState<string | null>(null);

  const { signInWithPassword, signInWithOAuth, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useSEO({
    title: 'Sign In — Cold Scout',
    description: 'Sign in to your Cold Scout dashboard to manage your AI lead generation pipeline.',
    canonical: 'https://coldscout.colddsam.com/login',
    index: false,
  });

  // The 'from' pathname retains the URL the user tried to visit before being intercepted
  const from = location.state?.from?.pathname;

  // Redirect only after backend user is synced — user.role is the authoritative source
  useEffect(() => {
    if (isAuthenticated && user) {
      const defaultPath = user.role === 'client' ? '/welcome' : '/overview';
      navigate(from || defaultPath, { replace: true });
    }
  }, [isAuthenticated, user, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Do NOT store a pending role here — the user's role is authoritative in the
      // backend DB and must not be overwritten on every login. Role selection only
      // applies during account creation (SignUp page).
      const { error: signInError } = await signInWithPassword(email, password);

      if (signInError) {
        setError(signInError.message || 'Invalid credentials');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: OAuthProvider) => {
    setSocialLoading(provider);
    setError(null);

    try {
      const { error: oauthError } = await signInWithOAuth(provider, selectedRole);

      if (oauthError) {
        setError(oauthError.message || 'Social login failed');
        setSocialLoading(null);
      }
      // Note: On success, the user will be redirected to the OAuth provider
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Social login failed');
      setSocialLoading(null);
    }
  };

  // While authenticated but backend user not yet synced, show a loading screen
  // instead of the login form to prevent a flash before the redirect fires.
  if (isAuthenticated) {
    if (!user) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white">
          <Spinner size="lg" />
        </div>
      );
    }
    return null; // Redirect handled by useEffect above
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-white px-4 sm:px-0 relative overflow-hidden">
      {/* Subtle grid background */}
      <div className="absolute inset-0 bg-grid opacity-40" />

      {/* Decorative gradient orb */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-gradient-to-br from-gray-100 to-gray-200/50 rounded-full blur-3xl opacity-60" />

      <Card className="w-full max-w-md z-10 relative" padding={false}>
        <div className="p-8">
          {/* Logo — links to landing page */}
          <div className="flex justify-center mb-6">
            <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <svg width="36" height="36" viewBox="0 0 40 40" fill="none" aria-hidden="true">
                <rect width="40" height="40" rx="8" fill="black" />
                <path d="M12 20L20 12L28 20L20 28Z" fill="white" />
                <circle cx="20" cy="20" r="4" fill="white" />
              </svg>
              <span className="text-2xl font-bold tracking-tight text-black">Cold Scout</span>
            </Link>
          </div>

          <p className="text-center text-sm text-gray-500 mb-6">Sign in to access your dashboard</p>

          {/* Role Tabs */}
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg mb-6">
            <button
              type="button"
              onClick={() => setSelectedRole('freelancer')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all ${
                selectedRole === 'freelancer'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Freelancer
            </button>
            <button
              type="button"
              onClick={() => setSelectedRole('client')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all ${
                selectedRole === 'client'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Client
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Social Login Buttons */}
          <div className="space-y-2 mb-6">
            {socialProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => handleSocialLogin(provider.id)}
                disabled={socialLoading !== null}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-200 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {socialLoading === provider.id ? (
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                ) : (
                  provider.icon
                )}
                <span>Continue with {provider.name}</span>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-400">or continue with email</span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-md pl-10 pr-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-colors text-sm"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-md px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-colors text-sm"
                placeholder="••••••••"
              />
            </div>

            <Button
              type="submit"
              className="w-full justify-center h-11 text-sm font-medium"
              loading={loading}
              icon={<LogIn className="w-4 h-4" />}
            >
              Sign In
            </Button>
          </form>
        </div>

        <div className="border-t border-gray-100 bg-gray-50/50 p-4 text-center rounded-b-lg">
          <p className="text-sm text-gray-500">
            Don't have an account?{' '}
            <Link to="/signup" className="font-medium text-black hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
