/**
 * Root Application Component (Android / Vite build).
 *
 * Orchestrates global providers (QueryClient, Router, Auth) and renders the
 * route tree. Routes are NOT hand-written here anymore — they are generated
 * from the shared single-source manifest in ./routes.manifest.ts, so the
 * Android route table can never drift from the web (Next.js) route table.
 * See routes.manifest.ts for the full rationale + the sync guard.
 *
 * Everything Android/native-specific (splash screen, Capacitor deep-link OAuth
 * handler, update banner, session-expiry modal) is preserved here.
 */
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useState, useEffect, lazy, Suspense, createElement } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

import Shell from './components/layout/Shell';
import SplashScreen from './components/SplashScreen';
import UpdateBanner from './components/UpdateBanner';
import { AuthProvider } from './hooks/useAuth';
import ProtectedRoute, { FreelancerRoute, ClientRoute, SuperuserRoute } from './components/auth/ProtectedRoute';
import SessionExpiredModal from './components/auth/SessionExpiredModal';
import { ROUTES, NOT_FOUND_COMPONENT, type RouteDef } from './routes.manifest';

// ── Component registry ──────────────────────────────────────────────
// Every page module is lazy-loaded so each route ships in its own chunk.
// `import.meta.glob` (Vite) builds the loader map at build time; the manifest's
// `component` string keys into it. Single source of truth: add a page file + a
// manifest row and the route is wired automatically for the Android app.
const pageModules = import.meta.glob('./pages/**/*.tsx');
const lazyCache = new Map<string, LazyExoticComponent<ComponentType<Record<string, unknown>>>>();

function getComponent(component: string): LazyExoticComponent<ComponentType<Record<string, unknown>>> {
  const cached = lazyCache.get(component);
  if (cached) return cached;
  const key = `./pages/${component}.tsx`;
  const loader = pageModules[key] as
    | (() => Promise<{ default: ComponentType<Record<string, unknown>> }>)
    | undefined;
  if (!loader) {
    throw new Error(
      `[routes] page component not found for "${component}" (expected ${key}). Check routes.manifest.ts.`,
    );
  }
  const comp = lazy(loader);
  lazyCache.set(component, comp);
  return comp;
}

function renderRoute(r: RouteDef) {
  const Comp = getComponent(r.component);
  return <Route key={r.path} path={r.path} element={createElement(Comp, r.props ?? {})} />;
}

const NotFound = getComponent(NOT_FOUND_COMPONENT);

// ── Splash suppression (derived from the manifest) ──────────────────
// Skip the splash on public surfaces so first paint is instant; the
// authenticated app entry (dashboard / welcome — non-public) still gets the
// branded splash.
function pathToRegExp(p: string): RegExp {
  const body = p
    .split('/')
    .filter(Boolean)
    .map((s) => (s.startsWith(':') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^/${body}$`);
}
const PUBLIC_MATCHERS = ROUTES.filter((r) => r.access === 'public').map((r) => pathToRegExp(r.path));

function shouldSkipSplash(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_MATCHERS.some((re) => re.test(pathname));
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
 * Shared QueryClient instance with optimized defaults.
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
import { Browser } from '@capacitor/browser';
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
          // Surface Supabase/Google OAuth errors instead of silently
          // navigating to /auth/callback and spinning forever.
          const oauthError = callbackUrl.searchParams.get('error_description')
            || callbackUrl.searchParams.get('error');
          if (oauthError) {
            console.error('OAuth provider returned error:', oauthError);
          } else if (code) {
            await supabase.auth.exchangeCodeForSession(code);
          }
        } catch (err) {
          console.error('Deep link code exchange failed:', err);
        }

        // The system browser is still in the foreground showing Supabase's
        // redirect page. Close it so the user lands back in the app cleanly.
        try {
          await Browser.close();
        } catch {
          // No-op: Browser.close throws on platforms where no browser is open.
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
  // lives inside <BrowserRouter>.
  const location = useLocation();
  const [splashSuppressed] = useState(() => shouldSkipSplash(location.pathname));
  const [splashDone, setSplashDone] = useState(splashSuppressed);

  // Manifest-driven route groups (single source of truth: routes.manifest.ts).
  const publicRoutes = ROUTES.filter((r) => r.access === 'public');
  const clientRoutes = ROUTES.filter((r) => r.access === 'auth-client');
  const freelancerRoutes = ROUTES.filter((r) => r.access === 'freelancer');
  const sharedRoutes = ROUTES.filter((r) => r.access === 'shared');
  const superuserRoutes = ROUTES.filter((r) => r.access === 'superuser');

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
            {/* Public routes */}
            {publicRoutes.map(renderRoute)}

            {/* Protected: Client-only (e.g. /welcome) */}
            <Route element={<ClientRoute />}>
              {clientRoutes.map(renderRoute)}
            </Route>

            {/* Protected: Freelancer dashboard (inside Shell) */}
            <Route element={<FreelancerRoute />}>
              <Route element={<Shell />}>
                {freelancerRoutes.map(renderRoute)}
              </Route>
            </Route>

            {/* Protected: Shared dashboard pages (client + freelancer) */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Shell />}>
                {sharedRoutes.map(renderRoute)}
              </Route>
            </Route>

            {/* Protected: Superuser-only admin tooling */}
            <Route element={<SuperuserRoute />}>
              <Route element={<Shell />}>
                {superuserRoutes.map(renderRoute)}
              </Route>
            </Route>

            {/* 404 */}
            <Route path="*" element={createElement(NotFound)} />
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
