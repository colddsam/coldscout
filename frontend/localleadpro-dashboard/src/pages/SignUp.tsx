import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { UserRole, OAuthProvider } from '../hooks/useAuth';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { UserPlus, Mail, User, Github, Chrome, Check } from 'lucide-react';
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
 * Sign up page for new users.
 *
 * Provides role selection (Client or Freelancer), social sign up options,
 * and email/password registration. Matches the design language of the login page.
 */
export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<OAuthProvider | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('freelancer');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { signUp, signInWithOAuth, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  useSEO({
    title: 'Sign Up — Cold Scout',
    description: 'Create your Cold Scout account to start generating qualified leads with AI.',
    canonical: 'https://coldscout.colddsam.com/signup',
    index: false,
  });

  useEffect(() => {
    if (isAuthenticated && user) {
      const redirectTo = user.role === 'client' ? '/welcome' : '/overview';
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password strength
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const { error: signUpError } = await signUp(email, password, selectedRole, fullName);

      if (signUpError) {
        setError(signUpError.message || 'Sign up failed');
      } else {
        setSuccess(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSignUp = async (provider: OAuthProvider) => {
    setSocialLoading(provider);
    setError(null);

    try {
      const { error: oauthError } = await signInWithOAuth(provider, selectedRole);

      if (oauthError) {
        setError(oauthError.message || 'Social sign up failed');
        setSocialLoading(null);
      }
      // Note: On success, the user will be redirected to the OAuth provider
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Social sign up failed');
      setSocialLoading(null);
    }
  };

  if (isAuthenticated) {
    if (!user) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white">
          <Spinner size="lg" />
        </div>
      );
    }
    return null;
  }

  // Success state - email confirmation required
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-white px-4 sm:px-0 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-40" />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-gradient-to-br from-gray-100 to-gray-200/50 rounded-full blur-3xl opacity-60" />

        <Card className="w-full max-w-md z-10 relative" padding={false}>
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-black mb-2">Check your email</h2>
            <p className="text-sm text-gray-500 mb-6">
              We've sent a confirmation link to <strong>{email}</strong>. Click the link to
              activate your account.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center justify-center w-full py-2.5 px-4 bg-black text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Back to Login
            </Link>
          </div>
        </Card>
      </div>
    );
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

          <p className="text-center text-sm text-gray-500 mb-6">Create your account to get started</p>

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

          {/* Social Sign Up Buttons */}
          <div className="space-y-2 mb-6">
            {socialProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => handleSocialSignUp(provider.id)}
                disabled={socialLoading !== null}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-200 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {socialLoading === provider.id ? (
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                ) : (
                  provider.icon
                )}
                <span>Sign up with {provider.name}</span>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-400">or sign up with email</span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-md pl-10 pr-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-colors text-sm"
                  placeholder="John Doe"
                />
              </div>
            </div>

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

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Confirm Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-md px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-colors text-sm"
                placeholder="••••••••"
              />
            </div>

            <Button
              type="submit"
              className="w-full justify-center h-11 text-sm font-medium"
              loading={loading}
              icon={<UserPlus className="w-4 h-4" />}
            >
              Create Account
            </Button>
          </form>

          <p className="mt-4 text-xs text-center text-gray-400">
            By signing up, you agree to our{' '}
            <Link to="/terms" className="text-gray-600 hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="text-gray-600 hover:underline">
              Privacy Policy
            </Link>
          </p>
        </div>

        <div className="border-t border-gray-100 bg-gray-50/50 p-4 text-center rounded-b-lg">
          <p className="text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-black hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
