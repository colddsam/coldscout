# Cold Scout — Web (Next.js)

The **web** frontend for Cold Scout, built on **Next.js (App Router)** with SSG/ISR
for SEO. It **reuses the React source in `../frontend/src`** (single source of truth)
— the Vite app in `../frontend` is kept solely to build the **Android (Capacitor)** APK.

> See [`MIGRATION.md`](./MIGRATION.md) for the full architecture, route inventory,
> and the production deploy checklist.

---

## Prerequisites

- **Node 20+** (Next 15 requirement; repo developed on Node 24)
- npm
- The sibling `../frontend` directory present (this app imports from `../frontend/src`)

---

## 1. Environment

Create `web/.env.local` (gitignored) with the **same `VITE_` names** the Vite app uses
— a build-time shim maps `import.meta.env.VITE_*` to these:

```bash
# Browser API client → live backend (no local proxy in Next)
VITE_API_BASE_URL=https://api.coldscout.colddsam.com
VITE_API_KEY=<your api key>
VITE_SITE_NAME=Cold Scout
VITE_APP_BOOKING_URL=https://calendly.com/<handle>/30min
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>

# OAuth / email redirect origin — Next dev runs on :3000
VITE_APP_URL=http://localhost:3000

# Optional: force the static banner instead of dynamic /api/og social cards
# VITE_PUBLIC_OG_DISABLED=1
```

For OAuth to work locally, add `http://localhost:3000/**` to
**Supabase → Authentication → URL Configuration → Redirect URLs**, and ensure the
backend's `BACKEND_CORS_ORIGINS` allows `http://localhost:3000`.

---

## 2. Install

```bash
cd web
npm install
```

---

## 3. Develop

```bash
npm run dev        # http://localhost:3000
```

`next dev` auto-loads `.env.local` into both the client bundle and the **server
runtime** (so server-side data fetching / SSR for directory & profile pages works).

---

## 4. Production build & run

```bash
npm run build      # next build (SSG/ISR + route manifest)
npm run start      # serve the production build on :3000
```

> ⚠️ **Local `next start` does NOT auto-load `.env.local` into the server runtime.**
> Server-side fetches (`serverGet` in `src/lib/serverApi.ts`) read
> `process.env.VITE_API_BASE_URL` / `VITE_API_KEY` at runtime. To test the prod build
> with live SSR data locally, pass them inline:
>
> ```bash
> VITE_API_BASE_URL=https://api.coldscout.colddsam.com VITE_API_KEY=<key> npm run start
> ```
>
> On **Vercel** this is a non-issue — project env vars are injected into the server runtime.

---

## How it works (quick map)

| Concern | Where |
|---|---|
| Shared React source | `../frontend/src` via `@front/*` alias + `experimental.externalDir` |
| Router compat (`Link`, `useNavigate`, `useParams`, `Outlet`, …) | `src/compat/react-router-dom.tsx` (aliased over `react-router-dom`) |
| `import.meta.env.VITE_*` shim | DefinePlugin in `next.config.mjs` |
| React/Query/Framer/Supabase de-dupe | `resolve.modules` / aliases in `next.config.mjs` |
| Per-route SEO metadata | `src/lib/seo.ts` (`routeMetadata`, `postMetadata`, `ogImageUrl`) |
| Server data fetch (SSR/metadata) | `src/lib/serverApi.ts` (`serverGet`, fails soft) |
| Auth guards | `src/components/auth-guard.tsx` (`RequireAuth`) |
| Dashboard shell | `src/app/(dashboard)/` (Shell via `ssr:false` + `OutletProvider`) |
| Dynamic OG image | `src/app/api/og/route.tsx` → `/api/og` |
| Sitemap | `src/app/sitemap.ts` → `/sitemap.xml` |
| robots | `public/robots.txt` |

### Rendering conventions
- **Public/SEO pages** → server `page.tsx` (metadata) + thin `'use client'` wrapper with
  `<Suspense>`. SSG + ISR. Data-driven SEO pages prefetch into TanStack Query +
  `HydrationBoundary` for body SSR.
- **Auth / dashboard pages** (noindex) → `next/dynamic(..., { ssr: false })` to skip SSR
  for inherently client-only screens (Monaco, charts, realtime, Razorpay).

### Adding a route
1. Static marketing page → add to `ROUTE_META` (in `../frontend/src/lib/seo/route-meta.ts`),
   create `src/app/<path>/page.tsx` + `client.tsx` (see existing examples).
2. Blog post / guide → add the `.tsx` under `../frontend/src/content/posts` and its meta to
   the manifest; `sitemap.ts`, listings, and `/blog/[slug]` pick it up automatically.

---

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server (HMR) on :3000 |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | Next lint |

---

## Android note

Do **not** build Android from here. The APK is still built from `../frontend` (Vite +
Capacitor) exactly as before — that pipeline is untouched by this app.
