# 🌍 Continuous Deployment Guide (Production)

This documentation provides an authoritative, structured approach to deploying the **Cold Scout - AI Lead Generation System** into a professional production environment. 

The architecture is built upon a highly scalable, decoupled modern stack:
1. **[Supabase](https://supabase.com/)** (Managed PostgreSQL Database)
2. **[Render](https://render.com/)** (Containerized FastAPI Backend)
3. **[Vercel](https://vercel.com/)** (Static React Dashboard)

---

## 🔑 External Service Provisioning

Deployment requires initialization of the following critical third-party service credentials.

### 🧩 1. Groq AI (Llama 3 Qualification Engine)
*Core requirement for Autonomous Lead Qualification & Email Synthesis.*

1. Navigate to the [Groq Cloud Console](https://console.groq.com/keys).
2. Authenticate the administrative account.
3. Provision a new API Key (`GROQ_API_KEY`).

---

### 📍 2. Google Places API (Target Acquisition)
*Core requirement to programmatically source local B2B targets.*

1. Access the [Google Cloud Console](https://console.cloud.google.com/).
2. Initialize a New Project for organizational tracking.
3. Enable the **Places API**.
4. Generate API Credentials from **APIs & Services > Credentials** (`GOOGLE_PLACES_API_KEY`).

---

### 🗄️ 3. Supabase (Database Layer)
*Core requirement for persistent state management, including leads, jobs, and historical tracking.*

1. Authenticate with [Supabase](https://supabase.com/).
2. Initialize a new PostgreSQL cluster.
3. Navigate to **Settings > Database** to retrieve the URI connection string.
4. **CRITICAL ARCHITECTURE NOTE**: Modify the protocol from `postgresql://` to `postgresql+asyncpg://` to support FastAPI's asynchronous driver.
5. Capture `SUPABASE_URL` and `SUPABASE_ANON_KEY` from **Settings > API**.

---

### ✉️ 4. SMTP Configuration (Outreach Pipeline)
*Core requirement for executing automated sales outreach.*

1. Authenticate with a dedicated SMTP provider (e.g., [Brevo](https://www.brevo.com/)).
2. Access the **SMTP & API** settings.
3. Generate a dedicated SMTP Key.
4. **Environment Variables Required**:
   - `BREVO_SMTP_HOST`
   - `BREVO_SMTP_PORT`
   - `BREVO_SMTP_USER`
   - `BREVO_SMTP_PASSWORD`
   - `FROM_EMAIL`
   - `FROM_NAME`

---

### 📤 5. IMAP Configuration (Inbound Processing)
*Core requirement for asynchronous reply tracking and intent categorization.*

1. Access the designated Google Workspace or Gmail administrative settings.
2. Ensure **2-Step Verification** is strictly enabled.
3. Provision an **App Password** designated for "Cold Scout".
4. Store the 16-character sequence as internal `IMAP_PASSWORD`.

---

### 🤖 6. Real-time Alerting Node
*Core requirement for critical system health monitoring and lead notifications.*

1. Provision a new Telegram Bot via **@BotFather**.
2. Capture the HTTP API Token (`TELEGRAM_BOT_TOKEN`).
3. Retrieve the Administrative User ID via **@userinfobot** (`TELEGRAM_CHAT_ID`).

---

### ⏰ 7. Service Keep-Alive 
*Ensures high availability across serverless or paused container constraints.*

1. Register infrastructure monitoring at [cron-job.org](https://cron-job.org).
2. Generate API Keys.
3. **Automated Initialization**:
   Execute the setup script locally to register the continuous endpoint polling.
   ```bash
   python scripts/setup_cronjob.py
   ```

---

### 🛡️ 8. Cryptographic Secret Generation
*Core requirement for securely hashing application state and API authentication.*

Execute the internal secret generator to produce cryptographically sound hex strings for session salts:
```bash
python scripts/generate_secrets.py
```

---

## ⚙️ Master Environment Variable Reference

Strict alignment of these 42 parameters is required across both rendering and application environments.

| Category | Key | Description |
| :--- | :--- | :--- |
| **Security** | `APP_ENV` | `production` or `development` |
| | `APP_SECRET_KEY` | Hexadecimal sequence for session salting |
| | `API_KEY` | System-level authentication key |
| | `SECURITY_SALT` | Encrypted fallback hash |
| | `BACKEND_CORS_ORIGINS` | Comma-delimited list of permitted domains |
| | `APP_URL` | Application root URL |
| | `IMAGE_BASE_URL` | CDN asset distribution link |
| | `VITE_API_KEY` | React proxy authentication matching `API_KEY` |
| **Database** | `DATABASE_URL` | Asyncpg-enabled PostgreSQL URI |
| | `SUPABASE_URL` | Host URL |
| | `SUPABASE_ANON_KEY` | Public access key |
| **AI Processing** | `GROQ_API_KEY` | Llama 3 operational key |
| | `GROQ_MODEL` | Default configuration: `llama-3.1-8b-instant` |
| | `GOOGLE_PLACES_API_KEY` | Maps API operational key |
| **Outreach** | `BREVO_SMTP_HOST` | Delivery relay host |
| | `BREVO_SMTP_PORT` | Delivery port allocation |
| | `BREVO_SMTP_USER` | Authenticated proxy user |
| | `BREVO_SMTP_PASSWORD` | App-specific password |
| | `FROM_EMAIL` | Whitelisted transmitter address |
| | `FROM_NAME` | Campaign sender display parameter |
| | `REPLY_TO_EMAIL` | Redirect domain address |
| **Tracking** | `IMAP_HOST` | Inbound synchronization host |
| | `IMAP_USER` | Target mailbox |
| | `IMAP_PASSWORD` | App-specific synchronization proxy |
| **Alerts** | `ADMIN_EMAIL` | Primary system administrator |
| | `TELEGRAM_BOT_TOKEN` | Provisioned broadcast token |
| | `TELEGRAM_CHAT_ID` | Administrative destination ID |
| | `WHATSAPP_NUMBER` | Escalated alert destination |
| | `CALLMEBOT_API_KEY` | Third-party routing integration |
| **Automation** | `PRODUCTION_STATUS` | `RUN` dictates active polling |
| | `CRON_JOB_API_KEY` | Uptime validation key |
| | `RENDER_DEPLOY_HOOK` | Continuous operational trigger |
| **Scheduling** | `DISCOVERY_HOUR` | Data acquisition interval parameter |
| | `QUALIFICATION_HOUR` | Generative processing interval parameter |
| | `PERSONALIZATION_HOUR`| Outreach compilation parameter |
| | `OUTREACH_HOUR` | SMTP dispatch parameter |
| | `REPORT_HOUR` | Analytics aggregation execution |
| | `REPORT_MINUTE` | Analytics minute execution |
| | `EMAIL_SEND_INTERVAL_SECONDS` | Throttle buffer limit |
| **Branding** | `VITE_SITE_NAME` | Client-facing presentation name |
| | `BOOKING_LINK` | Calendering scheduling parameter |
| | `SENDER_ADDRESS` | Regulatory compliance geographic address |

---

## 🚀 Deployment Orchestration

### 1. Database Tier (Supabase)
Provision the PostgreSQL deployment. Extract all URIs securely and enforce `+asyncpg` typing.

### 2. Backend API Tier (Render)
Provision a primary Web Service. Select the Docker runtime environment. Map the environment reference chart linearly to the Render deployment matrix.

### 3. Frontend Presentation Tier (Vercel)
Provision the React dashboard (`frontend/localleadpro-dashboard`). Inject the required `VITE_PROXY_URL` and `VITE_API_KEY` to successfully authorize requests against the newly provisioned Render backend.

---

## 🌐 Security Architecture Note

The frontend presentation tier interfaces strictly with the REST API. The developmental Node.js proxy (`server/index.ts`) is exclusively architected to bypass browser CORS pre-flights in isolated local environments. Production rollouts must configure `VITE_PROXY_URL` to route dynamically to the designated external API service layer.
