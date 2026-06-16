/**
 * ────────────────────────────────────────────────────────────────────────────
 *  SINGLE SOURCE OF TRUTH FOR ALL APP ROUTES (web + Android)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Why this file exists:
 *   The website (web/, Next.js) and the Android app (frontend/, Vite+Capacitor)
 *   share the same React components, but they declare ROUTES in two different,
 *   framework-specific ways:
 *     - Android  → react-router <Routes> in src/App.tsx
 *     - Web      → file-based routes in web/src/app/**
 *   That routing table was the ONE thing that could drift (add a page on the web
 *   and forget the Android route, or vice-versa). This manifest removes the drift:
 *
 *     1. src/App.tsx builds its <Routes> FROM this manifest at runtime
 *        → adding a route here makes it appear in the Android app automatically.
 *     2. web/scripts/sync-routes.mjs reads this manifest to (a) scaffold any
 *        missing web/src/app page and (b) FAIL (pre-commit + CI) if web routes,
 *        Android routes, and this manifest ever diverge.
 *
 *   ⇒ Add / change / remove a route in exactly ONE place: here.
 *
 * IMPORTANT: keep this file PURE DATA (no React / browser imports). It is loaded
 *   both by the React app and by Node build scripts (esbuild). A registry in
 *   App.tsx maps `component` strings to the actual lazy-loaded modules.
 */

/** Access / guard tier for a route. */
export type RouteAccess =
  | 'public' //          no auth — public & (usually) indexable
  | 'auth-client' //     authenticated clients only (e.g. /welcome)
  | 'freelancer' //      authenticated freelancers (dashboard)
  | 'shared' //          any authenticated user (client or freelancer)
  | 'superuser'; //      superusers only (admin tooling)

/** How the WEB (Next.js) app should render the route. */
export type WebMode =
  | 'ssg' //      static, prerendered (uses generateStaticParams for dynamic)
  | 'isr' //      static + incremental revalidation
  | 'dynamic' //  server-rendered on demand (+ ISR), used for API-fed SEO pages
  | 'client'; //  client-only (ssr:false) — auth/dashboard/noindex screens

export interface RouteWeb {
  mode: WebMode;
  /** robots index? Defaults: public=true, everything else=false. */
  index?: boolean;
  /** ISR revalidate seconds (for ssg/isr/dynamic). */
  revalidate?: number;
  /** Server-prefetch key for body SSR (directory/profile pages). */
  ssrData?: 'directory-list' | 'directory-lead' | 'public-profile';
  /** generateStaticParams source for content routes. */
  staticParams?: 'blog' | 'guide';
  /** Dynamic OG card hints used when scaffolding. */
  og?: { kind?: string; badge?: string };
}

export interface RouteDef {
  /** react-router path — the canonical path (e.g. '/leads/:id'). */
  path: string;
  /** Component module under src/pages (no extension), e.g. 'directory/DirectoryIndex'. */
  component: string;
  /** Props passed to the component (e.g. Post's { kind: 'blog' }). */
  props?: Record<string, string>;
  /** Access / guard tier. */
  access: RouteAccess;
  /** Render inside the dashboard Shell (sidebar + topbar). */
  dashboard?: boolean;
  /** Web rendering config. */
  web: RouteWeb;
  /** Short human note (optional). */
  note?: string;
}

/** Component used for the catch-all 404 (web: not-found.tsx). */
export const NOT_FOUND_COMPONENT = 'NotFound';

export const ROUTES: RouteDef[] = [
  /* ── Public marketing / SEO ─────────────────────────────────────────── */
  { path: '/', component: 'LandingPage', access: 'public', web: { mode: 'isr', revalidate: 3600 } },
  { path: '/pricing', component: 'Pricing', access: 'public', web: { mode: 'isr', revalidate: 3600 } },
  { path: '/docs', component: 'Documentation', access: 'public', web: { mode: 'isr', revalidate: 3600 } },
  { path: '/faq', component: 'Faq', access: 'public', web: { mode: 'isr', revalidate: 3600 } },
  { path: '/compare', component: 'Compare', access: 'public', web: { mode: 'isr', revalidate: 3600 } },
  { path: '/use-cases', component: 'UseCases', access: 'public', web: { mode: 'isr', revalidate: 3600 } },
  { path: '/integrations', component: 'Integrations', access: 'public', web: { mode: 'isr', revalidate: 3600 } },
  { path: '/changelog', component: 'Changelog', access: 'public', web: { mode: 'isr', revalidate: 3600 } },
  { path: '/support', component: 'Support', access: 'public', web: { mode: 'isr', revalidate: 86400 } },
  { path: '/privacy', component: 'Privacy', access: 'public', web: { mode: 'isr', revalidate: 86400 } },
  { path: '/terms', component: 'Terms', access: 'public', web: { mode: 'isr', revalidate: 86400 } },
  { path: '/refund-policy', component: 'RefundPolicy', access: 'public', web: { mode: 'isr', revalidate: 86400 } },
  { path: '/delete-data', component: 'DataDeletion', access: 'public', web: { mode: 'isr', revalidate: 86400 } },
  { path: '/download', component: 'Download', access: 'public', web: { mode: 'isr', revalidate: 3600 } },
  { path: '/scanner', component: 'LeadScanner', access: 'public', web: { mode: 'isr', revalidate: 3600 } },

  /* ── Content (blog / guides) ────────────────────────────────────────── */
  { path: '/blog', component: 'Blog', access: 'public', web: { mode: 'isr', revalidate: 3600 } },
  { path: '/blog/:slug', component: 'Post', props: { kind: 'blog' }, access: 'public', web: { mode: 'ssg', staticParams: 'blog', revalidate: 3600 } },
  { path: '/guides', component: 'Guides', access: 'public', web: { mode: 'isr', revalidate: 3600 } },
  { path: '/guides/:slug', component: 'Post', props: { kind: 'guide' }, access: 'public', web: { mode: 'ssg', staticParams: 'guide', revalidate: 3600 } },

  /* ── Directory (API-fed SEO, body SSR) ──────────────────────────────── */
  { path: '/directory', component: 'directory/DirectoryIndex', access: 'public', web: { mode: 'isr', revalidate: 3600 } },
  { path: '/directory/:industry/:city', component: 'directory/DirectoryList', access: 'public', web: { mode: 'dynamic', revalidate: 3600, ssrData: 'directory-list', og: { badge: 'DIRECTORY' } } },
  { path: '/directory/lead/:slug', component: 'directory/DirectoryDetail', access: 'public', web: { mode: 'dynamic', revalidate: 3600, ssrData: 'directory-lead', og: { badge: 'AUDIT' } } },

  /* ── Public profile / booking / demo / shared audit ─────────────────── */
  { path: '/u/:username', component: 'PublicProfile', access: 'public', web: { mode: 'dynamic', revalidate: 1800, ssrData: 'public-profile', og: { kind: 'profile' } } },
  { path: '/book/:username', component: 'BookingPage', access: 'public', web: { mode: 'dynamic', revalidate: 1800, og: { badge: 'BOOKING' } } },
  { path: '/book/:username/:eventSlug', component: 'BookingPage', access: 'public', web: { mode: 'dynamic', revalidate: 1800, og: { badge: 'BOOKING' } } },
  { path: '/demo/:leadId', component: 'LeadDemoViewer', access: 'public', web: { mode: 'client', index: false, revalidate: 1800 } },
  { path: '/shared/audit/:token', component: 'SharedAuditView', access: 'public', web: { mode: 'client', index: false } },
  // Native branded video room. Public route: leads join via the link; the host
  // (freelancer) is identified inside the page via the authed host-token call.
  { path: '/meet/:roomId', component: 'MeetingRoom', access: 'public', web: { mode: 'client', index: false } },

  /* ── Auth ───────────────────────────────────────────────────────────── */
  { path: '/login', component: 'Login', access: 'public', web: { mode: 'client', index: false } },
  { path: '/signup', component: 'SignUp', access: 'public', web: { mode: 'client', index: false } },
  { path: '/auth/callback', component: 'AuthCallback', access: 'public', web: { mode: 'client', index: false } },
  { path: '/welcome', component: 'Welcome', access: 'auth-client', web: { mode: 'client', index: false } },

  /* ── Dashboard (freelancer) — inside Shell ──────────────────────────── */
  { path: '/overview', component: 'Overview', access: 'freelancer', dashboard: true, web: { mode: 'client', index: false } },
  { path: '/bookings', component: 'Bookings', access: 'freelancer', dashboard: true, web: { mode: 'client', index: false } },
  { path: '/pipeline', component: 'Pipeline', access: 'freelancer', dashboard: true, web: { mode: 'client', index: false } },
  { path: '/scheduler', component: 'Scheduler', access: 'freelancer', dashboard: true, web: { mode: 'client', index: false } },
  { path: '/discovery-targets', component: 'DiscoveryTargets', access: 'freelancer', dashboard: true, web: { mode: 'client', index: false } },
  { path: '/leads', component: 'Leads', access: 'freelancer', dashboard: true, web: { mode: 'client', index: false } },
  { path: '/leads/:id', component: 'LeadDetail', access: 'freelancer', dashboard: true, web: { mode: 'client', index: false } },
  { path: '/threads', component: 'Threads', access: 'freelancer', dashboard: true, web: { mode: 'client', index: false } },
  { path: '/campaigns', component: 'Campaigns', access: 'freelancer', dashboard: true, web: { mode: 'client', index: false } },
  { path: '/inbox', component: 'Inbox', access: 'freelancer', dashboard: true, web: { mode: 'client', index: false } },
  { path: '/analytics', component: 'Analytics', access: 'freelancer', dashboard: true, web: { mode: 'client', index: false } },
  { path: '/billing', component: 'Billing', access: 'freelancer', dashboard: true, web: { mode: 'client', index: false } },
  { path: '/settings', component: 'Settings', access: 'freelancer', dashboard: true, web: { mode: 'client', index: false } },
  { path: '/settings/api-keys', component: 'APIKeys', access: 'freelancer', dashboard: true, web: { mode: 'client', index: false } },

  /* ── Dashboard (shared / superuser) — inside Shell ──────────────────── */
  { path: '/profile', component: 'Profile', access: 'shared', dashboard: true, web: { mode: 'client', index: false } },
  { path: '/admin/users', component: 'AdminUsers', access: 'superuser', dashboard: true, web: { mode: 'client', index: false } },
];

/* ── Derived helpers (pure, usable from React and Node scripts) ───────── */

/** Convert a react-router path to the Next file-route folder path.
 *  '/' -> ''  ·  '/leads/:id' -> 'leads/[id]'  ·  dashboard routes get the
 *  '(dashboard)' route-group prefix. */
export function webRouteDir(r: RouteDef): string {
  const segs = r.path
    .split('/')
    .filter(Boolean)
    .map((s) => (s.startsWith(':') ? `[${s.slice(1)}]` : s));
  const inGroup = r.dashboard === true;
  const body = segs.join('/');
  if (inGroup) return body ? `(dashboard)/${body}` : '(dashboard)';
  return body;
}

/** Expected Next page file (relative to web/src), e.g. 'app/leads/[id]/page.tsx'. */
export function webPageFile(r: RouteDef): string {
  const dir = webRouteDir(r);
  return dir ? `app/${dir}/page.tsx` : 'app/page.tsx';
}

/** Whether the web route is indexable (defaults: public=true, else false). */
export function webIndexable(r: RouteDef): boolean {
  if (typeof r.web.index === 'boolean') return r.web.index;
  return r.access === 'public';
}
