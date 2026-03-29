<div align="center">

# ⚙️ Backend Deployment Guide

[![Render](https://img.shields.io/badge/Platform-Render-000000?style=for-the-badge&logo=render&logoColor=white)](https://render.com)
[![Docker](https://img.shields.io/badge/Runtime-Docker-000000?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![FastAPI](https://img.shields.io/badge/Framework-FastAPI-000000?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)

*Containerized FastAPI backend deployed on Render with APScheduler autonomous pipeline*

</div>

---

## 📐 Backend Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    RENDER DEPLOYMENT                            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Docker Container                        │  │
│  │                                                          │  │
│  │  entrypoint.sh                                           │  │
│  │      │                                                   │  │
│  │      ▼                                                   │  │
│  │  uvicorn app.main:app --host 0.0.0.0 --port 10000        │  │
│  │      │                                                   │  │
│  │      ├── FastAPI REST API (port 10000)                   │  │
│  │      │   └── /api/v1/* endpoints                        │  │
│  │      │                                                   │  │
│  │      └── APScheduler (background thread)                │  │
│  │          └── 8 autonomous pipeline stages               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Persistent Disk (optional)                                     │
│  Environment Variables (from Render dashboard)                  │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼ postgresql+asyncpg://
┌─────────────────────────────────┐
│   Supabase Managed PostgreSQL   │
│   + JWKS Auth Endpoint          │
└─────────────────────────────────┘
```

---

## 🐳 Docker Configuration

### Dockerfile Overview

The backend uses a multi-stage Docker build:

1. **Stage 1**: Python 3.11 slim base, installs all `requirements.txt` dependencies
2. **Stage 2**: Installs Playwright with Chromium + required OS dependencies (`--with-deps`)
3. **entrypoint.sh**: Runs database verification, then starts uvicorn

```bash
# Build image locally (for testing)
docker build -t coldscout-backend .

# Run locally (requires .env file)
docker run --env-file .env -p 8000:10000 coldscout-backend
```

### docker-compose.yml (Local Development)

The included `docker-compose.yml` spins up:
- **PostgreSQL 14** — local database (port 5432)
- **Backend API** — FastAPI server (port 8000)

```bash
# Start full local stack
docker-compose up --build

# Stop
docker-compose down

# Stop and remove volumes (wipes local DB)
docker-compose down -v
```

---

## 🚀 Deploying to Render

### Step 1: Create a Render Account

Sign up at [render.com](https://render.com) and connect your GitHub account.

### Step 2: Create a New Web Service

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository
3. Configure:

| Setting | Value |
|---------|-------|
| **Name** | `coldscout-api` (or your choice) |
| **Root Directory** | `backend` |
| **Environment** | `Docker` |
| **Region** | Closest to target market (e.g., `Singapore` for Asia) |
| **Branch** | `main` |
| **Instance Type** | `Starter` ($7/mo) or higher for production |

### Step 3: Configure Build Settings

Render detects the `Dockerfile` automatically. Verify:

- **Dockerfile Path**: `backend/Dockerfile`
- **Docker Context**: `backend/`

> **Important**: The Dockerfile installs Playwright and Chromium during build. This increases build time to ~5–8 minutes. This is expected behavior.

### Step 4: Configure Environment Variables

In Render dashboard → **Environment → Environment Variables**, add all required variables:

```
# Security
APP_ENV=production
APP_SECRET_KEY=<generate with scripts/generate_secrets.py>
API_KEY=<generate with scripts/generate_secrets.py>
SECURITY_SALT=<generate with scripts/generate_secrets.py>
BACKEND_CORS_ORIGINS=https://your-vercel-domain.vercel.app,https://coldscout.colddsam.com
APP_URL=https://your-backend.onrender.com
IMAGE_BASE_URL=https://your-backend.onrender.com

# Database
DATABASE_URL=postgresql+asyncpg://postgres:PASSWORD@db.SUPABASE_REF.supabase.co:5432/postgres
SUPABASE_URL=https://SUPABASE_REF.supabase.co
SUPABASE_ANON_KEY=eyJ0eXAiOiJKV1Q...

# AI
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.1-8b-instant
GOOGLE_PLACES_API_KEY=AIzaSy...

# Email
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=your@email.com
BREVO_SMTP_PASSWORD=xsmtpsib-...
FROM_EMAIL=outreach@yourdomain.com
FROM_NAME=Cold Scout
REPLY_TO_EMAIL=replies@yourdomain.com
BREVO_WEBHOOK_SECRET=your_webhook_secret
EMAIL_SEND_INTERVAL_SECONDS=30

# Tracking
IMAP_HOST=imap.gmail.com
IMAP_USER=your@gmail.com
IMAP_PASSWORD=xxxx xxxx xxxx xxxx

# Notifications
ADMIN_EMAIL=admin@yourdomain.com
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=987654321

# Scheduling
PRODUCTION_STATUS=RUN
DISCOVERY_HOUR=9
QUALIFICATION_HOUR=10
PERSONALIZATION_HOUR=11
OUTREACH_HOUR=12
REPORT_HOUR=20
REPORT_MINUTE=0

# Billing
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
```

### Step 5: Health Check Configuration

In Render dashboard → **Settings → Health & Alerts**:

| Setting | Value |
|---------|-------|
| **Health Check Path** | `/api/v1/health` |
| **Health Check Timeout** | `30` seconds |

This endpoint is public (no auth required) and returns `{"status": "ok"}` when the service is running.

### Step 6: Deploy

Click **"Create Web Service"**. Render will:
1. Pull your repository
2. Build the Docker image (5–8 min)
3. Run `entrypoint.sh` which initializes the database
4. Start uvicorn on port 10000
5. Mark the service as live once the health check passes

> **Auto-Deploy**: Every push to `main` automatically triggers a new deployment.

---

## 🗄️ Database Setup (Post-Deploy)

After your first Render deploy, run database initialization from your local machine:

```bash
# Make sure your local .env points to production DATABASE_URL

# 1. Create all tables
python scripts/create_tables.py

# 2. Seed the admin user
python scripts/seed_admin.py

# 3. Verify everything is working
python scripts/check_db.py
```

### Running Alembic Migrations

For schema changes after initial deployment:

```bash
# Generate a new migration
alembic revision --autogenerate -m "description_of_change"

# Apply migration to production
python scripts/run_alembic.py
# OR
alembic upgrade head
```

> **Render Jobs**: For production migrations, you can use Render's one-off job feature to run `alembic upgrade head` in a container without downtime.

---

## ⏰ Keep-Alive Configuration

Render free/starter tier services can go to sleep after 15 minutes of inactivity. The pipeline stages run at specific hours — a sleeping service will miss them.

**Solution 1: cron-job.org** (Recommended for free tier)

```bash
# Register a keep-alive ping with cron-job.org
python scripts/setup_cronjob.py
```

This creates a cron job that pings `GET /api/v1/health` every 5 minutes.

**Solution 2: Render Paid Tier**

Upgrade to a **Standard** instance ($25/mo) which has always-on containers with no sleep.

---

## 📊 Monitoring & Logs

### Render Dashboard

- **Logs**: Render dashboard → **"Logs"** tab — real-time loguru output
- **Metrics**: CPU, Memory, and request rate in the **"Metrics"** tab
- **Events**: Deployment history and health check events

### GitHub Actions Health Check

The repository includes `.github/workflows/pipeline-health-check.yml` which:
- Runs daily on a schedule
- Pings your backend health endpoint
- Reports failures via GitHub notifications

### Telegram Alerts

The backend sends Telegram notifications for:
- New leads discovered (count + preview)
- Pipeline stage completions
- Critical errors and exceptions
- Daily summary report

---

## 🔒 Security Configuration

### CORS

```python
# In .env:
BACKEND_CORS_ORIGINS=https://coldscout.colddsam.com,https://your-backup.vercel.app
```

Only the explicitly listed origins can make browser requests. Never use `*` in production.

### API Key Authentication

All private endpoints (`/api/v1/auth/`, `/api/v1/leads/`, etc.) require:

```http
X-API-Key: your_api_key
```

The key is injected server-side by the frontend proxy — never exposed to the browser.

### JWT Verification

The backend verifies user JWTs in two modes:
1. **ES256** — Fetches Supabase JWKS endpoint dynamically (production standard)
2. **HS256** — Fallback using `SUPABASE_ANON_KEY` (legacy compatibility)

---

## 🛠 Troubleshooting

| Issue | Resolution |
|-------|-----------|
| Build fails with Playwright error | Ensure Dockerfile has `playwright install chromium --with-deps` |
| `asyncpg` connection error | Verify `postgresql+asyncpg://` (not `postgresql://`) in `DATABASE_URL` |
| CORS errors from frontend | Add exact frontend domain to `BACKEND_CORS_ORIGINS` |
| Pipeline not running | Check `PRODUCTION_STATUS=RUN` and verify jobs are active in dashboard |
| JWT verification failing | Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct |
| Database tables missing | Run `python scripts/create_tables.py` locally against production DB |
| Service sleeping (Render free) | Set up cron-job.org keep-alive (Step: Keep-Alive Configuration) |

---

## 📋 Pre-Deployment Checklist

```
Backend Production Checklist:

  ✅ APP_ENV=production set
  ✅ DATABASE_URL uses postgresql+asyncpg:// protocol
  ✅ BACKEND_CORS_ORIGINS set to exact frontend domain(s)
  ✅ API_KEY is cryptographically random (use generate_secrets.py)
  ✅ GROQ_API_KEY provisioned and tested
  ✅ GOOGLE_PLACES_API_KEY restricted to Places API
  ✅ Brevo SMTP credentials verified
  ✅ IMAP App Password configured (not account password)
  ✅ Telegram bot created and CHAT_ID confirmed
  ✅ RAZORPAY using live keys (not test keys)
  ✅ Database tables created via create_tables.py
  ✅ Admin user seeded via seed_admin.py
  ✅ PRODUCTION_STATUS=RUN
  ✅ Health check passes at /api/v1/health
  ✅ cron-job.org keep-alive configured
```

---

<div align="center">

*For full-stack deployment including frontend and database, see the root [DEPLOYMENT.md](../DEPLOYMENT.md)*

</div>
