/**
 * Page-specific structured-data content — single source of truth.
 *
 * These arrays feed Schema.org JSON-LD on individual public pages. They live
 * here (a PURE module: only imports ./site, ./pricing) instead of inline in the
 * page components so that:
 *
 *   1. The Android/Vite client pages and the Next server layer
 *      (web/src/lib/structured-data.ts) build the *same* schema from the *same*
 *      copy — no drift. Drift matters most for FAQPage: divergent answer text
 *      across `/`, `/faq`, `/pricing` makes Google silently de-dupe the
 *      FAQPage rich result (often surfacing the shorter answer).
 *   2. A server component can import them (it cannot reliably import constants
 *      out of a `'use client'` page module).
 *
 * Canonical FAQ Q/A for the homepage + /faq lives in ./faq. The page-specific
 * FAQ sets below (pricing, compare) are intentionally distinct surfaces.
 */
import { SITE } from './site';
import { BASE_PRICING } from './pricing';

export interface QA {
  q: string;
  a: string;
}

export interface HowToStepData {
  name: string;
  text: string;
  url?: string;
}

export interface SchemaListItem {
  /** Stable anchor id (for in-page #fragment) or external URL. */
  id: string;
  name: string;
  description: string;
  /** Absolute URL — overrides the #id anchor when present. */
  url?: string;
}

/* ── Homepage: HowTo (4-step pipeline) ─────────────────────────────────── */

export const HOMEPAGE_HOWTO = {
  name: 'How to Generate Qualified Leads with Cold Scout AI',
  description:
    'Use Cold Scout to automatically discover, qualify, and engage local business leads in four steps.',
  totalTimeISO: 'PT5M',
  steps: [
    {
      name: 'Configure Your Target',
      text: 'Set your target industry, location, and ideal customer criteria in the pipeline configuration.',
      url: `${SITE.url}/docs#configuration`,
    },
    {
      name: 'AI Lead Discovery',
      text: 'Cold Scout AI scrapes Google Maps and enriches leads with business data, contact info, and social profiles.',
      url: `${SITE.url}/docs#discovery`,
    },
    {
      name: 'Score and Qualify',
      text: 'Machine learning models rank leads by purchase intent and ICP fit, ensuring you focus on hot prospects.',
      url: `${SITE.url}/docs#qualification`,
    },
    {
      name: 'Automated Personalized Outreach',
      text: 'AI-generated personalized email campaigns automatically reach your best prospects with tracked follow-ups.',
      url: `${SITE.url}/docs#outreach`,
    },
  ] as HowToStepData[],
};

/* ── Docs: HowTo (self-host install) ───────────────────────────────────── */

export const DOCS_HOWTO = {
  name: 'How to install and self-host Cold Scout',
  description:
    'Set up the Cold Scout AI lead generation pipeline on your own infrastructure with Docker or pip in about 15 minutes.',
  totalTimeISO: 'PT15M',
  steps: [
    {
      name: 'Clone the repository',
      text: 'Clone the open-source Cold Scout repo from GitHub and switch into the project directory.',
      url: `${SITE.url}/docs#setup`,
    },
    {
      name: 'Provision API keys',
      text: 'Create accounts on Google Cloud (Places API), Groq, Brevo, and Supabase. Each has a free tier sufficient for testing.',
      url: `${SITE.url}/docs#api-keys`,
    },
    {
      name: 'Configure environment variables',
      text: 'Copy .env.example to .env and fill in the API keys, database URL, and SMTP credentials.',
      url: `${SITE.url}/docs#env`,
    },
    {
      name: 'Run with Docker Compose',
      text: 'Run docker compose up to start the FastAPI backend, the React frontend, and the APScheduler worker together.',
      url: `${SITE.url}/docs#deployment`,
    },
    {
      name: 'Configure your first pipeline',
      text: 'Open the dashboard, define your Ideal Customer Profile (industry, location, ICP signals), and trigger your first discovery run.',
      url: `${SITE.url}/docs#configuration`,
    },
  ] as HowToStepData[],
};

/* ── Pricing: FAQ ──────────────────────────────────────────────────────── */

export const PRICING_FAQS: QA[] = [
  {
    q: 'Is the platform truly free to self-host?',
    a: 'Absolutely. Download the Cold Scout OSS package from our GitHub Releases page, set up your own API keys (Google Places, Groq, Brevo — all have free tiers), and run it on your own machine. You only pay for third-party API usage on your own accounts.',
  },
  {
    q: 'What do I get with the Pro plan?',
    a: 'The Pro plan gives you instant access to our pre-configured, managed API server and MCP server — no deployment, no Docker, no environment setup. You get a ready-to-use API key and start generating leads immediately.',
  },
  {
    q: 'Can I cancel my subscription anytime?',
    a: 'Yes. Both Pro and Enterprise plans are billed monthly with no long-term contracts. Cancel anytime from your dashboard. Your access continues until the end of the current billing period.',
  },
  {
    q: 'What happens if I exceed the 2,000 leads/month on Pro?',
    a: 'You will receive a notification when you approach your limit. Once reached, the pipeline pauses until the next billing cycle. You can upgrade to Enterprise at any time for unlimited leads.',
  },
  {
    q: 'How does the Enterprise plan differ for agencies?',
    a: `Enterprise customers get a dedicated API instance, custom ICP model training tailored to their niche, white-label email templates, and priority support with a 4-hour response SLA. Enterprise is ₹${BASE_PRICING.enterprise.inrPerMonth.toLocaleString()}/month.`,
  },
];

/* ── Compare: FAQ ──────────────────────────────────────────────────────── */

export const COMPARE_FAQS: QA[] = [
  {
    q: 'Is Cold Scout an Apollo alternative?',
    a: 'Yes for local-business outreach and self-hosting. Cold Scout sources leads from Google Maps and runs entirely on your infrastructure. Apollo wins for SaaS-to-SaaS targeting where its 260M-contact database is the product.',
  },
  {
    q: 'Is Cold Scout an Outreach alternative?',
    a: 'For solo founders, freelancers, and small teams — yes. Cold Scout covers discovery, qualification, and outreach without the enterprise overhead. Outreach is a better fit for sales teams of 20+ on annual contracts with deep Salesforce integration.',
  },
  {
    q: 'Is Cold Scout an Instantly alternative?',
    a: 'They overlap on cold email, but Cold Scout adds AI lead discovery and qualification before sending. Instantly is the right pick if you already have a list and just need affordable, deliverable sending.',
  },
  {
    q: 'Why is Cold Scout cheaper?',
    a: 'Two reasons. The OSS package is free — your only cost is third-party API usage on your own accounts. The Pro plan is priced for individual operators, not enterprise procurement.',
  },
];

/* ── Support: FAQ ──────────────────────────────────────────────────────── */

export const SUPPORT_FAQS: QA[] = [
  {
    q: 'How do I contact Cold Scout support?',
    a: 'Email us at admin@colddsam.com for technical and general support, or for billing and account inquiries. Include your account email, a description of the issue, and any relevant screenshots for fastest resolution.',
  },
  {
    q: 'What are Cold Scout support response times?',
    a: 'Critical issues (platform outages, data loss): within 4 hours. Standard issues (bugs, setup errors, billing): within 24 hours. General enquiries (feature requests, questions): within 72 hours. Response times are measured during business hours, Monday through Friday.',
  },
  {
    q: 'What can Cold Scout support help with?',
    a: 'Our support team assists with platform setup and onboarding, AI pipeline and automation troubleshooting, account and billing management, and reporting bugs or technical errors.',
  },
  {
    q: 'How do I escalate an unresolved Cold Scout support ticket?',
    a: 'If your issue has not been resolved within the expected response window, reply to your original support thread and add "ESCALATE" in the subject line. A senior team member will review your case and respond within 24 hours.',
  },
];

/* ── Use Cases: ItemList ───────────────────────────────────────────────── */

export const USE_CASE_ITEMS: SchemaListItem[] = [
  {
    id: 'freelancer',
    name: 'For Freelancers',
    description:
      'Replace a full SDR job with a weekly Maps-driven pipeline. Spend Monday reviewing leads instead of hunting them.',
  },
  {
    id: 'agency',
    name: 'For Agencies',
    description:
      'Run multiple ICPs simultaneously, one per client engagement. White-label outreach with priority support on Enterprise.',
  },
  {
    id: 'saas',
    name: 'For SaaS Companies',
    description:
      'Go-to-market team of one. Use Cold Scout to source local-business prospects when your ICP is offline-first SMBs.',
  },
  {
    id: 'agent-builder',
    name: 'For AI Agent Builders',
    description:
      'Connect Claude, GPT, or Cursor to Cold Scout via the MCP server. Lead generation as a first-class agent capability.',
  },
];

/* ── Integrations: ItemList ────────────────────────────────────────────── */

export const INTEGRATION_ITEMS: SchemaListItem[] = [
  {
    id: 'google-places-api',
    name: 'Google Places API',
    description:
      'Source local-business prospects from Google Maps with rating, review count, hours, website, and contact data.',
    url: 'https://developers.google.com/maps/documentation/places/web-service',
  },
  {
    id: 'groq-llama',
    name: 'Groq (Llama 3.3 70B / Llama 3.1 8B)',
    description:
      'Llama-family models hosted on Groq power lead scoring, ICP rubric application, and personalized email drafting.',
    url: 'https://groq.com',
  },
  {
    id: 'brevo-smtp',
    name: 'Brevo (Sendinblue) SMTP',
    description:
      'Managed SMTP with DKIM/SPF/DMARC alignment, automatic unsubscribe handling, and reputation monitoring.',
    url: 'https://brevo.com',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description:
      'Supabase Auth (Google, GitHub, Facebook, LinkedIn OAuth) and a managed Postgres instance back the platform.',
    url: 'https://supabase.com',
  },
  {
    id: 'razorpay',
    name: 'Razorpay',
    description:
      'Razorpay Checkout handles all subscription billing in INR, with regional pricing display in 8 currencies.',
    url: 'https://razorpay.com',
  },
  {
    id: 'meta-threads-api',
    name: 'Meta Threads API',
    description:
      'Discover and engage prospects on Meta Threads via the official Threads API. Live in the Threads pipeline.',
    url: 'https://developers.facebook.com/docs/threads',
  },
  {
    id: 'mcp-server',
    name: 'Model Context Protocol (MCP)',
    description:
      'Cold Scout exposes itself as an MCP server so Claude Desktop, Claude Code, Cursor, and other agents can call its tools.',
    url: 'https://modelcontextprotocol.io',
  },
  {
    id: 'hubspot-pipedrive',
    name: 'HubSpot / Pipedrive / Salesforce',
    description:
      'Native bi-directional sync — push qualified leads, pull contact updates. Coming next quarter.',
  },
];
