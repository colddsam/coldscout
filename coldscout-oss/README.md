# Cold Scout OSS — Open-Source AI Lead Generation, Self-Hosted

[![GitHub Release](https://img.shields.io/github/v/release/colddsam/coldscout?filter=oss-v*&label=Latest%20Release&color=black)](https://github.com/colddsam/coldscout/releases?q=oss-v&expanded=true)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](https://opensource.org/licenses/MIT)
[![Made with FastAPI](https://img.shields.io/badge/FastAPI-Python-009688)](https://fastapi.tiangolo.com)
[![AI: Groq Llama 3](https://img.shields.io/badge/AI-Groq%20Llama%203-black)](https://groq.com)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED)](https://www.docker.com/)
[![MCP Server](https://img.shields.io/badge/MCP-Server-5e60ce)](https://modelcontextprotocol.io)

> The open-source **AI lead generation platform** — discover local businesses on Google Maps, AI-qualify each lead with Llama 3, draft personalized cold emails, and run the entire outreach pipeline yourself. A free, self-hosted alternative to Apollo, Outreach, and Instantly.

**Keywords:** AI lead generation, Google Maps lead scraper, B2B outreach automation, open source lead generation, cold email AI generator, MCP server, self-hosted CRM, FastAPI lead pipeline, Llama 3 sales AI.

**Zero cost to Cold Scout** — you bring your own API keys.

### [⬇ Download Latest Release](https://github.com/colddsam/coldscout/releases/latest) · [🌐 Visit coldscout.colddsam.com](https://coldscout.colddsam.com) · [📚 Documentation](https://coldscout.colddsam.com/docs) · [💬 GitHub Issues](https://github.com/colddsam/coldscout/issues)

> **Suggested GitHub topics** to add to this repo for discovery: `lead-generation`, `b2b-sales`, `cold-email`, `google-maps-api`, `groq`, `llama`, `fastapi`, `mcp-server`, `open-source-saas`, `ai-agents`, `sales-automation`.

## What's Included

The full 5-stage automated lead generation pipeline:

| Stage | Description |
|-------|-------------|
| **Discovery** | Finds local businesses via Google Places API |
| **Qualification** | Scores leads by digital presence (website, social, reviews) |
| **Personalization** | AI-generated outreach emails + PDF proposals via Groq |
| **Outreach** | Sends personalized emails via Brevo SMTP |
| **Reporting** | Daily Excel reports emailed to admin |

Plus a **web dashboard** at `http://localhost:8000` for monitoring and manual control.

## What's NOT Included

- **Threads/social media pipeline** (platform-specific, Pro/Enterprise only)
- **Authorization layer** (no login, no JWT — this is your private server)
- **Supabase/PostgreSQL** (uses local SQLite for simplicity)
- **Billing/payments** (it's free!)

## Quick Start

### 1. Download

**Option A: Download release (recommended)**
```bash
# Download from GitHub Releases
# https://github.com/colddsam/coldscout/releases?q=oss-v&expanded=true
# Extract the archive and cd into it
```

**Option B: Clone from source**
```bash
git clone https://github.com/colddsam/coldscout.git
cd coldscout/coldscout-oss
```

### 2. Get Your API Keys (all free tiers available)

| Service | What For | Free Tier | Setup |
|---------|----------|-----------|-------|
| **Google Places** | Business discovery | $200/mo credit | [GCP Console](https://console.cloud.google.com/) → Enable Places API → Credentials → API Key |
| **Groq** | AI email generation | Free tier | [console.groq.com](https://console.groq.com/) → API Keys → Create |
| **Brevo** | Email sending | 300 emails/day | [brevo.com](https://www.brevo.com/) → SMTP & API → Generate Key |
| **Telegram** (optional) | Pipeline alerts | Free | [@BotFather](https://t.me/BotFather) → Create Bot → Get Token |

### 3. Configure

```bash
cp .env.example .env
# Edit .env with your API keys
```

### 4. Run

**Option A: Python (development)**
```bash
pip install -r requirements.txt
python run.py
```

**Option B: Docker (production)**
```bash
docker compose up -d
```

### 5. Open Dashboard

Visit `http://localhost:8000` to:
- View pipeline status and statistics
- Manually trigger any pipeline stage
- See all discovered leads
- Pause/resume the automated scheduler
- Check configuration status

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Web dashboard |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/status` | Pipeline status + stats |
| `GET` | `/api/leads` | List leads (query: `?status=qualified&limit=50`) |
| `GET` | `/api/config` | Current configuration |
| `POST` | `/api/pipeline/trigger/{stage}` | Trigger a stage (`all`, `discovery`, `qualification`, `personalization`, `outreach`, `report`) |
| `POST` | `/api/scheduler/pause` | Pause all scheduled jobs |
| `POST` | `/api/scheduler/resume` | Resume all scheduled jobs |

## Default Schedule (24h IST)

| Time | Stage |
|------|-------|
| 06:00 | Discovery |
| 07:00 | Qualification |
| 08:00 | Personalization |
| 09:00 | Outreach |
| 23:30 | Daily Report |

Configure in `.env` via `DISCOVERY_HOUR`, `QUALIFICATION_HOUR`, etc.

## Architecture

```
coldscout-oss/
├── app/
│   ├── main.py              # FastAPI app + dashboard + scheduler
│   ├── config.py             # Environment configuration
│   ├── database.py           # SQLite async engine
│   ├── pipeline.py           # 5-stage pipeline orchestrator
│   ├── models/               # SQLAlchemy models (Lead, Campaign, Report)
│   └── modules/
│       ├── discovery/        # Google Places API + email scraping
│       ├── qualification/    # Website/social/review scoring
│       ├── personalization/  # Groq AI + PDF proposals
│       ├── outreach/         # Brevo SMTP email sender
│       ├── enrichment/       # Competitor analysis
│       ├── reporting/        # Excel report builder
│       └── notifications/    # Optional Telegram alerts
├── run.py                    # Entry point
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## How Cold Scout compares (vs Apollo, Outreach, Instantly)

| Feature                          | Cold Scout (OSS)              | Apollo            | Outreach           | Instantly         |
| -------------------------------- | ----------------------------- | ----------------- | ------------------ | ----------------- |
| **Pricing floor**                | Free (self-host)              | ~$50/seat/mo      | ~$130/seat/mo      | ~$30/mo           |
| **Open source**                  | ✅                            | ❌                | ❌                 | ❌                |
| **Self-hostable**                | ✅                            | ❌                | ❌                 | ❌                |
| **AI qualification (Llama 3)**   | ✅                            | ❌                | Limited            | ❌                |
| **MCP server for AI agents**     | ✅                            | ❌                | ❌                 | ❌                |
| **Google Maps lead source**      | ✅                            | ❌                | ❌                 | ❌                |
| **B2B contact database**         | ❌                            | ✅ (260M+)        | ❌                 | ❌                |
| **Native CRM sync**              | Roadmap                       | ✅                | ✅                 | Limited           |
| **Best for**                     | Local-business outreach, OSS  | SaaS contact data | Enterprise sales   | List sending      |

Read the full editorial comparison: <https://coldscout.colddsam.com/compare>

## Frequently Asked Questions

### What is Cold Scout?

Cold Scout is an AI-powered lead generation platform that automates the entire B2B outreach pipeline — discovery (Google Maps), qualification (Groq Llama 3), personalization (AI-drafted cold emails), and sending (Brevo SMTP). The OSS edition runs entirely on your own infrastructure with your own API keys.

### How does Cold Scout discover leads?

Cold Scout queries the **Google Places API** for businesses matching your Ideal Customer Profile (industry, location, rating, review count). It tiles geographies into grid cells to bypass per-query result caps, dedups by `place_id`, and enriches each lead with website, contact data, and social profiles.

### What AI model does Cold Scout use?

Cold Scout uses **Groq-hosted Llama 3.3 70B** for qualification and personalized email generation, and **Llama 3.1 8B** for fast scoring. Groq's low-latency inference lets the pipeline score thousands of leads per minute.

### Is Cold Scout free to use?

Yes. The OSS package in this directory is open-source and free to self-host forever. You only pay for third-party API usage on your own accounts (most have generous free tiers). For a managed version with hosted API + MCP server, see [Cold Scout Pro](https://coldscout.colddsam.com/pricing).

### Does Cold Scout work with Claude / GPT / Cursor?

Yes — Cold Scout exposes itself as a **Model Context Protocol (MCP) server**. Any MCP-aware client can call `search_places`, `qualify_lead`, `generate_email`, and `send_email` as native tools. See the [MCP server setup guide](https://coldscout.colddsam.com/guides/mcp-server-setup-ai-agents-claude).

### Is Cold Scout GDPR / CAN-SPAM compliant?

Cold Scout is built with compliance in mind: every outbound email includes a one-click unsubscribe footer, hard bounces are auto-suppressed, and the platform respects rate limits and `robots.txt` for any scraping. You are still responsible for the legal basis of your outreach in your target jurisdiction.

### What's the difference between Cold Scout OSS and Cold Scout Pro?

| Capability                       | OSS (free)                           | Pro / Enterprise (hosted)         |
| -------------------------------- | ------------------------------------ | --------------------------------- |
| Lead discovery + qualification   | ✅                                   | ✅                                |
| AI email generation              | ✅                                   | ✅                                |
| Web dashboard                    | ✅                                   | ✅                                |
| MCP server                       | ✅ (local)                           | ✅ (hosted)                       |
| Authentication / multi-user      | —                                    | ✅ (Supabase Auth)                |
| Threads / social pipeline        | —                                    | ✅                                |
| Managed infrastructure           | —                                    | ✅                                |
| Support                          | GitHub Issues                        | Email (48h Pro / 4h Enterprise)   |

## Useful links

- 🌐 **Marketing site**: <https://coldscout.colddsam.com>
- 📚 **Full documentation**: <https://coldscout.colddsam.com/docs>
- 📋 **Setup guide (Docker)**: <https://coldscout.colddsam.com/guides/self-host-lead-generation-docker-guide>
- 🤖 **MCP server guide**: <https://coldscout.colddsam.com/guides/mcp-server-setup-ai-agents-claude>
- 💰 **Pricing**: <https://coldscout.colddsam.com/pricing>
- 🆚 **vs Apollo / Outreach / Instantly**: <https://coldscout.colddsam.com/compare>
- 📰 **Blog & engineering notes**: <https://coldscout.colddsam.com/blog>
- 🐛 **Report a bug**: <https://github.com/colddsam/coldscout/issues>
- 💬 **AI agent policy (llms.txt)**: <https://coldscout.colddsam.com/llms.txt>

## License

MIT — Same as the main Cold Scout project.
