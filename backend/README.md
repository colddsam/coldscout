<div align="center">

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 100" width="800" height="100">
  <defs>
    <linearGradient id="bg2" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#0d0d0d;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1a1a1a;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="800" height="100" fill="url(#bg2)" rx="10"/>
  <text x="400" y="40" font-family="monospace" font-size="13" fill="#444444" text-anchor="middle">⚙️  COLD SCOUT</text>
  <text x="400" y="65" font-family="Inter, system-ui, sans-serif" font-size="28" font-weight="700" fill="#ffffff" text-anchor="middle">Backend Service</text>
  <text x="400" y="88" font-family="monospace" font-size="12" fill="#555555" text-anchor="middle">FastAPI · PostgreSQL · APScheduler · Groq AI · Playwright</text>
</svg>

<br/>

[![Python](https://img.shields.io/badge/Python-3.11+-000000?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-000000?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0-000000?style=for-the-badge&logo=python&logoColor=white)](https://sqlalchemy.org)
[![Groq](https://img.shields.io/badge/Groq-Llama_3-000000?style=for-the-badge)](https://groq.com)
[![Playwright](https://img.shields.io/badge/Playwright-1.48-000000?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev)

</div>

---

## 📖 Overview

The **Cold Scout Backend** is an autonomous FastAPI application serving as the AI brain of the lead generation system. It manages:

- A **REST API** consumed by the React dashboard
- An **APScheduler-driven pipeline** that runs 8 autonomous stages daily
- Integration with **Groq AI**, **Google Places**, **Playwright**, **Brevo SMTP**, and **Razorpay**
- A **PostgreSQL database** (via Supabase) with async SQLAlchemy 2.0

> **API Documentation**: Available at `http://localhost:8000/docs` (Swagger UI) and `http://localhost:8000/redoc` (ReDoc)

---

## 📁 Directory Structure

```
backend/
│
├── app/                            ← FastAPI application package
│   ├── main.py                     ← Entry point: lifespan, CORS, router mount
│   ├── config.py                   ← Pydantic settings (env-driven)
│   │
│   ├── api/                        ← HTTP route handlers
│   │   ├── deps.py                 ← Shared dependencies (API key auth, DB session)
│   │   ├── router.py               ← Public/private router aggregation
│   │   └── v1/                     ← Versioned API endpoints
│   │       ├── auth.py             ← User sync & authentication
│   │       ├── billing.py          ← Razorpay order & subscription management
│   │       ├── campaigns.py        ← Campaign CRUD operations
│   │       ├── health.py           ← System health check
│   │       ├── leads.py            ← Lead lifecycle management
│   │       ├── payments.py         ← Payment verification & webhook
│   │       ├── pipeline.py         ← Pipeline stage triggers & status
│   │       ├── reports.py          ← Daily analytics reports
│   │       ├── threads.py          ← Meta Threads social outreach
│   │       ├── tracking.py         ← Email pixel tracking (public)
│   │       ├── unsubscribe.py      ← One-click unsubscribe (public)
│   │       └── webhooks.py         ← Brevo email event webhooks (public)
│   │
│   ├── core/                       ← Infrastructure & cross-cutting concerns
│   │   ├── database.py             ← Async SQLAlchemy engine & session factory
│   │   ├── job_manager.py          ← jobs_config.json reader & state machine
│   │   ├── locks.py                ← PostgreSQL advisory locks (prevents double-run)
│   │   ├── redis_client.py         ← Optional Redis client (future Celery support)
│   │   ├── scheduler.py            ← APScheduler setup with 60s config sync heartbeat
│   │   └── security.py             ← JWT verification (ES256 Supabase + HS256 legacy)
│   │
│   ├── models/                     ← SQLAlchemy ORM table definitions
│   │   ├── base.py                 ← DeclarativeBase
│   │   ├── user.py                 ← User, role, plan, Supabase ID
│   │   ├── lead.py                 ← Lead (central entity) + SearchHistory
│   │   ├── campaign.py             ← Campaign + EmailOutreach
│   │   ├── email_event.py          ← Open / click / bounce / reply events
│   │   ├── subscription.py         ← Razorpay subscription state
│   │   ├── daily_report.py         ← Aggregated daily pipeline metrics
│   │   ├── prompt_config.py        ← Dynamic ICP prompt configuration
│   │   └── threads.py              ← Threads social prospect model
│   │
│   ├── modules/                    ← Business logic — modular pipeline engines
│   │   ├── analytics/
│   │   │   └── performance_analyzer.py   ← Funnel metric calculations
│   │   ├── billing/
│   │   │   └── razorpay_client.py        ← Order creation, signature verification
│   │   ├── discovery/
│   │   │   ├── google_places.py          ← Places API client, deduplication
│   │   │   └── scraper.py                ← Playwright contact extraction
│   │   ├── enrichment/
│   │   │   ├── competitor_finder.py      ← Competitor business analysis
│   │   │   └── website_content_extractor.py ← Deep website content extraction
│   │   ├── notifications/
│   │   │   ├── telegram_bot.py           ← Telegram alert sender
│   │   │   └── whatsapp_bot.py           ← WhatsApp via CallMeBot
│   │   ├── outreach/
│   │   │   ├── email_sender.py           ← aiosmtplib SMTP with throttling
│   │   │   └── followup_engine.py        ← Multi-step follow-up sequences
│   │   ├── personalization/
│   │   │   ├── groq_client.py            ← Groq AI wrapper (Llama 3)
│   │   │   ├── email_generator.py        ← Jinja2 HTML email rendering
│   │   │   ├── pdf_generator.py          ← Proposal PDF (ReportLab/WeasyPrint)
│   │   │   ├── proposal_xlsx_generator.py ← Prospect data XLSX export
│   │   │   └── templates/
│   │   │       └── email_html.j2         ← Branded email HTML template
│   │   ├── qualification/
│   │   │   ├── scorer.py                 ← ICP scoring logic (Groq AI)
│   │   │   ├── social_checker.py         ← Social media signal extraction
│   │   │   └── website_checker.py        ← Website quality assessment
│   │   ├── reporting/
│   │   │   ├── email_reporter.py         ← Daily report email sender
│   │   │   └── excel_builder.py          ← Report XLSX construction
│   │   ├── threads/
│   │   │   ├── client.py                 ← Meta Threads API client
│   │   │   ├── discovery.py              ← Threads lead discovery
│   │   │   ├── engagement.py             ← Post engagement logic
│   │   │   ├── qualifier.py              ← Threads lead qualification
│   │   │   ├── rate_limiter.py           ← API rate limit management
│   │   │   └── token_manager.py          ← OAuth token lifecycle
│   │   └── tracking/
│   │       ├── pixel_tracker.py          ← Email open pixel endpoint
│   │       ├── reply_classifier.py       ← AI intent classification
│   │       └── reply_tracker.py          ← IMAP inbox polling
│   │
│   ├── schemas/                    ← Pydantic v2 request/response models
│   │   ├── billing.py
│   │   ├── campaign.py
│   │   ├── lead.py
│   │   ├── report.py
│   │   └── user.py
│   │
│   └── tasks/                      ← Background pipeline orchestration
│       ├── daily_pipeline.py       ← 8-stage daily lead gen pipeline
│       ├── threads_pipeline.py     ← Threads social outreach pipeline
│       ├── billing_tasks.py        ← Subscription expiry management
│       └── celery_app.py           ← Celery config (preserved, not active)
│
├── config/
│   └── jobs_config.json            ← Dynamic scheduler configuration
│
├── migrations/                     ← Alembic migration files
│   ├── env.py
│   └── script.py.mako
│
├── scripts/                        ← Administrative utility scripts
│   ├── api_tester.py               ← Manual API endpoint testing
│   ├── check_db.py                 ← Database connectivity check
│   ├── check_secrets.py            ← Environment variable validation
│   ├── create_tables.py            ← Database schema initialization
│   ├── generate_secrets.py         ← Cryptographic key generation
│   ├── get_users.py                ← User listing utility
│   ├── manual_trigger.py           ← Manual pipeline stage trigger
│   ├── run_alembic.py              ← Alembic migration runner
│   ├── seed_admin.py               ← Admin user seeder
│   ├── seed_targets.py             ← International discovery target seeder
│   └── setup_cronjob.py            ← cron-job.org registration
│
├── static/                         ← Static file assets (logos, favicons)
│   ├── coldscoutlogo.png
│   ├── favicon.png
│   └── logo.png
│
├── tests/                          ← Pytest test suite
│   ├── conftest.py                 ← Fixtures and test configuration
│   ├── test_01_api_health.py
│   ├── test_02_database_operations.py
│   ├── test_03_discovery_module.py
│   ├── test_04_daily_pipeline.py
│   ├── test_05_e2e_scenarios.py
│   ├── test_06_followup_engine.py
│   ├── test_07_reply_classifier.py
│   ├── test_08_enrichment_modules.py
│   ├── test_09_pipeline_api.py
│   └── test_10_leads_api.py
│
├── alembic.ini                     ← Alembic configuration
├── Dockerfile                      ← Multi-stage Docker build
├── docker-compose.yml              ← Local PostgreSQL + Backend stack
├── entrypoint.sh                   ← Container startup script
├── pytest.ini                      ← Test configuration
├── requirements.txt                ← Python dependencies
├── README.md                       ← This file
└── DEPLOYMENT.md                   ← Backend deployment guide
```

---

## 🏗 Application Architecture

### Request Lifecycle

```
HTTP Request
    │
    ▼
CORSMiddleware (validates origin against BACKEND_CORS_ORIGINS)
    │
    ▼
FastAPI Router (/api/v1/...)
    │
    ├── Public Routes (no auth)
    │   ├── GET  /health              ← System health
    │   ├── GET  /track/pixel/{id}    ← Email open pixel
    │   ├── POST /webhooks/brevo      ← Brevo events
    │   ├── GET  /unsubscribe/{token} ← One-click unsubscribe
    │   └── GET  /threads/...         ← Threads public endpoints
    │
    └── Private Routes (X-API-Key required)
        ├── /auth/...                 ← User sync
        ├── /leads/...                ← Lead management
        ├── /campaigns/...            ← Campaign CRUD
        ├── /pipeline/...             ← Pipeline control
        ├── /reports/...              ← Analytics
        ├── /billing/...              ← Razorpay billing
        └── /threads/...              ← Threads private
```

### Core Modules Flow

```mermaid
graph LR
    subgraph "API Layer"
        A[Route Handler] --> B[Pydantic Schema Validation]
        B --> C[DB Session Injection]
    end

    subgraph "Business Logic"
        C --> D[Module: Discovery]
        C --> E[Module: Qualification]
        C --> F[Module: Personalization]
        C --> G[Module: Outreach]
    end

    subgraph "Infrastructure"
        D --> H[(PostgreSQL)]
        E --> I[Groq AI]
        F --> J[Jinja2 Templates]
        G --> K[Brevo SMTP]
    end

    subgraph "Background"
        L[APScheduler] --> M[Pipeline Tasks]
        M --> D
        M --> E
        M --> F
        M --> G
    end
```

---

## 🗄️ Database Models

### Lead Lifecycle State Machine

```
                    ┌─────────────┐
                    │  discovered │  ← Google Places API inserts here
                    └──────┬──────┘
                           │ Playwright scrapes website
                           ▼
              ┌────────────────────────┐
              │   Groq AI evaluates   │
              │   qualification score │
              └────┬───────────┬──────┘
                   │           │
              score ≥ 50   score < 50
              has email      or no contact
                   │           │
                   ▼           ▼
            ┌──────────┐  ┌──────────┐
            │qualified │  │ rejected │
            └──────┬───┘  └──────────┘
                   │
            score ≥ 50
            phone only
                   │
                   ▼
         ┌─────────────────┐
         │ phone_qualified │ ← WhatsApp alert to admin
         └─────────────────┘
                   │
            AI generates
            email content
                   │
                   ▼
         ┌──────────────────┐
         │ queued_for_send  │
         └────────┬─────────┘
                  │
            Brevo SMTP delivery
                  │
                  ▼
         ┌──────────────────┐
         │      sent        │
         └────────┬─────────┘
                  │
         Tracking pixel fires
                  │
                  ▼
         ┌──────────────────┐
         │     opened       │
         └────────┬─────────┘
                  │
         IMAP reply detected
                  │
                  ▼
         ┌──────────────────┐
         │     replied      │ ← Intent classified: positive/negative/OOO
         └──────────────────┘
```

### Key Models Reference

| Model | Table | Key Fields |
|-------|-------|-----------|
| `User` | `users` | `id`, `email`, `role`, `plan`, `supabase_id` |
| `Lead` | `leads` | `place_id`, `email`, `phone`, `country`, `country_code`, `region`, `city`, `sub_area`, `postal_code`, `latitude`, `longitude`, `qualification_score`, `status` |
| `SearchHistory` | `search_history` | `country`, `country_code`, `region`, `city`, `sub_area`, `category`, `location_depth`, `results_count`, `created_at` |
| `Campaign` | `campaigns` | `name`, `status`, `target_city`, `target_category` |
| `EmailOutreach` | `email_outreaches` | `lead_id`, `campaign_id`, `subject`, `body_html`, `tracking_id`, `status` |
| `EmailEvent` | `email_events` | `outreach_id`, `event_type` (open/click/bounce/reply) |
| `Subscription` | `subscriptions` | `user_id`, `plan`, `razorpay_sub_id`, `expires_at` |
| `DailyReport` | `daily_reports` | `report_date`, `discovered`, `qualified`, `sent`, `opened`, `replied` |
| `PromptConfig` | `prompt_configs` | `system_prompt`, `qualification_criteria` |

---

## 🔌 API Endpoints Reference

### Auth (`/api/v1/auth/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sync` | Sync Supabase user to local DB, return role + plan |
| `GET` | `/me` | Get current authenticated user profile |
| `PATCH` | `/me` | Update user profile |

### Leads (`/api/v1/leads/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | List leads (paginated, filterable by status, country, region, city, category) |
| `GET` | `/{lead_id}` | Get single lead with full detail |
| `PATCH` | `/{lead_id}` | Update lead status or fields |
| `DELETE` | `/{lead_id}` | Soft-delete a lead |
| `GET` | `/stats` | Aggregated lead statistics |

### Campaigns (`/api/v1/campaigns/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | List all campaigns |
| `POST` | `/` | Create a new campaign |
| `GET` | `/{campaign_id}` | Get campaign detail + metrics |
| `PATCH` | `/{campaign_id}` | Update campaign |
| `DELETE` | `/{campaign_id}` | Delete campaign |

### Pipeline (`/api/v1/pipeline/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/status` | Current pipeline stage statuses |
| `POST` | `/run/{stage}` | Manually trigger a stage |
| `GET` | `/jobs` | List all scheduler jobs |
| `PATCH` | `/jobs/{job_id}` | Update job config (hour, active state) |

### Billing (`/api/v1/billing/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/create-order` | Create Razorpay payment order |
| `POST` | `/verify-payment` | Verify payment signature, activate plan |
| `GET` | `/subscription` | Get current subscription status |
| `POST` | `/webhook` | Razorpay webhook event handler |

### Reports (`/api/v1/reports/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/daily` | Daily pipeline metrics |
| `GET` | `/funnel` | Conversion funnel analytics |
| `GET` | `/export` | Download XLSX analytics report |

### Tracking (Public, no auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/track/pixel/{tracking_id}` | Email open tracking pixel |

### Webhooks (Public, HMAC validated)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/webhooks/brevo` | Brevo email events (open, click, bounce) |

---

## 🔄 Pipeline Stages Deep-Dive

### Stage 1: Discovery (`run_discovery_stage`)
- Generates international targets via Groq AI with full location hierarchy (country → region → city → sub_area)
- Queries Google Places API with `regionCode` and `locationBias` for precise geographic scoping
- Paginated fetching: up to 60 results per location-category pair via `nextPageToken`
- Extracts structured geo data (country, region, postal code, lat/lng) from `addressComponents`
- Deduplicates by `place_id` AND `email` (prevents re-discovery of known contacts)
- Configurable via `DISCOVERY_COUNTRY_FOCUS`, `DISCOVERY_DEPTH`, `DISCOVERY_TARGET_COUNT`, `DISCOVERY_MAX_PAGES`
- Inserts new `Lead` records with status `discovered` and full international location data
- Sends Telegram alert with count of new leads

### Stage 2: Scraping / Qualification (`run_qualification_stage`)
- Fetches all `discovered` leads
- `Playwright` loads each lead's website in headless browser
- `scrape_contact_email()` extracts: emails, phones, social profiles
- Passes extracted content to `qualify_lead()` (Groq Llama 3)
- Lead scored 0–100 against ICP criteria
- Updates status: `qualified`, `phone_qualified`, or `rejected`

### Stage 3: Personalization (`run_personalization_stage`)
- Fetches all `qualified` leads
- `GroqClient` generates a unique, personalized cold email per lead
- `render_email_html()` wraps AI content in branded Jinja2 HTML template
- `generate_proposal_pdf()` creates a PDF proposal attachment
- `generate_proposal_xlsx()` creates a data sheet attachment
- Embeds 1×1 tracking pixel in email HTML
- Updates lead status to `queued_for_send`

### Stage 4: Outreach (`run_outreach_stage`)
- Fetches all `queued_for_send` leads
- Sends via `send_email()` using aiosmtplib + Brevo SMTP
- Throttles delivery at `EMAIL_SEND_INTERVAL_SECONDS` between sends
- Updates lead status to `sent`, records `EmailOutreach` row

### Stage 5: Follow-up (`run_followup_stage`)
- `followup_engine.py` identifies leads with no reply after configurable delay
- Generates follow-up variant emails
- Sends via same SMTP pipeline

### Stage 6: Reply Tracking (`run_tracking_stage`)
- `reply_tracker.py` polls IMAP inbox for new emails matching sent campaigns
- `reply_classifier.py` uses Groq AI to classify intent: positive / negative / out-of-office
- Updates `EmailEvent` and `Lead` status accordingly

### Stage 7: Reporting (`run_reporting_stage`)
- `excel_builder.py` generates comprehensive XLSX with all daily metrics
- `email_reporter.py` sends the report to `ADMIN_EMAIL`
- Creates `DailyReport` database record for dashboard analytics

### Scheduler Configuration

All stages are controlled via `config/jobs_config.json`. Each job has:

```json
{
  "job_id": {
    "active": true,
    "type": "cron",
    "hour": 9,
    "minute": 0,
    "description": "Stage description"
  }
}
```

The scheduler syncs this config every **60 seconds** — changes take effect without a restart.

---

## 🔐 Authentication Architecture

```
Request arrives with Authorization: Bearer <supabase_jwt>
          │
          ▼
security.py: verify_token()
          │
          ├── Try ES256 verification via Supabase JWKS endpoint
          │       └── Success → extract user_id, email
          │
          └── Fallback: HS256 verification with SUPABASE_ANON_KEY
                  └── Success → extract user_id, email

          │
          ▼
deps.py: get_current_user()
          │
          ▼
Query users table by supabase_id
          │
          ▼
Return User model (role, plan, is_active)
```

---

## ⚙️ Scheduler Architecture

```
APScheduler (AsyncIOScheduler, Asia/Kolkata timezone)
│
├── discovery_job          → run_discovery_stage()      [cron: DISCOVERY_HOUR:00]
├── qualification_job      → run_qualification_stage()  [cron: QUALIFICATION_HOUR:00]
├── personalization_job    → run_personalization_stage() [cron: PERSONALIZATION_HOUR:00]
├── outreach_job           → run_outreach_stage()        [cron: OUTREACH_HOUR:00]
├── followup_job           → run_followup_stage()        [cron: configurable]
├── tracking_job           → run_tracking_stage()        [interval: 30 min]
├── reporting_job          → run_reporting_stage()       [cron: REPORT_HOUR:REPORT_MINUTE]
├── threads_job            → run_threads_pipeline()      [cron: configurable]
├── billing_job            → check_subscription_expiry() [cron: daily]
└── sync_heartbeat         → sync_scheduler_config()     [interval: 60 sec]
```

**Advisory Locks**: Each pipeline stage acquires a PostgreSQL advisory lock before running, ensuring only one instance executes concurrently (safe for multi-replica deployments).

---

## 🧪 Running Tests

```bash
cd backend

# Activate virtual environment
source venv/bin/activate  # Windows: venv\Scripts\activate

# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_01_api_health.py -v

# Run with coverage
pytest tests/ --cov=app --cov-report=html

# Run only fast unit tests (skip integration)
pytest tests/ -v -m "not integration"
```

### Test Suite Coverage

| Test File | Coverage Area |
|-----------|--------------|
| `test_01_api_health.py` | Health endpoint, server readiness |
| `test_02_database_operations.py` | CRUD operations, session management |
| `test_03_discovery_module.py` | Google Places client, deduplication |
| `test_04_daily_pipeline.py` | Full pipeline stage orchestration |
| `test_05_e2e_scenarios.py` | Complete user journey scenarios |
| `test_06_followup_engine.py` | Follow-up sequence timing & content |
| `test_07_reply_classifier.py` | Intent classification accuracy |
| `test_08_enrichment_modules.py` | Scraping & enrichment extraction |
| `test_09_pipeline_api.py` | Pipeline REST endpoint contracts |
| `test_10_leads_api.py` | Leads CRUD endpoint contracts |

---

## 💻 Local Development Setup

### 1. Create Virtual Environment

```bash
python -m venv venv

# Activate:
source venv/bin/activate        # macOS/Linux
venv\Scripts\activate           # Windows
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
playwright install chromium
```

### 3. Configure Environment

```bash
cp ../.env.example .env
# Edit .env with your credentials
```

Minimum required for local development:

```env
APP_ENV=development
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/coldscout
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
API_KEY=any_local_key_for_testing
GROQ_API_KEY=your_groq_key
GOOGLE_PLACES_API_KEY=your_places_key
```

### 4. Initialize Database

```bash
# Create all tables
python scripts/create_tables.py

# Seed admin user
python scripts/seed_admin.py

# (Optional) Seed discovery targets
python scripts/seed_targets.py
```

### 5. Run the Server

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

API documentation available at: **http://localhost:8000/docs**

### Using Docker Compose (Alternative)

```bash
docker-compose up --build
```

This starts both the backend API and a local PostgreSQL instance.

---

## 🛠 Utility Scripts

| Script | Usage |
|--------|-------|
| `python scripts/check_db.py` | Verify database connectivity |
| `python scripts/check_secrets.py` | Validate all required env vars |
| `python scripts/generate_secrets.py` | Generate crypto keys for `.env` |
| `python scripts/manual_trigger.py` | Manually run a pipeline stage |
| `python scripts/api_tester.py` | Test API endpoints manually |
| `python scripts/get_users.py` | List all users in database |
| `python scripts/setup_cronjob.py` | Register cron-job.org health monitor |
| `python scripts/run_alembic.py` | Execute Alembic migrations |
| `python scripts/seed_targets.py` | Seed international discovery targets |

---

<div align="center">

*See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment instructions.*

</div>
