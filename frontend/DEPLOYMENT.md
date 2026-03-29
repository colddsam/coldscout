<div align="center">

# 🖥️ Frontend Deployment Guide

[![Vercel](https://img.shields.io/badge/Platform-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)
[![Vite](https://img.shields.io/badge/Build-Vite_8-000000?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![React](https://img.shields.io/badge/Framework-React_19-000000?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)

*Static React dashboard deployed on Vercel with global CDN edge distribution*

</div>

---

## 📐 Frontend Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    VERCEL DEPLOYMENT                            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Vercel CDN (Global Edge)                    │  │
│  │                                                          │  │
│  │  npm run build                                           │  │
│  │      │                                                   │  │
│  │      ├── TypeScript type check (tsc -b)                  │  │
│  │      └── Vite bundle → dist/                             │  │
│  │                                                          │  │
│  │  Static Files served from Edge (dist/)                   │  │
│  │  ├── index.html                                          │  │
│  │  ├── assets/*.js (code-split chunks)                     │  │
│  │  └── assets/*.css                                        │  │
│  │                                                          │  │
│  │  vercel.json                                             │  │
│  │  ├── Rewrites: SPA routing → index.html                  │  │
│  │  ├── CSP Headers: Supabase, API, analytics               │  │
│  │  └── Cache headers for static assets                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          │                                      │
│                          │ HTTPS REST                           │
│                          ▼                                      │
│              Render Backend API                                 │
│        (VITE_PROXY_URL environment var)                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Deploying to Vercel

### Step 1: Create a Vercel Account

Sign up at [vercel.com](https://vercel.com) and connect your GitHub account.

### Step 2: Import Repository

1. Click **"New Project"** → **"Import Git Repository"**
2. Select your repository
3. Configure project settings:

| Setting | Value |
|---------|-------|
| **Framework Preset** | Vite (auto-detected) |
| **Root Directory** | `frontend` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |
| **Node.js Version** | 18.x or 20.x |

### Step 3: Configure Environment Variables

In Vercel dashboard → **Settings → Environment Variables**, add:

| Variable | Value | Environment |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | `eyJ0eXAiOiJKV1Q...` | Production, Preview, Development |
| `VITE_PROXY_URL` | `https://your-backend.onrender.com` | Production |
| `VITE_API_KEY` | Your API key (must match backend) | Production |
| `VITE_SITE_NAME` | `Cold Scout` | All |

> **Important**: `VITE_PROXY_URL` should point to your Render backend URL in production. In preview deployments you may want it pointing to a staging backend.

### Step 4: Configure Supabase OAuth Redirect

In your **Supabase dashboard** → **Authentication → URL Configuration**:

1. Set **Site URL** to your Vercel domain:
   ```
   https://coldscout.colddsam.com
   ```

2. Add to **Redirect URLs**:
   ```
   https://coldscout.colddsam.com/auth/callback
   https://your-project.vercel.app/auth/callback
   ```
   > Add both your custom domain and the `.vercel.app` domain to support preview deployments.

### Step 5: Configure Custom Domain (Optional)

In Vercel dashboard → **Settings → Domains**:

1. Add your domain (e.g., `coldscout.colddsam.com`)
2. Configure DNS records as instructed:
   - **CNAME**: `coldscout` → `cname.vercel-dns.com`
3. Vercel auto-provisions SSL certificate

### Step 6: Deploy

Click **"Deploy"** — Vercel will:
1. Install Node.js dependencies
2. Run TypeScript type check
3. Build with Vite (creates `dist/`)
4. Deploy to global CDN edge network
5. Assign a `.vercel.app` URL

> **Auto-Deploy**: Every push to `main` triggers production deployment. Pull requests get preview deployments at unique URLs.

---

## ⚙️ vercel.json Configuration

The `vercel.json` file controls routing and security headers:

```json
{
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co https://your-backend.onrender.com wss://*.supabase.co; img-src 'self' data: https:; font-src 'self' data:"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        }
      ]
    }
  ]
}
```

**Key Rules**:
- **SPA Rewrite**: All routes except `/api/` fallback to `index.html` — enables client-side routing
- **CSP**: `connect-src` must include your Supabase project URL and Render backend URL
- **X-Frame-Options**: `DENY` prevents clickjacking

> **Update CSP**: After deploying, update the `connect-src` in `vercel.json` with your actual Render backend URL and Supabase project URL.

---

## 🐳 Docker Deployment (Alternative)

For self-hosted environments using nginx:

### Dockerfile Overview

The frontend `Dockerfile`:
1. **Build stage**: Installs deps, runs `vite build`
2. **Production stage**: `nginx:alpine` serves static files

```bash
# Build Docker image
docker build -t coldscout-frontend .

# Run with environment variables
docker run -p 80:80 \
  -e VITE_SUPABASE_URL=https://xxx.supabase.co \
  -e VITE_SUPABASE_ANON_KEY=eyJ... \
  -e VITE_PROXY_URL=https://api.yourserver.com \
  -e VITE_API_KEY=your_api_key \
  coldscout-frontend
```

### nginx Configuration

The included `nginx.conf` provides:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA routing — all paths fallback to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets aggressively
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "DENY";
    add_header X-Content-Type-Options "nosniff";
    add_header Content-Security-Policy "...";

    # Gzip compression
    gzip on;
    gzip_types text/plain application/javascript text/css;
}
```

> **Important**: `VITE_*` environment variables are baked into the bundle at build time — they cannot be changed at runtime without rebuilding. This is a Vite/Rollup design constraint.

---

## 🏗 Build Optimization

### Code Splitting

Vite automatically splits the bundle. The configuration creates separate chunks for heavy dependencies:

| Chunk | Contents | Loading |
|-------|----------|---------|
| `vendor` | React, React DOM | Always loaded |
| `charts` | Recharts | Lazy — only on Analytics page |
| `editor` | Monaco Editor | Lazy — only on Settings/Scheduler |
| `index` | App code | Always loaded |

### Performance Targets

| Metric | Target |
|--------|--------|
| First Contentful Paint | < 1.5s |
| Time to Interactive | < 3s |
| Largest Contentful Paint | < 2.5s |
| Bundle size (gzipped) | < 300KB initial |

### Build Locally Before Deploying

```bash
# Check for TypeScript errors
npm run build

# Preview the production build
npm run preview

# Check bundle size
npx vite-bundle-analyzer
```

---

## 🔒 Security Configuration

### API Key — Never in Browser

The `VITE_API_KEY` is injected into requests via:

**Development**: Node.js proxy (`server/index.ts`) adds `X-API-Key` server-side before forwarding to backend. The browser never sees the raw key.

**Production (Vercel)**: The key is bundled into the Vite build. While technically accessible in JS bundles, the proxy pattern and CORS restrictions limit exposure. For maximum security in production, consider using Vercel Edge Functions as the proxy layer.

### Content Security Policy

Update `vercel.json` with your actual domains. The `connect-src` directive must include:
- Your Supabase project URL: `https://[ref].supabase.co`
- Supabase WebSocket: `wss://[ref].supabase.co`
- Your Render backend: `https://[name].onrender.com`

### Session Security

- JWT tokens stored in `localStorage` by Supabase JS SDK (industry standard for SPAs)
- Supabase sessions have 1-hour expiry by default + auto-refresh
- `SessionExpiredModal` shown when 401 is received — forces re-authentication
- Role stored in `localStorage` is display-only cache — backend re-validates on every sync

---

## 🌐 Multi-Environment Setup

### Preview Deployments

Vercel creates preview deployments for every pull request. Configure environment variables for `Preview` environment in Vercel dashboard — typically pointing to a staging backend.

### Environment Matrix

| Variable | Development | Preview | Production |
|----------|-------------|---------|------------|
| `VITE_SUPABASE_URL` | Same as prod | Same as prod | Production Supabase |
| `VITE_PROXY_URL` | `localhost:8000` | Staging Render URL | Production Render URL |
| `VITE_API_KEY` | Local dev key | Staging API key | Production API key |

---

## 📊 Monitoring After Deployment

### Vercel Analytics

Enable **Vercel Analytics** in your project dashboard for:
- Core Web Vitals tracking
- Real-user performance metrics
- Geographic distribution of users

### Vercel Speed Insights

Enable **Speed Insights** for:
- Page-level performance scoring
- Identifying slow pages

### Error Monitoring

Consider integrating **Sentry** for:
- JavaScript error tracking
- Performance monitoring
- Session replay

---

## 🛠 Troubleshooting

| Issue | Resolution |
|-------|-----------|
| Blank page after deploy | Check browser console; likely missing `VITE_SUPABASE_URL` |
| OAuth redirect fails | Add `/auth/callback` to Supabase redirect URL allowlist |
| API requests failing (CORS) | Add Vercel domain to backend `BACKEND_CORS_ORIGINS` |
| Build fails: TypeScript errors | Run `npm run build` locally, fix all TS errors before pushing |
| CSP blocking Supabase | Update `connect-src` in `vercel.json` with your Supabase URL |
| 404 on page refresh | Verify `vercel.json` rewrite rule is present (SPA routing) |
| Environment var not picked up | Prefix must be `VITE_` for Vite to expose it in the bundle |
| Old deploy still showing | Vercel CDN cache — trigger a forced redeploy or clear cache |

---

## 📋 Pre-Deployment Checklist

```
Frontend Production Checklist:

  ✅ npm run build passes locally without errors
  ✅ VITE_SUPABASE_URL set in Vercel environment variables
  ✅ VITE_SUPABASE_ANON_KEY set in Vercel environment variables
  ✅ VITE_PROXY_URL points to production Render backend
  ✅ VITE_API_KEY matches backend API_KEY exactly
  ✅ Supabase redirect URL includes /auth/callback for your domain
  ✅ Supabase Site URL set to your production domain
  ✅ vercel.json connect-src includes Supabase + Render URLs
  ✅ Custom domain configured and DNS records propagated
  ✅ SSL certificate issued by Vercel (auto)
  ✅ Backend BACKEND_CORS_ORIGINS includes this frontend domain
  ✅ Test login flow end-to-end after deployment
  ✅ Test OAuth flow (Google/GitHub) after deployment
```

---

<div align="center">

*For full-stack deployment including backend and database, see the root [DEPLOYMENT.md](../DEPLOYMENT.md)*

</div>
