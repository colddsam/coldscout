/**
 * Canonical FAQ source of truth.
 *
 * Both ``/`` (homepage FaqSection) and ``/faq`` (full FAQ page) import from
 * this module. Keeping a single Q/A list avoids the Featured-Snippet
 * deduping problem where Google picks the shorter homepage answer over the
 * richer ``/faq`` answer, and gives Perplexity/ChatGPT one consistent
 * citation surface for AEO.
 *
 * The "home" subset (``HOMEPAGE_FAQS``) is just the first N items of the
 * full list — same wording, same JSON-LD answer text. Don't add divergent
 * answer copy here.
 */

import { BASE_PRICING } from './pricing';

export interface FAQItem {
  q: string;
  a: string;
}

export interface FAQSection {
  section: string;
  items: FAQItem[];
}

// Canonical full list used on the dedicated /faq route. Each section is
// independently renderable as an accordion group.
export const FAQ_SECTIONS: FAQSection[] = [
  {
    section: 'Product',
    items: [
      {
        q: 'What is Cold Scout?',
        a: 'Cold Scout is an open-source AI lead generation platform that discovers local businesses on Google Maps, qualifies them with Llama 3 models, and drafts personalized cold emails. It automates the entire outreach pipeline from search to inbox.',
      },
      {
        q: 'How does Cold Scout discover leads?',
        a: 'Cold Scout uses the Google Places API to search for businesses matching your Ideal Customer Profile (industry, location, rating, review count). It tiles geographies into grid cells to bypass per-query result caps, dedups by place_id, and enriches each lead with website, phone, and social profiles.',
      },
      {
        q: 'What AI models power Cold Scout?',
        a: "Cold Scout uses Groq-hosted Llama 3.3 70B for qualification and personalized email generation, and Llama 3.1 8B for fast scoring tasks. Groq's low latency lets the pipeline score thousands of leads per minute.",
      },
      {
        q: 'Can AI agents like Claude or GPT use Cold Scout?',
        a: 'Yes. Cold Scout exposes a Model Context Protocol (MCP) server. Any MCP-aware client (Claude Desktop, Claude Code, Cursor, Cline) can call lead discovery, qualification, and email generation as native tools.',
      },
    ],
  },
  {
    section: 'Pricing & Plans',
    items: [
      {
        q: 'Is the platform truly free to self-host?',
        a: 'Yes. Download the OSS package from GitHub Releases, plug in your own API keys (Google Places, Groq, Brevo — all have free tiers), and run it. Your monthly bill is whatever the underlying APIs cost you on your own accounts. Cold Scout itself is free under an open-source license.',
      },
      {
        q: 'What do I get with the Pro plan?',
        a: `Pro (₹${BASE_PRICING.pro.inrPerMonth}/month) is the same pipeline pre-deployed for you — managed API + MCP server, 2,000 leads per month, AI qualification and email generation, dashboard analytics, email support with a 48-hour response SLA, and a 99.5% uptime SLA. No Docker, no environment setup.`,
      },
      {
        q: 'What does Enterprise add over Pro?',
        a: `Enterprise (₹${BASE_PRICING.enterprise.inrPerMonth.toLocaleString()}/month) gives you a dedicated API instance (not shared infrastructure), unlimited leads, custom ICP model training tuned to your niche, white-label email templates, priority support with a 4-hour response SLA, and a dedicated account manager.`,
      },
      {
        q: 'Can I cancel anytime?',
        a: 'Yes. Both Pro and Enterprise are billed monthly with no long-term contracts. Cancel from your dashboard at any time — access continues until the end of the current billing period and your data remains exportable.',
      },
      {
        q: 'What happens if I exceed 2,000 leads on Pro?',
        a: 'You get a notification when you approach the limit. Once reached, the pipeline pauses until the next billing cycle. You can upgrade to Enterprise at any time for unlimited leads, or temporarily run the OSS package on your own keys.',
      },
    ],
  },
  {
    section: 'Integration & Setup',
    items: [
      {
        q: 'How do I connect Cold Scout to my AI agent?',
        a: "Cold Scout ships an MCP server. On Pro, generate an API key from the dashboard's MCP settings and add the server to your AI client's MCP config. On OSS, the local server runs at http://localhost:8000/mcp by default.",
      },
      {
        q: 'Do you integrate with HubSpot, Pipedrive, or Salesforce?',
        a: 'Native CRM sync is on the public roadmap and shipping next quarter. In the meantime, every lead is exportable as CSV/Excel from the dashboard, and the FastAPI backend exposes a REST API you can wire into any CRM via Zapier, Make, or a small custom worker.',
      },
      {
        q: 'Which email provider does Cold Scout use?',
        a: 'Cold Scout sends through Brevo (Sendinblue) SMTP. Brevo handles IP reputation, DKIM/SPF/DMARC alignment, and provides automatic unsubscribe handling — all required for compliant cold outreach at volume.',
      },
    ],
  },
  {
    section: 'Compliance & Data',
    items: [
      {
        q: 'Is Cold Scout GDPR compliant?',
        a: 'Yes. Cold Scout is built with GDPR, CCPA, and CAN-SPAM in mind. Every outreach email includes a one-click unsubscribe footer. Data deletion requests are honored end-to-end. The platform implements ethical scraping with rate limiting and respects robots.txt directives.',
      },
      {
        q: 'Where is my data stored?',
        a: 'On the Pro and Enterprise plans, data is stored in our managed PostgreSQL instance (Supabase) in the Asia-South region by default. Enterprise customers can request EU- or US-hosted instances. On the OSS plan, your data sits in your own database — we never see it.',
      },
      {
        q: 'How do I delete my data?',
        a: 'Use /delete-data on coldscout.colddsam.com to submit a deletion request, or email admin@colddsam.com. We honor GDPR Article 17 right-to-erasure within 30 days, but typically much faster.',
      },
    ],
  },
];

export const ALL_FAQS: FAQItem[] = FAQ_SECTIONS.flatMap((s) => s.items);

// Homepage gets the first 6 most-cited entries (Product + first Pricing
// question). Same Q/A strings as the full list — never edit copy here.
export const HOMEPAGE_FAQS: FAQItem[] = ALL_FAQS.slice(0, 6);
