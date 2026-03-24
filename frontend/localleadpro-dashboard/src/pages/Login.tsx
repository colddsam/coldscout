import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { LogIn } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';

/**
 * The authentication entry point to the system dashboard.
 *
 * It provides a secure login form that calls out to the backend API (`/api/v1/login/access-token`).
 * Upon successful authentication, it acquires a JWT token and immediately redirects
 * the user back to their securely requested destination (or the Overview page by default).
 *
 * State bounds: Once a JWT is successfully saved via the `useAuth` hook, the user
 * is effectively bound to the session across all browser windows.
 */
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useSEO({
    title: 'Sign In — Cold Scout',
    description: 'Sign in to your Cold Scout dashboard to manage your AI lead generation pipeline.',
    canonical: 'https://coldscout.colddsam.com/login',
    index: false,
  });

  // The 'from' object retains the URL path the user tried to visit before being intercepted
  const from = location.state?.from?.pathname || '/overview';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

      // Authenticates the user by acquiring a JWT access token via the OAuth2 compatible endpoint.
      // In local dev, VITE_API_BASE_URL hits the proxy. In production, it hits the live backend directly.
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/login/access-token`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-API-Key': import.meta.env.VITE_API_KEY || ''
        },
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Invalid credentials');
      }

      const data = await res.json();
      login(data.access_token, data.user);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) return null; // Prevent flash of login while redirecting

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-white px-4 sm:px-0 relative overflow-hidden">
      {/* Subtle grid background */}
      <div className="absolute inset-0 bg-grid opacity-40" />
      
      {/* Decorative gradient orb */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-gradient-to-br from-gray-100 to-gray-200/50 rounded-full blur-3xl opacity-60" />

      <Card className="w-full max-w-md z-10 relative" padding={false}>
        <div className="p-8">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-3">
              <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
                <rect width="40" height="40" rx="8" fill="black" />
                <path d="M12 20L20 12L28 20L20 28Z" fill="#A4DBD9" />
                <circle cx="20" cy="20" r="4" fill="white" />
              </svg>
              <span className="text-2xl font-bold tracking-tight text-black">
                Cold Scout
              </span>
            </div>
          </div>

          <p className="text-center text-sm text-gray-500 mb-6">Sign in to access your dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-md px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-colors text-sm"
                placeholder="admin@example.com"
              />
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
          <p className="text-xs text-gray-400">Authorized Personnel Only</p>
        </div>
      </Card>
    </div>
  );
}
