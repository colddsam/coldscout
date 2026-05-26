/**
 * Bot prerender endpoint — Vercel Node runtime.
 *
 * Endpoint:    /api/prerender?path=<path>
 *
 * Purpose:
 *   Crawlers and social-card scrapers (Twitter, LinkedIn, Slack, Perplexity,
 *   Googlebot, FB) often don't wait for JS hydration. They hit the SPA shell
 *   and read whatever <head> tags are static. Cold Scout already has rich
 *   meta in index.html, but per-route variation only kicks in after React
 *   hydrates. This endpoint serves the SPA shell *with the route-specific
 *   meta + JSON-LD already injected*, so first-fetch crawlers see the right
 *   thing.
 *
 * Routing:
 *   - Vercel middleware (../middleware.ts) detects bot UAs and rewrites the
 *     request to here.
 *   - For static paths in ROUTE_META, we look up meta directly.
 *   - For /u/:username, we call the public profile API to fetch live data.
 *   - For /blog/:slug and /guides/:slug, we read the prebuilt content meta
 *     manifest (public/content-meta.json — generated at build time).
 *   - Everything else falls back to the homepage meta.
 *
 * Output:
 *   text/html with a 200 status, cached at the edge for 5 minutes.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const config = {
  runtime: 'nodejs',
};

const SITE_URL = 'https://coldscout.colddsam.com';
const API_URL = 'https://api.coldscout.colddsam.com';

interface MinimalMeta {
  title: string;
  description: string;
  canonical: string;
  ogType?: string;
  ogImage?: string;
  index?: boolean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function loadShell(): string {
  const path = join(process.cwd(), 'dist', 'index.html');
  if (existsSync(path)) return readFileSync(path, 'utf-8');
  // Fallback for `vercel dev` where dist may not exist
  const src = join(process.cwd(), 'index.html');
  return readFileSync(src, 'utf-8');
}

function loadContentMeta(): Record<string, { title: string; description: string }> {
  const path = join(process.cwd(), 'dist', 'content-meta.json');
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

async function resolveProfile(username: string): Promise<MinimalMeta | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/public/profile/${encodeURIComponent(username)}`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const profile = (await res.json()) as {
      full_name?: string;
      username?: string;
      avatar_url?: string;
      profile_photo_url?: string;
      freelancer?: { professional_title?: string };
      business?: { company_name?: string; industry?: string };
    };
    const name = profile.full_name || username;
    const headline =
      profile.freelancer?.professional_title ||
      (profile.business?.company_name
        ? `${profile.business.company_name}${profile.business.industry ? ` · ${profile.business.industry}` : ''}`
        : null);
    const title = `${name}${headline ? ` — ${headline}` : ''} | Cold Scout`;
    const description = `View ${name}'s public profile on Cold Scout — AI-powered lead generation platform.`;
    return {
      title,
      description,
      canonical: `${SITE_URL}/u/${username}`,
      ogType: 'profile',
      ogImage: profile.profile_photo_url || profile.avatar_url || `${SITE_URL}/banner.png`,
      index: true,
    };
  } catch {
    return null;
  }
}

const STATIC_ROUTE_META: Record<string, MinimalMeta> = {
  '/': {
    title: 'Cold Scout — AI Lead Generation Platform | Automate B2B Outreach',
    description:
      'Cold Scout uses AI to discover, enrich, and engage local business leads — automating your entire outreach pipeline from search to inbox.',
    canonical: `${SITE_URL}/`,
  },
  '/pricing': {
    title: 'Pricing — Cold Scout AI Lead Generation',
    description:
      'Simple, transparent pricing for Cold Scout. Free open-source self-hosting, Pro managed API at ₹100/month, and Enterprise plans for agencies at ₹2,000/month.',
    canonical: `${SITE_URL}/pricing`,
  },
  '/docs': {
    title: 'Documentation — Cold Scout AI Lead Generation Setup & API Guide',
    description:
      'Complete setup guide for Cold Scout: system architecture, Google Maps API, Groq AI, Supabase database, environment variables, Docker deployment.',
    canonical: `${SITE_URL}/docs`,
    ogType: 'article',
  },
  '/faq': {
    title: 'FAQ — Cold Scout AI Lead Generation Platform',
    description:
      'Frequently asked questions about Cold Scout — product capabilities, pricing tiers, integrations, MCP server, AI models, and GDPR compliance.',
    canonical: `${SITE_URL}/faq`,
  },
  '/compare': {
    title: 'Cold Scout vs Apollo vs Outreach vs Instantly — Comparison',
    description:
      'Honest side-by-side comparison of Cold Scout against Apollo, Outreach, and Instantly. Pricing, AI features, data sources, and where each tool wins.',
    canonical: `${SITE_URL}/compare`,
  },
  '/use-cases': {
    title: 'Use Cases — Cold Scout for Freelancers, Agencies, SaaS, AI Agents',
    description:
      'Cold Scout use cases for freelancers, marketing agencies, SaaS go-to-market teams, and AI agent builders.',
    canonical: `${SITE_URL}/use-cases`,
  },
  '/integrations': {
    title: 'Integrations — Cold Scout AI Lead Generation Platform',
    description:
      'Cold Scout integrates with Google Places, Groq, Brevo, Supabase, Razorpay, Meta Threads, and the Model Context Protocol.',
    canonical: `${SITE_URL}/integrations`,
  },
  '/changelog': {
    title: 'Changelog — Cold Scout AI Lead Generation Platform',
    description:
      'Release notes and product updates for Cold Scout — what shipped, when, and what is in flight.',
    canonical: `${SITE_URL}/changelog`,
  },
  '/blog': {
    title: 'Blog — Cold Scout: AI Lead Generation, Outreach, Sales Engineering',
    description:
      'Articles, comparisons, and how-tos on AI lead generation, B2B outreach automation, and the engineering of modern sales pipelines.',
    canonical: `${SITE_URL}/blog`,
  },
  '/guides': {
    title: 'Guides — Cold Scout: Self-host, Setup, MCP Server, Deliverability',
    description:
      'Technical guides for the Cold Scout open-source AI lead generation platform.',
    canonical: `${SITE_URL}/guides`,
  },
  '/support': {
    title: 'Customer Support — Cold Scout',
    description: 'Customer support for Cold Scout. Email response within 48 hours on Pro, 4 hours on Enterprise.',
    canonical: `${SITE_URL}/support`,
  },
  '/privacy': {
    title: 'Privacy Policy — Cold Scout',
    description: 'Privacy policy for Cold Scout — data handling, GDPR/CCPA rights, third-party services, retention.',
    canonical: `${SITE_URL}/privacy`,
  },
  '/terms': {
    title: 'Terms of Service — Cold Scout',
    description: 'Terms of service for the Cold Scout AI lead generation platform.',
    canonical: `${SITE_URL}/terms`,
  },
  '/refund-policy': {
    title: 'Refund Policy — Cold Scout',
    description: 'Refund and cancellation policy for Cold Scout subscriptions.',
    canonical: `${SITE_URL}/refund-policy`,
  },
  '/delete-data': {
    title: 'Data Deletion Request — Cold Scout',
    description: 'Submit a GDPR/CCPA data deletion request for your Cold Scout account.',
    canonical: `${SITE_URL}/delete-data`,
  },
};

function resolveStatic(path: string): MinimalMeta | null {
  const normalized = path === '/' ? '/' : path.replace(/\/$/, '');
  return STATIC_ROUTE_META[normalized] ?? null;
}

function resolveContent(path: string, contentMeta: Record<string, { title: string; description: string }>): MinimalMeta | null {
  const normalized = path.replace(/\/$/, '');
  const m = contentMeta[normalized];
  if (!m) return null;
  return {
    title: `${m.title} — Cold Scout`,
    description: m.description,
    canonical: `${SITE_URL}${normalized}`,
    ogType: 'article',
  };
}

function injectMeta(html: string, meta: MinimalMeta): string {
  const t = escapeHtml(meta.title);
  const d = escapeHtml(meta.description);
  const c = escapeHtml(meta.canonical);
  const ogImage = escapeHtml(meta.ogImage ?? `${SITE_URL}/banner.png`);
  const ogType = escapeHtml(meta.ogType ?? 'website');
  const robotsValue = meta.index === false ? 'noindex, follow' : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';

  // Replace <title>
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${t}</title>`);

  // Replace meta tags by attribute
  function replaceMeta(html: string, attr: 'name' | 'property', key: string, value: string): string {
    const re = new RegExp(`<meta\\s+${attr}=["']${key}["'][^>]*>`, 'i');
    const tag = `<meta ${attr}="${key}" content="${value}" />`;
    return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `  ${tag}\n  </head>`);
  }

  out = replaceMeta(out, 'name', 'description', d);
  out = replaceMeta(out, 'name', 'robots', robotsValue);
  out = replaceMeta(out, 'property', 'og:title', t);
  out = replaceMeta(out, 'property', 'og:description', d);
  out = replaceMeta(out, 'property', 'og:url', c);
  out = replaceMeta(out, 'property', 'og:image', ogImage);
  out = replaceMeta(out, 'property', 'og:type', ogType);
  out = replaceMeta(out, 'name', 'twitter:title', t);
  out = replaceMeta(out, 'name', 'twitter:description', d);
  out = replaceMeta(out, 'name', 'twitter:image', ogImage);

  // Replace <link rel="canonical">
  if (/<link\s+rel=["']canonical["'][^>]*>/i.test(out)) {
    out = out.replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${c}" />`);
  } else {
    out = out.replace('</head>', `  <link rel="canonical" href="${c}" />\n  </head>`);
  }

  return out;
}

interface VercelRequest {
  url?: string;
  query?: { path?: string };
}

interface VercelResponse {
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
  send(body: string): void;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = (req.query?.path ?? '/').toString();
  const shell = loadShell();
  const contentMeta = loadContentMeta();

  let meta: MinimalMeta | null = resolveStatic(path) ?? resolveContent(path, contentMeta);

  // /u/:username — fetch from API
  if (!meta && path.startsWith('/u/')) {
    const username = path.slice(3).split('/')[0];
    if (username) {
      meta = await resolveProfile(username);
    }
  }

  // /demo/:leadId — always noindex
  if (!meta && path.startsWith('/demo/')) {
    meta = {
      title: 'Your Website Demo | Cold Scout',
      description: 'A custom website demo built for your business by Cold Scout.',
      canonical: `${SITE_URL}${path}`,
      index: false,
    };
  }

  // /shared/audit/:token — always noindex. Snapshots are private and
  // must never be exposed to crawlers regardless of token validity.
  if (!meta && path.startsWith('/shared/audit/')) {
    meta = {
      title: 'Shared audit report — Cold Scout',
      description: 'A Cold Scout audit report shared privately with you. Sign in to view.',
      canonical: `${SITE_URL}${path}`,
      index: false,
    };
  }

  // Fallback to homepage meta
  if (!meta) meta = STATIC_ROUTE_META['/'];

  const html = injectMeta(shell, meta);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  res.setHeader('X-Cold-Scout-Prerender', '1');
  res.status(200).send(html);
}
