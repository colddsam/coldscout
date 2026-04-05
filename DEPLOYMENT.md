<div align="center">

# 🌍 Cold Scout — Production Deployment Master Guide

[![Supabase](https://img.shields.io/badge/Database-Supabase-000000?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Render](https://img.shields.io/badge/Backend-Render-000000?style=for-the-badge&logo=render&logoColor=white)](https://render.com)
[![Vercel](https://img.shields.io/badge/Frontend-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)

*Three-tier production deployment: Managed Database · Containerized API · Edge CDN*

</div>

---

## 📐 Production Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      PRODUCTION TOPOLOGY                            │
│                                                                     │
│   Browser                                                           │
│      │                                                              │
│      ▼                                                              │
│  ┌────────────────────────────────┐                                 │
│  │         VERCEL (CDN Edge)      │  coldscout.colddsam.com        │
│  │   React 19 + Vite Static Build │  SSL: Auto-managed             │
│  │   Global CDN Distribution      │  Deploy: git push → auto       │
│  └──────────────┬─────────────────┘                                │
│                 │ HTTPS REST API                                    │
│                 ▼                                                   │
│  ┌────────────────────────────────┐                                 │
│  │      RENDER (Docker Container) │  api.coldscout.com             │
│  │   FastAPI + APScheduler        │  SSL: Auto-managed             │
│  │   Background Pipeline Tasks    │  Deploy: Docker on push        │
│  └──────────────┬─────────────────┘                                │
│                 │ postgresql+asyncpg://                             │
│                 ▼                                                   │
│  ┌────────────────────────────────┐                                 │
│  │    SUPABASE (Managed PG)       │  Managed PostgreSQL 15         │
│  │   PostgreSQL + Auth + Storage  │  Point-in-time recovery        │
│  │   JWKS Auth Endpoint           │  Auto-backups                  │
│  └────────────────────────────────┘                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔑 Step 1: External Service Provisioning

Provision all required third-party services before deploying. Each section includes where to find credentials.

---

### 🤖 1.1 Groq AI (Lead Qualification Engine)

Core requirement for AI-powered lead scoring and email generation.

1. Visit [console.groq.com/keys](https://console.groq.com/keys)
2. Sign in / create account
3. Click **"Create API Key"**
4. Copy the key — this is your `GROQ_API_KEY`

> **Model Recommendation**: `llama-3.1-8b-instant` for speed/cost balance. Use `llama-3.1-70b-versatile` for higher quality qualification at higher latency.

---

### 🗺 1.2 Google Places API (Target Acquisition)

Core requirement for programmatic business discovery.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g., `coldscout-production`)
3. Navigate to **APIs & Services → Library**
4. Search and enable **"Places API"**
5. Go to **APIs & Services → Credentials**
6. Click **"Create Credentials → API Key"**
7. Restrict the key to the Places API for security
8. Copy as `GOOGLE_PLACES_API_KEY`

> **Cost Note**: Google Places API has a free tier. Monitor usage in the console to avoid unexpected charges.

---

### 🗄️ 1.3 Supabase (Database + Auth)

Core requirement for persistent storage and authentication.

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Choose a region close to your users
3. Note your database password (used in connection string)

**Database Connection String:**
- Navigate to **Settings → Database → Connection String**
- Copy the URI
- **CRITICAL**: Change `postgresql://` to `postgresql+asyncpg://` for async driver compatibility

```
# Change this:
postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres

# To this:
postgresql+asyncpg://postgres:[password]@db.[ref].supabase.co:5432/postgres
```

**Auth Credentials:**
- Navigate to **Settings → API**
- Copy `Project URL` → `SUPABASE_URL`
- Copy `anon public` key → `SUPABASE_ANON_KEY`

**OAuth Setup (Optional):**
In Supabase dashboard → **Authentication → Providers**:
- Enable Google, GitHub, Facebook, LinkedIn as needed
- Set callback URL to: `https://your-domain.com/auth/callback`

---

### ✉️ 1.4 Brevo SMTP (Email Outreach)

Core requirement for automated cold email delivery.

1. Sign up at [brevo.com](https://www.brevo.com)
2. Navigate to **SMTP & API → SMTP**
3. Click **"Create a New SMTP Key"**
4. Copy the credentials:

| Variable | Value |
|----------|-------|
| `BREVO_SMTP_HOST` | `smtp-relay.brevo.com` |
| `BREVO_SMTP_PORT` | `587` |
| `BREVO_SMTP_USER` | Your Brevo account email |
| `BREVO_SMTP_PASSWORD` | Generated SMTP key |
| `FROM_EMAIL` | Verified sender address |
| `FROM_NAME` | Display name (e.g., `Cold Scout`) |
| `REPLY_TO_EMAIL` | Where replies should land |

> **Brevo Webhook**: For tracking email events (opens, clicks, bounces), set up a webhook in Brevo pointing to `https://your-api.com/api/v1/webhooks/brevo`. Set `BREVO_WEBHOOK_SECRET` to authenticate incoming events.

---

### 📥 1.5 IMAP Configuration (Reply Tracking)

Core requirement for auto-classifying inbound prospect replies.

1. Use a Gmail/Google Workspace account dedicated to Cold Scout
2. Enable **2-Step Verification** on the account
3. Go to **Google Account → Security → App Passwords**
4. Create an App Password for "Cold Scout"
5. Copy the 16-character password as `IMAP_PASSWORD`

| Variable | Value |
|----------|-------|
| `IMAP_HOST` | `imap.gmail.com` |
| `IMAP_USER` | `your-email@gmail.com` |
| `IMAP_PASSWORD` | 16-character App Password |

---

### 📲 1.6 Telegram Bot (Real-Time Alerts)

Required for system health notifications and lead alerts.

1. Open Telegram → search `@BotFather`
2. Send `/newbot` → follow prompts
3. Copy the HTTP API Token → `TELEGRAM_BOT_TOKEN`
4. Get your Chat ID via `@userinfobot` → `TELEGRAM_CHAT_ID`

---

### 💳 1.7 Razorpay (Billing — INR Subscriptions)

Required for freelancer plan upgrades.

1. Sign up at [razorpay.com](https://razorpay.com)
2. Navigate to **Settings → API Keys**
3. Generate a key pair (Test mode first, then Live):

| Variable | Description |
|----------|-------------|
| `RAZORPAY_KEY_ID` | Public key (`rzp_live_...` or `rzp_test_...`) |
| `RAZORPAY_KEY_SECRET` | Secret key |

> In the Razorpay dashboard, configure subscription plans matching your pricing tiers.

---

### ⏰ 1.8 Service Keep-Alive (Cron Monitor)

Ensures Render backend doesn't sleep on free tiers.

1. Register at [cron-job.org](https://cron-job.org)
2. Generate an API Key
3. Run the setup script locally (with your `.env` configured):

```bash
cd backend
python scripts/setup_cronjob.py
```

This registers a recurring health check hitting `/api/v1/health` every 5 minutes.

---

### 🔐 1.9 Cryptographic Secret Generation

Generate secure keys for session hashing and API authentication:

```bash
cd backend
python scripts/generate_secrets.py
```

This outputs ready-to-use hex strings for:
- `APP_SECRET_KEY`
- `API_KEY`
- `SECURITY_SALT`

---

## ⚙️ Step 2: Master Environment Variable Reference

Complete reference for all **46 configuration parameters**.

### Security

| Variable | Example | Required |
|----------|---------|----------|
| `APP_ENV` | `production` | ✅ |
| `APP_SECRET_KEY` | `a3f8b2...` (64-char hex) | ✅ |
| `API_KEY` | `sk_live_...` | ✅ |
| `SECURITY_SALT` | `c7d9e1...` | ✅ |
| `BACKEND_CORS_ORIGINS` | `https://coldscout.colddsam.com` | ✅ |
| `APP_URL` | `https://api.coldscout.com` | ✅ |
| `IMAGE_BASE_URL` | `https://api.coldscout.com` | ✅ |

### Database

| Variable | Example | Required |
|----------|---------|----------|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:pass@db.xxx.supabase.co:5432/postgres` | ✅ |
| `SUPABASE_URL` | `https://xxx.supabase.co` | ✅ |
| `SUPABASE_ANON_KEY` | `eyJ0eXAiOiJKV1Q...` | ✅ |

### AI Processing

| Variable | Example | Required |
|----------|---------|----------|
| `GROQ_API_KEY` | `gsk_...` | ✅ |
| `GROQ_MODEL` | `llama-3.1-8b-instant` | ✅ |
| `GOOGLE_PLACES_API_KEY` | `AIzaSy...` | ✅ |

### Email Outreach

| Variable | Example | Required |
|----------|---------|----------|
| `BREVO_SMTP_HOST` | `smtp-relay.brevo.com` | ✅ |
| `BREVO_SMTP_PORT` | `587` | ✅ |
| `BREVO_SMTP_USER` | `user@domain.com` | ✅ |
| `BREVO_SMTP_PASSWORD` | `xsmtpsib-...` | ✅ |
| `FROM_EMAIL` | `outreach@coldscout.com` | ✅ |
| `FROM_NAME` | `Cold Scout` | ✅ |
| `REPLY_TO_EMAIL` | `replies@coldscout.com` | ✅ |
| `BREVO_WEBHOOK_SECRET` | `whsec_...` | Recommended |
| `EMAIL_SEND_INTERVAL_SECONDS` | `30` | ✅ |

### IMAP Tracking

| Variable | Example | Required |
|----------|---------|----------|
| `IMAP_HOST` | `imap.gmail.com` | ✅ |
| `IMAP_USER` | `outreach@gmail.com` | ✅ |
| `IMAP_PASSWORD` | `abcd efgh ijkl mnop` | ✅ |

### Notifications

| Variable | Example | Required |
|----------|---------|----------|
| `ADMIN_EMAIL` | `admin@coldscout.com` | ✅ |
| `TELEGRAM_BOT_TOKEN` | `123456:ABC-DEF...` | ✅ |
| `TELEGRAM_CHAT_ID` | `987654321` | ✅ |
| `WHATSAPP_NUMBER` | `+91XXXXXXXXXX` | Optional |
| `CALLMEBOT_API_KEY` | `abc123` | Optional |

### Automation / Scheduling

| Variable | Example | Required |
|----------|---------|----------|
| `PRODUCTION_STATUS` | `RUN` | ✅ |
| `CRON_JOB_API_KEY` | `cj_...` | ✅ |
| `RENDER_DEPLOY_HOOK` | `https://api.render.com/deploy/...` | Optional |
| `DISCOVERY_HOUR` | `9` | ✅ |
| `QUALIFICATION_HOUR` | `10` | ✅ |
| `PERSONALIZATION_HOUR` | `11` | ✅ |
| `OUTREACH_HOUR` | `12` | ✅ |
| `REPORT_HOUR` | `20` | ✅ |
| `REPORT_MINUTE` | `0` | ✅ |
| `DISCOVERY_COUNTRY_FOCUS` | `IN,US,AE,GB` | Optional |
| `DISCOVERY_TARGET_COUNT` | `4` | Optional |
| `DISCOVERY_DEPTH` | `sub_area` | Optional |
| `DISCOVERY_MAX_PAGES` | `3` | Optional |

### Billing

| Variable | Example | Required |
|----------|---------|----------|
| `RAZORPAY_KEY_ID` | `rzp_live_...` | ✅ |
| `RAZORPAY_KEY_SECRET` | `...` | ✅ |

### Branding

| Variable | Example | Required |
|----------|---------|----------|
| `VITE_SITE_NAME` | `Cold Scout` | ✅ |
| `BOOKING_LINK` | `https://calendly.com/...` | Optional |
| `SENDER_ADDRESS` | `123 Main St, City, Country` | ✅ |

### Frontend (Vercel)

| Variable | Example | Required |
|----------|---------|----------|
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | ✅ |
| `VITE_SUPABASE_ANON_KEY` | `eyJ0eXAiOiJKV1Q...` | ✅ |
| `VITE_PROXY_URL` | `https://api.coldscout.onrender.com` | ✅ |
| `VITE_API_KEY` | Must match backend `API_KEY` | ✅ |

---

## 🚀 Step 3: Deployment Orchestration

### 3.1 Database Tier — Supabase

1. Create your Supabase project as described in Step 1.3
2. Run database migrations from your local machine (with production `.env`):

```bash
cd backend
# Option A: Direct table creation script
python scripts/create_tables.py

# Option B: Alembic migrations
python scripts/run_alembic.py

# Seed initial admin user
python scripts/seed_admin.py

# (Optional) Seed sample targeting data
python scripts/seed_targets.py
```

3. Verify tables exist:
```bash
python scripts/check_db.py
```

---

### 3.2 Backend Tier — Render (Docker)

1. **Create a Render account** at [render.com](https://render.com)
2. **New Web Service** → Connect your GitHub repository
3. **Configuration**:
   - **Root Directory**: `backend`
   - **Environment**: `Docker`
   - **Dockerfile path**: `backend/Dockerfile`
   - **Region**: Select closest to your target market

4. **Environment Variables**: Add all backend variables from the table above in Render's dashboard under **Environment → Environment Variables**

5. **Disk** (optional): Mount a persistent disk for local file caching if needed

6. **Deploy**: Render builds the Docker image and deploys automatically on every `main` branch push

> **Health Check**: Render will hit `/api/v1/health` to verify the service is running. This endpoint is public (no API key required).

> **Keep-Alive**: Render free tier sleeps after 15 minutes of inactivity. Use the cron-job.org setup (Step 1.8) to prevent this.

---

### 3.3 Frontend Tier — Vercel

1. **Create a Vercel account** at [vercel.com](https://vercel.com)
2. **New Project** → Import your GitHub repository
3. **Configuration**:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite (auto-detected)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

4. **Environment Variables**: Add frontend variables in Vercel dashboard under **Settings → Environment Variables**

5. **Custom Domain**: Configure your domain (e.g., `coldscout.colddsam.com`) under **Settings → Domains**

6. **Deploy**: Vercel builds and deploys automatically on every push

---

## 🔒 Security Hardening Checklist

```
Production Security Checklist:

  ✅ APP_ENV=production enforced
  ✅ API_KEY is a cryptographically random 64-char hex string
  ✅ BACKEND_CORS_ORIGINS set to exact frontend domain (no wildcards)
  ✅ BREVO_WEBHOOK_SECRET configured for webhook validation
  ✅ Supabase Row Level Security (RLS) policies reviewed
  ✅ Google Places API key restricted to Places API only
  ✅ Razorpay using live keys (not test keys) in production
  ✅ IMAP using App Password (not account password)
  ✅ No secrets committed to version control
  ✅ .env files listed in .gitignore
  ✅ Render environment variables set directly (not via Dockerfile ENV)
```

---

## 📊 GitHub Actions CI/CD

The repository includes three automated workflows:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push to any branch | Run pytest, ESLint, TypeScript build |
| `pipeline-health-check.yml` | Daily schedule | Ping health endpoint, report status |
| `setup_cronjob.yml` | Manual dispatch | Register/update cron-job.org monitoring |

No configuration required — workflows run automatically after connecting GitHub.

---

## 🛠 Troubleshooting

<details>
<summary><b>Backend not starting on Render</b></summary>

- Check `APP_ENV=production` is set
- Verify `DATABASE_URL` uses `postgresql+asyncpg://` not `postgresql://`
- Check Render deployment logs for missing environment variables
- Ensure `playwright install chromium --with-deps` runs in build command

</details>

<details>
<summary><b>Frontend shows "Network Error"</b></summary>

- Verify `VITE_PROXY_URL` points to your Render backend URL
- Confirm `VITE_API_KEY` matches `API_KEY` on the backend
- Check that `BACKEND_CORS_ORIGINS` on the backend includes your Vercel domain

</details>

<details>
<summary><b>Auth not working (OAuth redirect)</b></summary>

- In Supabase: **Authentication → URL Configuration**
- Set **Site URL** to your Vercel domain
- Add `https://your-domain.com/auth/callback` to **Redirect URLs**

</details>

<details>
<summary><b>Emails not sending</b></summary>

- Test SMTP credentials with `python scripts/api_tester.py`
- Ensure `FROM_EMAIL` is verified in Brevo
- Check `PRODUCTION_STATUS=RUN` is set
- Verify pipeline job statuses are active in the dashboard scheduler

</details>

---

<div align="center">

*For backend-specific deployment details see [backend/DEPLOYMENT.md](./backend/DEPLOYMENT.md)*
*For frontend-specific deployment details see [frontend/DEPLOYMENT.md](./frontend/DEPLOYMENT.md)*

</div>
