/**
 * Root Application Component.
 *
 * Orchestrates the global providers (QueryClient, React Router, AuthContext)
 * and defines the primary routing architecture for the Cold Scout dashboard.
 * Includes public-facing pages, OAuth callback handling, and protected dashboard routes.
 *
 * Route Structure:
 * - Public: Landing, Login, SignUp, Docs, Pricing, Legal pages
 * - Auth: OAuth callback handler
 * - Protected (Client): Welcome page
 * - Protected (Freelancer): Full dashboard access
 */
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useState, useEffect } from 'react';

import Shell from './components/layout/Shell';
import SplashScreen from './components/SplashScreen';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import AuthCallback from './pages/AuthCallback';
import Welcome from './pages/Welcome';
import Documentation from './pages/Documentation';
import Pricing from './pages/Pricing';
import Overview from './pages/Overview';
import Pipeline from './pages/Pipeline';
import Scheduler from './pages/Scheduler';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Campaigns from './pages/Campaigns';
import Inbox from './pages/Inbox';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import Threads from './pages/Threads';
import Billing from './pages/Billing';
import NotFound from './pages/NotFound';
import { AuthProvider } from './hooks/useAuth';
import ProtectedRoute, { FreelancerRoute, ClientRoute } from './components/auth/ProtectedRoute';
import SessionExpiredModal from './components/auth/SessionExpiredModal';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import DataDeletion from './pages/DataDeletion.tsx';
import Support from './pages/Support';
import RefundPolicy from './pages/RefundPolicy';
import Profile from './pages/Profile';
import PublicProfile from './pages/PublicProfile';
import LeadDemoViewer from './pages/LeadDemoViewer';
import BookingPage from './pages/BookingPage';

/**
 * Shared QueryClient instance with optimized development defaults.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

import { App as CapacitorApp } from '@capacitor/app';
import { supabase } from './lib/supabase';

function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const subscription = CapacitorApp.addListener('appUrlOpen', async (event) => {
      const url = event.url;
      const domain = 'com.coldscout.app://';
      if (url.startsWith(domain)) {
        // Example: com.coldscout.app://auth/callback?code=... -> /auth/callback?code=...
        const pathWithParams = url.slice(domain.length - 1);

        // For PKCE OAuth flow: extract the authorization code and exchange
        // it for a session. Supabase's detectSessionInUrl won't fire because
        // window.location in the Capacitor WebView doesn't change when the
        // system browser triggers a deep link.
        try {
          const callbackUrl = new URL(url.replace('com.coldscout.app://', 'https://placeholder/'));
          const code = callbackUrl.searchParams.get('code');
          if (code) {
            await supabase.auth.exchangeCodeForSession(code);
          }
        } catch (err) {
          console.error('Deep link code exchange failed:', err);
        }

        navigate(pathWithParams);
      }
    });

    return () => {
      subscription.then((sub) => sub.remove());
    };
  }, [navigate]);

  return null;
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      {!splashDone && <SplashScreen onFinished={() => setSplashDone(true)} />}
      <BrowserRouter>
        <DeepLinkHandler />
        <AuthProvider>
          <SessionExpiredModal />
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/docs" element={<Documentation />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/delete-data" element={<DataDeletion />} />
            <Route path="/support" element={<Support />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            <Route path="/u/:username" element={<PublicProfile />} />
            <Route path="/demo/:leadId" element={<LeadDemoViewer />} />
            <Route path="/book/:username" element={<BookingPage />} />

            {/* Protected: Client Welcome (clients only — freelancers redirected to /overview) */}
            <Route element={<ClientRoute />}>
              <Route path="/welcome" element={<Welcome />} />
            </Route>

            {/* Protected: Freelancer Dashboard (full access) */}
            <Route element={<FreelancerRoute />}>
              <Route element={<Shell />}>
                <Route path="/overview" element={<Overview />} />
                <Route path="/pipeline" element={<Pipeline />} />
                <Route path="/scheduler" element={<Scheduler />} />
                <Route path="/leads" element={<Leads />} />
                <Route path="/leads/:id" element={<LeadDetail />} />
                <Route path="/threads" element={<Threads />} />
                <Route path="/campaigns" element={<Campaigns />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/billing" element={<Billing />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Route>

            {/* Protected: Shared pages (both clients and freelancers) */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Shell />}>
                <Route path="/profile" element={<Profile />} />
              </Route>
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1C1C1C',
            color: '#F0F0F0',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            fontSize: '13px',
            fontFamily: '"Almarai", -apple-system, BlinkMacSystemFont, sans-serif',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          },
          success: {
            iconTheme: { primary: '#FFFFFF', secondary: '#1C1C1C' },
          },
          error: {
            iconTheme: { primary: '#E0E0E0', secondary: '#1C1C1C' },
          },
        }}
      />
    </QueryClientProvider>
  );
}
