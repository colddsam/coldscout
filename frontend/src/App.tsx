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
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useState, useEffect, lazy, Suspense } from 'react';

import Shell from './components/layout/Shell';
import SplashScreen from './components/SplashScreen';
import UpdateBanner from './components/UpdateBanner';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import AuthCallback from './pages/AuthCallback';
import NotFound from './pages/NotFound';
import { AuthProvider } from './hooks/useAuth';
import ProtectedRoute, { FreelancerRoute, ClientRoute } from './components/auth/ProtectedRoute';
import SessionExpiredModal from './components/auth/SessionExpiredModal';

// ── Lazy-loaded routes ──────────────────────────────────────────────
// Splitting heavy pages out of the critical path keeps the marketing-page
// JS budget tiny — Landing/Login/SignUp ship as the only eager bundle.
// Each lazy route resolves in its own chunk, so users only pay for what
// they actually navigate to.
const Welcome = lazy(() => import('./pages/Welcome'));
const Documentation = lazy(() => import('./pages/Documentation'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Overview = lazy(() => import('./pages/Overview'));
const Pipeline = lazy(() => import('./pages/Pipeline'));
const Scheduler = lazy(() => import('./pages/Scheduler'));
const Leads = lazy(() => import('./pages/Leads'));
const LeadDetail = lazy(() => import('./pages/LeadDetail'));
const Campaigns = lazy(() => import('./pages/Campaigns'));
const Inbox = lazy(() => import('./pages/Inbox'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));
const APIKeys = lazy(() => import('./pages/APIKeys'));
const Threads = lazy(() => import('./pages/Threads'));
const Billing = lazy(() => import('./pages/Billing'));
const Bookings = lazy(() => import('./pages/Bookings'));
const DiscoveryTargets = lazy(() => import('./pages/DiscoveryTargets'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const DataDeletion = lazy(() => import('./pages/DataDeletion.tsx'));
const Support = lazy(() => import('./pages/Support'));
const RefundPolicy = lazy(() => import('./pages/RefundPolicy'));
const Profile = lazy(() => import('./pages/Profile'));
const PublicProfile = lazy(() => import('./pages/PublicProfile'));
const LeadDemoViewer = lazy(() => import('./pages/LeadDemoViewer'));
const BookingPage = lazy(() => import('./pages/BookingPage'));
const DownloadApp = lazy(() => import('./pages/Download'));
const LeadScanner = lazy(() => import('./pages/LeadScanner'));
const Faq = lazy(() => import('./pages/Faq'));
const Compare = lazy(() => import('./pages/Compare'));
const UseCases = lazy(() => import('./pages/UseCases'));
const Integrations = lazy(() => import('./pages/Integrations'));
const Changelog = lazy(() => import('./pages/Changelog'));
const Blog = lazy(() => import('./pages/Blog'));
const Guides = lazy(() => import('./pages/Guides'));
const Post = lazy(() => import('./pages/Post'));
const DirectoryIndex = lazy(() => import('./pages/directory/DirectoryIndex'));
const DirectoryList = lazy(() => import('./pages/directory/DirectoryList'));
const DirectoryDetail = lazy(() => import('./pages/directory/DirectoryDetail'));

// Routes where SplashScreen must NOT play — these are public marketing /
// SEO surfaces where the 2.8 s splash would cap LCP above the
// Core-Web-Vitals "good" threshold (<2.5 s) and tank ranking. The splash
// stays for the authenticated app entry, which is where it actually adds
// brand polish.
const PUBLIC_NO_SPLASH_PATTERNS: RegExp[] = [
  /^\/$/,
  /^\/pricing$/,
  /^\/docs/,
  /^\/blog/,
  /^\/guides/,
  /^\/faq$/,
  /^\/compare$/,
  /^\/use-cases$/,
  /^\/integrations$/,
  /^\/changelog$/,
  /^\/directory/,
  /^\/u\//,
  /^\/demo\//,
  /^\/book\//,
  /^\/scanner$/,
  /^\/download$/,
  /^\/privacy$/,
  /^\/terms$/,
  /^\/delete-data$/,
  /^\/support$/,
  /^\/refund-policy$/,
];

function shouldSkipSplash(pathname: string): boolean {
  return PUBLIC_NO_SPLASH_PATTERNS.some((p) => p.test(pathname));
}

function PageFallback() {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="w-7 h-7 rounded-full border-2 border-white/15 border-t-white/60 animate-spin" />
    </div>
  );
}

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

function AppShell() {
  // The splash-suppression check needs router context (useLocation), so it
  // lives inside <BrowserRouter>. Calling it here keeps the wrapper tree
  // tidy without a second router instance.
  const location = useLocation();
  const [splashSuppressed] = useState(() => shouldSkipSplash(location.pathname));
  const [splashDone, setSplashDone] = useState(splashSuppressed);

  return (
    <>
      {!splashDone && (
        <SplashScreen onFinished={() => setSplashDone(true)} />
      )}
      <DeepLinkHandler />
      <AuthProvider>
        <SessionExpiredModal />
        <div className="pt-safe sticky top-0 z-[100]">
          <UpdateBanner />
        </div>
        <Suspense fallback={<PageFallback />}>
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
            <Route path="/book/:username/:eventSlug" element={<BookingPage />} />
            <Route path="/download" element={<DownloadApp />} />
            <Route path="/scanner" element={<LeadScanner />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/use-cases" element={<UseCases />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/changelog" element={<Changelog />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<Post kind="blog" />} />
            <Route path="/guides" element={<Guides />} />
            <Route path="/guides/:slug" element={<Post kind="guide" />} />
            <Route path="/directory" element={<DirectoryIndex />} />
            <Route path="/directory/:industry/:city" element={<DirectoryList />} />
            <Route path="/directory/lead/:slug" element={<DirectoryDetail />} />

            {/* Protected: Client Welcome (clients only — freelancers redirected to /overview) */}
            <Route element={<ClientRoute />}>
              <Route path="/welcome" element={<Welcome />} />
            </Route>

            {/* Protected: Freelancer Dashboard (full access) */}
            <Route element={<FreelancerRoute />}>
              <Route element={<Shell />}>
                <Route path="/overview" element={<Overview />} />
                <Route path="/bookings" element={<Bookings />} />
                <Route path="/pipeline" element={<Pipeline />} />
                <Route path="/scheduler" element={<Scheduler />} />
                <Route path="/discovery-targets" element={<DiscoveryTargets />} />
                <Route path="/leads" element={<Leads />} />
                <Route path="/leads/:id" element={<LeadDetail />} />
                <Route path="/threads" element={<Threads />} />
                <Route path="/campaigns" element={<Campaigns />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/billing" element={<Billing />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/api-keys" element={<APIKeys />} />
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
        </Suspense>
      </AuthProvider>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1C1C1C',
            color: '#F0F0F0',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '10px',
            fontSize: '13px',
            fontFamily: '"Almarai", -apple-system, BlinkMacSystemFont, sans-serif',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            padding: '10px 14px',
          },
          success: {
            style: {
              background: '#0F1A14',
              border: '1px solid rgba(52, 211, 153, 0.35)',
              borderLeft: '3px solid #34D399',
              color: '#E6F7EE',
            },
            iconTheme: { primary: '#34D399', secondary: '#0F1A14' },
          },
          error: {
            style: {
              background: '#1A0F0F',
              border: '1px solid rgba(248, 113, 113, 0.35)',
              borderLeft: '3px solid #F87171',
              color: '#FBE6E6',
            },
            iconTheme: { primary: '#F87171', secondary: '#1A0F0F' },
          },
          loading: {
            iconTheme: { primary: '#60A5FA', secondary: '#0F1722' },
          },
        }}
      />
    </QueryClientProvider>
  );
}
