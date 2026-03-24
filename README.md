<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&height=200&section=header&text=AI%20Lead%20Generation%20System&fontSize=50&animation=twinkling" width="100%" />

  <a href="https://git.io/typing-svg"><img src="https://readme-typing-svg.demolab.com?font=Inter&weight=600&size=24&pause=1000&color=00A393&center=true&vCenter=true&width=600&lines=Automated.+Intelligent.+Scalable.;Discover.+Qualify.+Outreach.;Your+24%2F7+AI+Sales+Representative" alt="Typing SVG" /></a>

  <p>An enterprise-grade, end-to-end B2B lead generation pipeline. Discovers, deeply enriches, qualifies, and engages prospects via AI-driven outreach.</p>

  <p>
    <img src="https://img.shields.io/badge/Python-3.11+-blue.svg?style=for-the-badge&logo=python" alt="Python" />
    <img src="https://img.shields.io/badge/FastAPI-0.100+-00a393.svg?style=for-the-badge&logo=fastapi" alt="FastAPI" />
    <img src="https://img.shields.io/badge/React-18+-61DAFB.svg?style=for-the-badge&logo=react" alt="React" />
    <img src="https://img.shields.io/badge/PostgreSQL-Ready-336791.svg?style=for-the-badge&logo=postgresql" alt="PostgreSQL" />
    <img src="https://img.shields.io/badge/Docker-Ready-2496ED.svg?style=for-the-badge&logo=docker" alt="Docker" />
  </p>
</div>

---

## 📖 Table of Contents

- [Project Overview](#-project-overview)
- [System Architecture](#-system-architecture)
- [Prerequisites](#-prerequisites)
- [Local Development Setup](#-local-development-setup)
- [Environment Variables](#-environment-variables)
- [Deployment](#-deployment)
- [License](#-license)

---

## 🚀 Project Overview

**The AI Lead Generation System** completely automates the traditional sales development lifecycle. By utilizing a distributed architecture and LLM-powered qualification, this platform acts as a tireless, fully autonomous SDR (Sales Development Representative).

### Key Features
1. **🔍 Organic Discovery**: Leverages Google Places to find local businesses matching specific search parameters.
2. **🧠 AI Qualification**: Scrapes company websites and uses Llama 3 (via Groq) to qualify leads against a strict Ideal Customer Profile (ICP).
3. **✉️ Hyper-Personalization**: Analyzes prospect data to generate highly customized, non-generic outreach emails.
4. **📊 Real-time Dashboard**: A sleek React-based control center to manage campaigns, monitor automation jobs, and track conversion metrics.
5. **🤖 Smart Notifications**: Integrated Telegram bot for real-time alerts on lead discovery, qualification successes, and system health.
6. **🚀 Automated Monitoring**: Proactive GitHub Actions and `cron-job.org` integration to ensure 24/7 uptime and pipeline reliability.
7. **🛡️ Scalable Backend**: Built on FastAPI and PostgreSQL with `async` database connectivity for high-throughput web scraping.

---

## 🏗 System Architecture

The workflow is orchestrated via an asynchronous pipeline with robust state management.

```mermaid
graph TD;
    subgraph "Frontend Layer"
        UI[Admin Dashboard <br> React + Vite + Tailwind] 
    end

    subgraph "Backend API Layer"
        UI -- REST API --> API[FastAPI Server]
        API <--> DB[(PostgreSQL Database)]
        API -.-> Cron[APScheduler]
    end

    subgraph "Automation Pipeline (Daily)"
        Cron ==> |Triggers at 9 AM| Pipeline
        Pipeline --> |1| Search[Google Places API]
        Search --> |2| Scrape[Playwright Engine]
        Scrape --> |3| Qualify[Groq AI / Llama 3]
        Qualify --> |4| Email[Groq AI Personalized Copy]
        Email --> |5| SMTP[Brevo / SMTP Server]
    end
```

---

## 🛠 Prerequisites

Before starting, ensure your system has the following installed:
- **Python 3.11+**
- **Node.js 18+** & **npm/yarn**
- **PostgreSQL 14+** (if running locally without Docker)
- **Docker & Docker Compose** (highly recommended for deployment)

---

## 💻 Local Development Setup

To run the complete system locally, follow these steps meticulously.

### 1. Backend Setup (FastAPI)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/colddsam/coldscout.git
   cd coldscout
   ```

2. **Set up the Python Virtual Environment:**
   ```bash
   python -m venv venv
   # Windows:
   venv\Scripts\activate
   # macOS/Linux:
   source venv/bin/activate
   ```

3. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt
   playwright install chromium
   ```

4. **Initialize Database & Create Admin:**
   Make sure you have configured your `.env` (see Environment Variables section).
   ```bash
   python scripts/create_tables.py
   python scripts/seed_admin.py
   ```
   *(Save the generated admin credentials to log into the dashboard).*

5. **Start the Development Server:**
   ```bash
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```
   *API is available at: `http://localhost:8000/docs`*

### 2. Frontend Setup (React Dashboard)

1. **Open a new terminal window** and navigate to the frontend folder:
   ```bash
   cd frontend/localleadpro-dashboard
   ```

2. **Install Node Modules:**
   ```bash
   npm install
   ```

3. **Configure Frontend Environment:**
   Create a `.env` block in `frontend/localleadpro-dashboard/`:
   ```env
   VITE_PROXY_URL=http://localhost:8000
   ```

4. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   *Dashboard is available at: `http://localhost:5173`*

---

## 🔐 Environment Variables

To run the system, you must populate your `.env` file with these keys. 

> [!TIP]
> **Need help finding these keys?** Follow our [**Step-by-Step API Key Acquisition Guide**](./DEPLOYMENT.md#-mastering-api-keys--secrets-100-free-way) to get everything for free.

```ini
# --- Core Application ---
APP_ENV=production
APP_SECRET_KEY=generate_a_secure_random_string
API_KEY=your_secure_api_key
SECURITY_SALT=generate_a_secure_random_salt
APP_URL=https://your-app-url.onrender.com
IMAGE_BASE_URL=https://your-cdn.com/logo.png
PRODUCTION_STATUS=RUN  # Set to HOLD to pause the pipeline
BACKEND_CORS_ORIGINS=http://localhost:3000,http://localhost:5173,https://your-app.vercel.app

# --- Admin & Security ---
ADMIN_EMAIL=admin@domain.com
INITIAL_ADMIN_PASSWORD=your_secure_password
VITE_API_KEY=your_secure_api_key  # Must match API_KEY

# --- Database & Storage ---
DATABASE_URL=postgresql+asyncpg://user:password@host:5432/postgres
SUPABASE_URL=https://your-ref.supabase.co
SUPABASE_ANON_KEY=your_anon_key
REDIS_URL=  # Optional: only for Celery horizontal scaling

# --- AI Models ---
GROQ_API_KEY=gsk_your_key
GROQ_MODEL=llama-3.1-8b-instant
GOOGLE_PLACES_API_KEY=AIza_your_key

# --- Email (SMTP & IMAP) ---
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=your_smtp_user
BREVO_SMTP_PASSWORD=your_smtp_password
FROM_EMAIL=sender@domain.com
FROM_NAME="Lead Gen System"
REPLY_TO_EMAIL=replies@domain.com
IMAP_HOST=imap.gmail.com
IMAP_USER=your_email@gmail.com
IMAP_PASSWORD=your_gmail_app_password

# --- Alerts & Automation ---
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
WHATSAPP_NUMBER=+91XXXXXXXXXX
CALLMEBOT_API_KEY=your_callmebot_key
CRON_JOB_API_KEY=your_cron_job_api_key
RENDER_DEPLOY_HOOK=your_render_deploy_hook_url

# --- Scheduling (IST) ---
DISCOVERY_HOUR=6
QUALIFICATION_HOUR=7
PERSONALIZATION_HOUR=8
OUTREACH_HOUR=9
REPORT_HOUR=23
REPORT_MINUTE=30
EMAIL_SEND_INTERVAL_SECONDS=360

# --- Branding & Outreach ---
VITE_SITE_NAME="Local Lead Pro"
BOOKING_LINK=https://calendly.com/your-link
SENDER_ADDRESS="Your City, Your Country"
```

---

## 🚢 Deployment

Deploying the system is straightforward using Docker for the backend and static hosting for the frontend.

Please refer to the complete, step-by-step [**DEPLOYMENT.md**](./DEPLOYMENT.md) production guide. It contains visual, stage-by-stage instructions for deploying to **Supabase**, **Render**, and **Vercel**.

---

---

## 💖 Support the Project

If you find this project useful, please consider sponsoring its development. Your support helps maintain the infrastructure and add new features.

<a href="https://github.com/sponsors/colddsam">
  <img src="https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8ebb" alt="Sponsor" height="40">
</a>

---

<div align="center">
  <br />
  <em>Built with ❤️ for High-Performance B2B Sales Teams</em>
</div>
