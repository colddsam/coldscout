<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&height=200&section=header&text=AI%20Lead%20Generation%20System&fontSize=50&animation=twinkling" width="100%" />

  <a href="https://git.io/typing-svg"><img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=24&pause=1000&color=00A393&center=true&vCenter=true&width=600&lines=Automated.+Intelligent.+Scalable.;Discover.+Qualify.+Outreach.;24%2F7+AI+Sales+Representative" alt="Typing SVG" /></a>

<p>An end-to-end local business discovery, deep-enrichment, qualification, and multi-touchpoint AI outreach pipeline.</p>

<p>
    <img src="https://img.shields.io/badge/Python-3.11+-blue.svg" alt="Python Version" />
    <img src="https://img.shields.io/badge/FastAPI-0.100+-00a393.svg" alt="FastAPI" />
    <img src="https://img.shields.io/badge/APScheduler-In--Process_Jobs-37814A.svg" alt="APScheduler" />
    <img src="https://img.shields.io/badge/PostgreSQL-Database-336791.svg" alt="PostgreSQL" />
    <img src="https://img.shields.io/badge/Version-v2.0_Autonomous-8A2BE2.svg" alt="Version 2" />
    <img src="https://img.shields.io/badge/Status-Production_Ready-success.svg" alt="Status" />
  </p>
</div>

---

## 📖 Table of Contents

- [Why We Need This in the Modern Age](#-why-we-need-this-in-the-modern-age)
- [Project Overview](#-project-overview)
- [System Architecture](#-system-architecture)
- [Key Features](#-key-features)
- [Complete System Setup](#-complete-system-setup)
  - [Prerequisites](#1-prerequisites)
  - [Environment Variables](#2-environment-variables)
  - [Local Installation](#3-local-installation-recommended-for-development)
  - [Docker Setup](#docker-installation-recommended-for-production)
- [Running the System](#-running-the-system)
- [Automated Testing](#-automated-testing)
- [License](#-license)

---

## 🌍 Why We Need This in the Modern Age

In today's highly competitive digital landscape, B2B lead generation is often a manual, tedious, and error-prone process. Sales teams spend countless hours scraping directories, validating email addresses, researching company backgrounds, and writing generic outreach emails that result in low conversion rates.

**The AI Lead Generation System** shifts the paradigm. By leveraging Large Language Models (LLMs) and distributed background processing, this system acts as a persistent, tireless 24/7 sales development representative.

It autonomously:

1. **Discovers** niche local businesses completely organically.
2. **Scrapes & Qualifies** their websites to ensure they match your Ideal Customer Profile (ICP).
3. **Personalizes** outreach copy specifically tailored to the prospect's real-world business data.
4. **Executes** the campaign securely with built-in tracking.

---

## 🚀 Project Overview

<div align="center">
  <img src="https://skillicons.dev/icons?i=python,fastapi,postgres,redis,docker,githubactions" alt="Tech Stack" />
</div>

The project is built on a robust, asynchronous tech stack designed to handle high-throughput network operations:

- **Backend API:** `FastAPI` + `Uvicorn` for high-performance RESTful operations.
- **Task Scheduling:** `APScheduler` for lightweight, in-process asynchronous task execution (Optimized for free-tiers).
- **Database:** `PostgreSQL` via `SQLAlchemy (Async)` & `asyncpg` for non-blocking I/O.
- **Scraping Engine:** `Playwright` & `BeautifulSoup4` for deep web crawling.
- **AI Brain:** `Groq API` (Llama 3) for lightning-fast business qualification and personalized email generation.
- **Monitoring & Alerting:** `Loguru` for structured logging and `Telegram Bot API` for real-time pipeline notifications.
- **Document Generation:** Auto-populates business-specific `PDF Proposals` and `Excel` daily performance reports.

---

## 🏗 System Architecture

The workflow follows a directed acyclic pipeline running daily via `APScheduler`.

```mermaid
graph TD;
    subgraph "Schedule & Management"
        Cron[APScheduler] -->|Triggers Daily| Pipeline[Daily Pipeline Task]
        Pipeline -.->|Real-time System Alerts| Telegram[Telegram Bot]
    end

    subgraph "The AI Funnel"
        Pipeline -->|1. Find Targets| GooglePlaces[Google Places API]
        GooglePlaces -->|Return places| Scraper[Playwright Web Scraper]
      
        Scraper -->|Extract Text| AI_Qualify{Groq AI Qualification}
        AI_Qualify -- Rejected --> Drop[Discard Lead]
        AI_Qualify -- Approved --> DB[(PostgreSQL Database)]

        DB -->|Fetch Approved Leads| AI_Personalize[Groq AI Content Generator]
        AI_Personalize -->|Generate Context| PDFGen[PDF Proposal Generator]
        PDFGen --> EmailBuilder[Build HTML Email]
        EmailBuilder -->|Attach PDF| Mailer[Email Delivery System]
    end

    subgraph "Delivery & Tracking"
        Mailer -->|Send| ClientOutbox[SMTP / Brevo]
        ClientOutbox --> Webhook[Tracking Webhooks]
        Webhook -->|Open/Click Events| DB
        Cron -->|Polling| Poller[IMAP Reply Poller]
        Poller -->|Fetch Direct Replies| DB
    end

    subgraph "Reporting"
        Pipeline -->|End of Day| Reporter[Daily Excel & Email Report]
        Reporter --> Admin[Admin Inbox]
    end
```

---

## ✨ Key Features

| Feature                              | Description                                                                                                               |
| :----------------------------------- | :------------------------------------------------------------------------------------------------------------------------ |
| **🔍 Multi-Radius Discovery**  | Uses Google Places API to search for specific niches within calculated geographical radii. |
| **🧠 Deep AI Qualification**   | Extracts structured website signals (old copyright years, mobile responsiveness) and leverages Groq LLM to answer: *Does this business need our services?* |
| **🌐 Social & Competitor Intel**| Autonomously detects social media footprints and performs local competitor benchmarking to find unique sales angles. |
| **✍️ Hyper-Personalization** | Generates completely unique email bodies referencing the prospect's specific services, location, and competitor gaps.          |
| **📄 Dynamic PDF Proposals**   | Auto-generates customized, visually polished business proposals (via ReportLab) and attaches them to outreach emails.          |
| **🔁 Autonomous Follow-Ups**   | Intelligent, tri-stage multi-touchpoint sequence that automatically pauses upon prospect engagement (clicks or replies). |
| **🤖 Smart AI Inbox**          | Reads incoming replies, categorizes intent (e.g., *interested*, *pricing_inquiry*), and automatically drafts context-aware responses. |
| **📈 Self-Improving Prompts**  | Analyzes weekly campaign metrics (open/reply rates) and dynamically leverages LLM feedback loops to rewrite underperforming outreach prompts. |
| **🔔 WhatsApp & Telegram Alerts** | Real-time notifications for discovered leads, pipeline errors, and high-intent prospect engagements (e.g., hot replies).       |
| **📊 ROI & Excel Reporting**   | Compiles daily and weekly outreach metrics and sends an Excel overview directly to the administrator.                                |
| **🛡 API Key Security**        | All management endpoints are protected by `X-API-Key` headers.                                                          |
| **💸 Serverless Optimized**    | In-process APScheduler execution optimized for restrictive free-tiers (e.g., Render) by minimizing external connections. |
| **⏸ Dynamic Pipeline Control**| API-driven `jobs_config.json` system allows granular `HOLD`/`RUN` and schedule adjustments for individual pipeline stages without a server reboot, paired with a global `.env` kill-switch. |
| **🏢 Enterprise-Grade Code**   | Fully documented, strictly typed codebase featuring professional Python docstrings, dependency injection (`lru_cache`), and comprehensive testing. |

---

## ⚙️ Complete System Setup

### 1. Prerequisites

- Python 3.11+
- PostgreSQL 15+ (Local or Cloud e.g., Supabase)
- API Keys for Google Places, Groq, and an SMTP Provider (Brevo/Sendinblue).

### 2. Environment Variables

Copy the `.env.example` to `.env` and fill in the specifics:

```bash
cp .env.example .env
```

Ensure you have set `DATABASE_URL`, `GROQ_API_KEY`, SMTP credentials, Telegram `TELEGRAM_BOT_TOKEN`, `IMAP_SERVER` credentials, and `CRON_JOB_API_KEY` (if utilizing the automated free-tier external trigger). 
You may also set `PRODUCTION_STATUS=HOLD` to safely pause all automated daily operations globally. Granular control is managed dynamically via the API and `config/jobs_config.json`.

### 3. Local Installation (Recommended for Development)

1. **Clone & Environment:**

   ```bash
   git clone https://github.com/your-username/ai-lead-generation.git
   cd "AI LEAD GENERATION"
   python -m venv venv
   source venv/bin/activate # On Windows: venv\Scripts\activate
   ```
2. **Install Dependencies:**

   ```bash
   pip install -r requirements.txt
   ```
3. **Run Database Migrations:**

   ```bash
   alembic upgrade head
   ```

### Docker Installation (Recommended for Production)

If you prefer an isolated containerized environment, ensure Docker is installed and run:

```bash
docker-compose up -d --build
```

This will spin up the FastAPI app and (optionally) the PostgreSQL container. All background tasks run seamlessly inside the API process.

### External Cron-Job Setup (For Serverless Free Tiers)

If deploying to a platform that puts the server to sleep (e.g., Render Free Tier), this repository includes an automated GitHub Action (`.github/workflows/setup_cronjob.yml`) that links your deployment to [cron-job.org](https://cron-job.org).
Simply provide your `CRON_JOB_API_KEY` and `APP_URL` as GitHub Secrets/Variables, and a system keep-alive will be automatically configured upon deployment.

---

## 🏃 Running the System

Start the FastAPI Server, which automatically instantiates the APScheduler for background operations:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> *API Documentation is available at: [http://localhost:8000/docs](http://localhost:8000/docs)*

### Manual Pipeline Execution

For debugging or immediate execution, you can bypass the APScheduler and run the pipeline stages sequentially via the standalone script:

```bash
python test.py
```

This ensures the database tables exist and immediately triggers the configured stages (e.g., Discovery, Qualification).

---

## 🧪 Automated Testing

We enforce a strict 100% test coverage expectation across the system.
Our End-to-End test suite automatically spins up an asynchronous SQLite memory database (`test.db`) to safely perform operations. Models dynamically adapt schema bindings to ensure cross-compatibility between production PostgreSQL and local SQLite testing environments.

To run the entire suite:

```bash
pytest -v tests/
```

**Testing coverage includes:**

- ✅ Database Schema & ORM capabilities (w/ schema-agnostic adaptations).
- ✅ Discovery Module (Mocks Google API & DOM Scrapers).
- ✅ Asynchronous Task Pipeline validation.
- ✅ System integration & Error handling cases.

---

## 🔮 Future Roadmap (v3.0)

With the successful deployment of **v2.0**, the platform now possesses autonomous follow-ups, reply classification, deep enrichment, and self-improving prompt analytics. 
Our upcoming v3.0 goals focus on expanding beyond email:

- **Multi-Omnichannel Sequences:** Coordinated outreach traversing SMS, direct LinkedIn messaging, and automated voicemail drops.
- **Continuous CRM Sync:** Bi-directional sync integrations with Salesforce and HubSpot to pass qualified leads instantaneously to closing teams.
- **Voice AI Handoff:** Integration with voice agents to trigger immediate outbound calls the moment a prospect hits a tracking landing page.

*(Note: Technical implementation models and architectural choices for these upcoming changes are managed internally).*

---

## 📜 License

This project is **PROPRIETARY AND CONFIDENTIAL**. 

It is strictly licensed only to the original author. Any other person, entity, or corporation wishing to implement, deploy, or use this system must obtain **explicit, prior written permission** from the author. 

Unauthorized copying, distribution, modification, or commercial use of this codebase is strictly prohibited. See the [LICENSE](LICENSE) file for the full End-User License Agreement (EULA) rules and regulations.

<div align="center">
  <br>
  <em>Built with ❤️ to revolutionize B2B Sales</em>
</div>
