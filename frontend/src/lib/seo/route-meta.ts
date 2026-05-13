/**
 * Static route → SEO metadata map.
 *
 * Used by:
 *   - The bot prerender middleware (api/prerender.ts) to inject meta + JSON-LD
 *     into the SPA shell for crawlers and social card scrapers.
 *   - The build-time sitemap generator (scripts/generate-sitemap.mjs).
 *   - The llms.txt generator (scripts/generate-llms.mjs).
 *
 * Only static, known-at-build-time routes belong here. Dynamic routes
 * (/u/:username, /blog/:slug, /guides/:slug, /demo/:leadId) are handled by
 * dedicated branches in the prerender layer.
 *
 * Keep one row per public route. The sitemap generator will emit each row
 * unless `inSitemap === false`.
 */
import { SITE } from './site';
import { BASE_PRICING } from './pricing';

export interface RouteMeta {
  path: string;
  title: string;
  description: string;
  /** Page-specific keywords. Falls back to the global default if omitted. */
  keywords?: string;
  /** Override og:image. Defaults to SITE.defaultOgImage. */
  ogImage?: string;
  /** Defaults to "website"; pages of long-form content should use "article". */
  ogType?: string;
  /** Defaults to true. Set false for /demo/:leadId, /login, etc. */
  index?: boolean;
  /** Optional follow override. Defaults to mirror `index`. */
  follow?: boolean;
  /** ISO 8601 last modified — feeds the sitemap. */
  lastmod?: string;
  /** Sitemap priority 0.0–1.0. */
  priority?: number;
  /** Sitemap changefreq. */
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  /** Set to false to omit from the sitemap. */
  inSitemap?: boolean;
}

const TODAY = '2026-05-08';

export const ROUTE_META: RouteMeta[] = [
  {
    path: '/',
    title: 'Cold Scout — AI Lead Generation Platform | Automate B2B Outreach',
    description: `Cold Scout uses AI to discover, enrich, and engage local business leads — automating your entire outreach pipeline from search to inbox. Free open-source + managed plans from ₹${BASE_PRICING.pro.inrPerMonth}/month.`,
    keywords:
      'AI lead generation platform, Google Maps lead scraper, B2B outreach automation, open source lead generation, cold email AI generator',
    priority: 1.0,
    changefreq: 'weekly',
    lastmod: TODAY,
  },
  {
    path: '/pricing',
    title: 'Pricing — Cold Scout AI Lead Generation',
    description: `Simple, transparent pricing for Cold Scout. Free open-source self-hosting, Pro managed API at ₹${BASE_PRICING.pro.inrPerMonth}/month, and Enterprise plans for agencies at ₹${BASE_PRICING.enterprise.inrPerMonth}/month. No hidden fees.`,
    keywords:
      'Cold Scout pricing, AI lead generation pricing, lead generation SaaS cost, open source lead tool, managed API pricing',
    priority: 0.9,
    changefreq: 'monthly',
    lastmod: TODAY,
  },
  {
    path: '/docs',
    title: 'Documentation — Cold Scout AI Lead Generation Setup & API Guide',
    description:
      'Complete setup guide for Cold Scout: system architecture, Google Maps API, Groq AI, Supabase database, environment variables, Docker deployment to Render & Vercel.',
    keywords:
      'Cold Scout documentation, AI lead generation setup, FastAPI deployment, Vercel deployment, Render deployment, Supabase database, Groq API',
    ogType: 'article',
    priority: 0.85,
    changefreq: 'weekly',
    lastmod: TODAY,
  },
  {
    path: '/faq',
    title: 'FAQ — Cold Scout AI Lead Generation Platform',
    description:
      'Frequently asked questions about Cold Scout — product capabilities, pricing tiers, integrations, MCP server, AI models, deliverability, and GDPR compliance.',
    keywords:
      'Cold Scout FAQ, AI lead generation FAQ, MCP server FAQ, open source lead generation, GDPR cold email',
    priority: 0.8,
    changefreq: 'monthly',
    lastmod: TODAY,
  },
  {
    path: '/compare',
    title: 'Cold Scout vs Apollo vs Outreach vs Instantly — Comparison',
    description:
      'Honest side-by-side comparison of Cold Scout against Apollo, Outreach, and Instantly. Pricing, AI features, data sources, and where each tool wins.',
    keywords:
      'Cold Scout vs Apollo, Apollo alternative, Outreach alternative, Instantly alternative, B2B lead generation comparison',
    priority: 0.85,
    changefreq: 'monthly',
    lastmod: TODAY,
  },
  {
    path: '/use-cases',
    title: 'Use Cases — Cold Scout for Freelancers, Agencies, SaaS, AI Agents',
    description:
      'Cold Scout use cases for freelancers, marketing agencies, SaaS go-to-market teams, and AI agent builders. See exactly how each persona uses the platform.',
    keywords:
      'AI lead generation use cases, freelancer client acquisition, agency outreach automation, SaaS go-to-market, AI agent lead generation',
    priority: 0.8,
    changefreq: 'monthly',
    lastmod: TODAY,
  },
  {
    path: '/integrations',
    title: 'Integrations — Cold Scout AI Lead Generation Platform',
    description:
      'Cold Scout integrates with Google Places, Groq, Brevo, Supabase, Razorpay, Meta Threads, and the Model Context Protocol. Live, beta, and roadmap connectors.',
    keywords:
      'Cold Scout integrations, Google Places integration, Groq Llama integration, Brevo SMTP, MCP server, Threads API',
    priority: 0.75,
    changefreq: 'monthly',
    lastmod: TODAY,
  },
  {
    path: '/changelog',
    title: 'Changelog — Cold Scout AI Lead Generation Platform',
    description:
      'Release notes and product updates for Cold Scout — what shipped, when, and what is in flight.',
    keywords:
      'Cold Scout changelog, release notes, AI lead generation updates, product updates',
    priority: 0.7,
    changefreq: 'weekly',
    lastmod: TODAY,
  },
  {
    path: '/blog',
    title: 'Blog — Cold Scout: AI Lead Generation, Outreach, Sales Engineering',
    description:
      'Articles, comparisons, and how-tos on AI lead generation, B2B outreach automation, and the engineering of modern sales pipelines.',
    keywords:
      'AI lead generation blog, B2B outreach automation, cold email AI generator, open source lead generation',
    priority: 0.85,
    changefreq: 'weekly',
    lastmod: TODAY,
  },
  {
    path: '/guides',
    title: 'Guides — Cold Scout: Self-host, Setup, MCP Server, Deliverability',
    description:
      'Technical guides for the Cold Scout open-source AI lead generation platform — self-hosting with Docker, MCP server setup, deliverability, and engineering deep-dives.',
    keywords:
      'Cold Scout guides, self-host lead generation, MCP server setup, Docker FastAPI, deliverability guide',
    priority: 0.85,
    changefreq: 'weekly',
    lastmod: TODAY,
  },
  {
    path: '/support',
    title: 'Customer Support — Cold Scout',
    description:
      'Customer support for Cold Scout. Email response within 48 hours on Pro, 4 hours on Enterprise. Documentation, FAQs, and direct contact.',
    priority: 0.7,
    changefreq: 'monthly',
    lastmod: TODAY,
  },
  {
    path: '/privacy',
    title: 'Privacy Policy — Cold Scout',
    description:
      'Privacy policy for Cold Scout — data handling, GDPR/CCPA rights, third-party services, retention, and contact for privacy requests.',
    priority: 0.4,
    changefreq: 'yearly',
    lastmod: TODAY,
  },
  {
    path: '/terms',
    title: 'Terms of Service — Cold Scout',
    description:
      'Terms of service for the Cold Scout AI lead generation platform — acceptable use, payments, refunds, IP, and dispute resolution.',
    priority: 0.4,
    changefreq: 'yearly',
    lastmod: TODAY,
  },
  {
    path: '/refund-policy',
    title: 'Refund Policy — Cold Scout',
    description:
      'Refund and cancellation policy for Cold Scout subscriptions — eligibility window, process, and exceptions.',
    priority: 0.4,
    changefreq: 'yearly',
    lastmod: TODAY,
  },
  {
    path: '/delete-data',
    title: 'Data Deletion Request — Cold Scout',
    description:
      'Submit a GDPR/CCPA data deletion request for your Cold Scout account. We honor right-to-erasure within 30 days.',
    priority: 0.3,
    changefreq: 'yearly',
    lastmod: TODAY,
  },
  {
    path: '/download',
    title: 'Download App — Cold Scout',
    description:
      'Download the Cold Scout mobile companion app or get the open-source self-host package from GitHub.',
    priority: 0.5,
    changefreq: 'monthly',
    lastmod: TODAY,
  },
  {
    path: '/directory',
    title: 'Business Lead Directory — Find Local Service Leads | Cold Scout',
    description:
      'Browse thousands of local business leads by city and industry. Find plumbers, roofers, contractors, and more businesses that need digital services. Free digital presence audits.',
    keywords:
      'business directory, local business leads, find leads by city, service leads, B2B leads, plumber leads, contractor leads, Cold Scout directory',
    priority: 0.85,
    changefreq: 'daily',
    lastmod: TODAY,
  },
  {
    path: '/scanner',
    title: 'Free Lead Scanner — Audit Any Business in 30 Seconds | Cold Scout',
    description:
      'Free public scanner that audits a local business in 30 seconds. Run a digital presence score on any Google Maps listing — no signup, no card.',
    keywords:
      'free lead scanner, business audit, digital presence audit, google maps business audit, free website audit, lead score',
    priority: 0.8,
    changefreq: 'weekly',
    lastmod: TODAY,
  },
  // Auth + dashboard routes — present so the prerender layer can quickly
  // identify them as noindex and short-circuit. Excluded from sitemap.
  {
    path: '/login',
    title: 'Sign In — Cold Scout',
    description: 'Sign in to your Cold Scout dashboard to manage your AI lead generation pipeline.',
    index: false,
    inSitemap: false,
  },
  {
    path: '/signup',
    title: 'Sign Up — Cold Scout',
    description: 'Create your Cold Scout account to start generating qualified leads with AI.',
    index: false,
    inSitemap: false,
  },
];

/**
 * Look up a static route by path. Trailing slash is normalized.
 */
export function findRouteMeta(rawPath: string): RouteMeta | undefined {
  const path = rawPath === '/' ? '/' : rawPath.replace(/\/$/, '');
  return ROUTE_META.find((r) => r.path === path);
}

export const SITE_DEFAULT_META: RouteMeta = {
  path: '/',
  title: `${SITE.name} — AI Lead Generation Platform`,
  description:
    'Cold Scout uses AI to discover, enrich, and engage local business leads — automating your entire outreach pipeline from search to inbox.',
};
