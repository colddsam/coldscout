# Cold Scout — Vite → Next.js Web Migration

Status tracker for migrating the **web** frontend from Vite/React-Router SPA to
**Next.js App Router** (SSG/ISR) for SEO, while keeping the Vite app
(`../frontend`) as the **Android (Capacitor) build only**.

## Architecture

- `web/` (this app) = Next.js App Router. **Reuses `../frontend/src` directly**
  via TS path alias `@front/*` + `experimental.externalDir`. No code duplication.
- Bridges that let the shared Vite-era source run under Next:
  - `src/compat/react-router-dom.tsx` — re-implements the router API
    (`Link/NavLink/useNavigate/useLocation/useParams/useSearchParams/Navigate/
    Outlet`) on `next/navigation`. Aliased in `next.config.mjs` + `tsconfig.json`.
  - `next.config.mjs` DefinePlugin — maps `import.meta.env.VITE_*` → build env.
  - React / React-Query / Framer-Motion / Supabase force-aliased to `web/node_modules`
    so context singletons aren't duplicated from `../frontend/node_modules`.
- Public/SEO routes: server `metadata` + `generateStaticParams` + JSON-LD + ISR.
- Dashboard/auth routes: client routes (noindex) — logic preserved verbatim.
- The old bot-prerender layer (`frontend/middleware.ts`, `frontend/api/prerender.ts`)
  becomes obsolete and is retired for the web deploy.

---

## ✅ What YOU need to do (cannot be done from code)

1. **Vercel project** — keep the existing project + domain. Change:
   - **Root Directory** → `web`
   - **Framework Preset** → Next.js
   - **Build Command** / **Output** → default (Next.js auto).
2. **Vercel env vars** — copy the same `VITE_*` keys onto the project (Production
   + Preview). Set `VITE_APP_URL=https://coldscout.colddsam.com` and
   `VITE_API_BASE_URL=https://api.coldscout.colddsam.com`. (Names unchanged — a
   build shim maps them.) See `web/.env.local` for the full list.
3. **Supabase → Authentication → URL Configuration** — confirm:
   - Site URL = `https://coldscout.colddsam.com`
   - Redirect URLs include `https://coldscout.colddsam.com/**` and (for local
     Next dev) `http://localhost:3000/**`.
4. **Backend CORS** (`BACKEND_CORS_ORIGINS`) — must include the web origin
   (`https://coldscout.colddsam.com`) and `http://localhost:3000` for dev.
   Domain is unchanged, so likely already covered — verify.
5. **Android** — keep building the APK from `../frontend` (Vite) as today. No
   change. Capacitor still wraps `frontend/dist`.
6. **Node** — Vercel: Node 20+ (Next 15 requirement).

---

## Migration status by route

Legend: ⬜ not started · 🟡 in progress · ✅ done & builds

### Foundation
- ✅ Scaffold (package.json, next.config, tsconfig, tailwind, postcss)
- ✅ `react-router-dom` compat shim
- ✅ `import.meta.env` shim
- ✅ Root layout + metadata + JSON-LD + viewport
- ✅ Providers (QueryClient, Auth, Toaster, SessionExpiredModal)
- ✅ Global CSS reuse
- ✅ Public assets copied
- ✅ First production build passing (`next build` green)

### Shared-source SSR fixes (benefit web build; harmless for Vite/Android)
- ✅ `frontend/src/lib/authStorage.ts` — guard eager `window`/`document` init with `typeof window` check
- ✅ `frontend/src/components/ui/Modal.tsx` — defer `createPortal(...,document.body)` until client mount
- (Pattern to reuse for any other render-time `document`/`window`/portal access surfaced by later pages)

### Build/resolution notes
- React/ReactDOM are NOT hard-aliased (breaks RSC); dedup via `resolve.modules` ordering instead.
- React-Query / Framer / Supabase ARE aliased to web/node_modules (context singletons).

### Public / SEO (SSG/ISR — native metadata)
- ✅ `/` Landing — prerendered static, ISR 1h, full metadata + JSON-LD + body content verified
- ✅ `/pricing` · `/docs` · `/faq` · `/compare` · `/use-cases` · `/integrations` (static, ISR 1h)
- ✅ `/changelog` (1h) · `/support` · `/privacy` · `/terms` · `/refund-policy` · `/delete-data` (legal, ISR 1d)
- ✅ `/download` · `/scanner` (static, ISR 1h)
- Verified: distinct per-route `<title>` + canonical; all 18 routes prerender static.
- Added SSR guard: `frontend/src/pages/Pricing.tsx` localStorage read in useState initializer.
- ✅ `/blog` + `/blog/[slug]` (SSG, 10 posts) · `/guides` + `/guides/[slug]` (SSG, 5 guides) — article metadata + body verified
- ✅ `/directory` (static) + `/directory/[industry]/[city]` + `/directory/lead/[slug]` (dynamic SSR + ISR + server metadata)
- ✅ `/u/[username]` PublicProfile (dynamic SSR + ISR + server-fetched profile metadata, og:profile)
- ✅ `/book/[username]` + `/book/[username]/[eventSlug]` (dynamic SSR + metadata)
- ✅ `/demo/[leadId]` (noindex) · `/shared/audit/[token]` (noindex)
- Smoke-tested via `next start`: `/directory/plumber/austin` → 200 + correct title/canonical (useSearchParams Suspense OK under SSR); `/u/*` fails soft to fallback metadata.
- Added `web/src/lib/serverApi.ts` (X-API-Key server fetch, fails soft) + `postMetadata`/`postSlugs` in seo.ts.
- NOTE (enhancement, not blocker): directory/profile dynamic pages currently server-render METADATA; body content hydrates client-side (parity with old prerender). Full body SSR would need the page components to accept server-fetched initial data.

### Auth (client, noindex)
- ✅ `/login` · `/signup` (noindex, `ssr:false` client render)
- ✅ `/auth/callback` (noindex, `ssr:false`) — OAuth/PKCE handled client-side
- ✅ `/welcome` (noindex, `ssr:false`, gated by `RequireAuth roles=['client']`)
- ✅ `web/src/components/auth-guard.tsx` — `RequireAuth` (roles/superuser) replaces ProtectedRoute's Outlet/Navigate; reused by dashboard tranche.
- Pattern locked for client/noindex pages: `next/dynamic(..., { ssr: false })` — sidesteps all SSR window/document issues. Reuse for dashboard.

### Dashboard (client, noindex, under Shell layout + guards) — DONE
- ✅ Route group `app/(dashboard)/` with server `layout.tsx` (noindex) + client `chrome.tsx`
      (Shell via `ssr:false` + base `RequireAuth`, page fed through shim `OutletProvider`).
- ✅ Freelancer pages (`RequireAuth roles=['freelancer']`): `/overview` `/pipeline` `/scheduler`
      `/discovery-targets` `/leads` `/leads/[id]` `/threads` `/campaigns` `/inbox` `/analytics`
      `/billing` `/bookings` `/settings` `/settings/api-keys`
- ✅ `/profile` (base `RequireAuth`) · `/admin/users` (`RequireAuth superuser`)
- ✅ `app/not-found.tsx` (custom 404, `ssr:false`)
- Verified via `next start`: `/overview` → 200 + `robots: noindex,nofollow`; `/admin/users` → 200;
      unknown path → 404. Shell persists across dashboard nav; guards redirect client-side.

### SEO infra (Next-native) — DONE
- ✅ `app/sitemap.ts` → `/sitemap.xml` (33 URLs: static routes + blog/guides, daily ISR). Verified.
- ✅ `public/robots.txt` kept (comprehensive per-bot policy); sitemap refs updated to
      `/sitemap.xml` + backend dynamic sitemaps. Removed stale `sitemap.xml`,
      `sitemap-index.xml`, `sitemap-images.xml`, `content-meta.json` from `public/`.
- ✅ `app/api/og/route.tsx` → `/api/og` (ported from frontend/api/og.tsx to `next/og`,
      edge, 1200x630 PNG, 24h cache). Verified 200 image/png.
- ✅ Bot-prerender retired for web: native SSR/SSG/`generateMetadata` replaces it.

### Cleanup / retirement notes
- `frontend/middleware.ts`, `frontend/api/prerender.ts`, `frontend/api/og.tsx`,
  `frontend/vercel.json` are now OBSOLETE for the web deploy (Vercel Root Dir → `web`
  means they're never deployed). They do NOT affect the Android/Capacitor build, so
  they're left in place; safe to delete later. `frontend/scripts/*seo*` likewise
  superseded by `app/sitemap.ts`.
- `public/llms.txt` / `llms-full.txt` kept as static (AI crawler policy).

### Enhancements DONE
- ✅ Dynamic `/api/og` social cards wired into server metadata: `metaFrom` + `postMetadata`
  (seo.ts `ogImageUrl`) and directory/lead/profile/booking pages. Verified `/pricing`,
  `/blog/*` emit `og:image=/api/og?...`. Set `VITE_PUBLIC_OG_DISABLED=1` to force banner.
- ✅ Full body SSR for `/directory/[industry]/[city]`, `/directory/lead/[slug]`,
  `/u/[username]`: server prefetch via `serverGet` into the exact TanStack Query keys
  (`['directory-list',industry,city,page,20]`, `['directory-lead',slug]`,
  `['public-profile',username]`) + `HydrationBoundary`. Verified `/u/colddsam` server-renders
  full_name + bio in the HTML body (not just metadata).

### Deploy note (important)
- Server-side `serverGet` reads `process.env.VITE_API_BASE_URL` + `VITE_API_KEY` at RUNTIME.
  Vercel injects project env vars into the server runtime, so SSR data fetch works in prod.
  (`next dev` loads `.env.local`; bare local `next start` does NOT auto-load it into the
  server runtime — pass env inline if testing prod build locally.)

## ✅ MIGRATION COMPLETE — all 46 app routes + SEO infra migrated; `next build` green.

---

## 🔁 Web ⇄ Android route sync (no drift, ever)

**Shared code is already single-source:** web imports `frontend/src` directly, so any
change to a component / hook / page body / logic is automatically in BOTH apps. The
only thing that could drift was the **route table** (web file routes vs Android
`App.tsx`). That is now eliminated:

- **Single source of truth:** `frontend/src/routes.manifest.ts` — declares every route
  once (path · component · access · dashboard · web render mode).
- **Android auto-syncs:** `frontend/src/App.tsx` builds its `<Routes>` from the manifest
  at runtime (via `import.meta.glob`). Add a manifest row → Android route appears. The
  splash-skip list is also derived from the manifest.
- **Web kept in sync by tooling:** `web/scripts/sync-routes.mjs`
  - `--write` scaffolds `web/src/app/<route>/page.tsx` (+ `client.tsx`) for any new
    manifest route (correct template per public/dashboard/auth). Never overwrites.
  - `--check` fails on: a manifest route missing its web page, an **orphan** web page
    with no manifest route, or `App.tsx` no longer being manifest-driven.
- **Enforced automatically:**
  - **Pre-commit** (`.husky/pre-commit`): runs `--write`, stages new pages, then `--check`.
  - **CI** (`.github/workflows/ci.yml` → `route-parity` job): `--check` blocks merge.
- Root `package.json` adds `routes:check` / `routes:sync` scripts + `husky` + `esbuild`.

**CI also builds the web app** (`.github/workflows/ci.yml` → `web-build` job): runs
`next build` on every push/PR with dummy `VITE_*` values (no secrets needed — they only
let `supabase.createClient()` not throw during SSG). Catches web build breakage alongside
the existing `backend-test` / `frontend-check` jobs.

### To change routes (the ONLY workflow)
1. Edit `frontend/src/routes.manifest.ts` (add/remove/modify a route).
2. `npm run routes:sync` (from repo root) to scaffold web pages — or just `git commit`
   (the pre-commit hook does it). Fine-tune generated SSR/metadata if needed.
3. Android picks it up automatically; CI guards parity.

### One-time setup (per clone)
- Run **`npm install` at the repo root** once to install husky + esbuild and activate
  the pre-commit hook. (CI installs them itself.)

### Verified
- `--check` → "47 routes in sync". Adding temp public + dashboard routes scaffolds correct
  files and passes; removing the manifest rows makes `--check` fail on orphans (exit 1).
- Both builds green after the App.tsx refactor: `frontend` (tsc + vite) and `web` (next).

### Known follow-ups / edge cases to verify
- Capacitor deep-link OAuth path is **native-only**; web uses standard redirect.
- `useSearchParams` consumers need a `<Suspense>` boundary (route wrappers add it).
- Monaco editor (Settings) must be dynamically imported (`ssr:false`).
- Razorpay checkout script injection (Billing) — client-only.
- Realtime/push (`lib/realtime.ts`, `lib/push.ts`) — client-only, guarded.
