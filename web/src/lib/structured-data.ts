/**
 * Server-side JSON-LD graph builders, one per public route.
 *
 * Each exported function returns an array of {@link JsonLdBlock} that the route's
 * `page.tsx` renders through <JsonLd> in the *server* HTML. This is the GEO/AEO
 * counterpart to the per-route Metadata (web/src/lib/seo.ts): metadata gives
 * crawlers the <head> tags, this gives them the Schema.org graph — and unlike
 * the legacy client-injected JsonLd, AI answer engines and social scrapers
 * (which don't run JS) actually see it.
 *
 * Everything here is built from PURE modules (schemas, page-data, faq, pricing,
 * content manifest) so it's safe in a React Server Component. The `id`s match
 * the ids the shared client pages pass, so the client adopts these tags on
 * hydration instead of duplicating them.
 */
import { SITE } from '@front/lib/seo/site';
import {
  softwareApplicationSchema,
  serviceSchema,
  breadcrumbSchema,
  faqSchema,
  howToSchema,
  articleSchema,
  itemListSchema,
  webPageSchema,
} from '@front/lib/seo/schemas';
import { HOMEPAGE_FAQS, ALL_FAQS } from '@front/lib/seo/faq';
import {
  HOMEPAGE_HOWTO,
  DOCS_HOWTO,
  PRICING_FAQS,
  COMPARE_FAQS,
  SUPPORT_FAQS,
  USE_CASE_ITEMS,
  INTEGRATION_ITEMS,
  type SchemaListItem,
} from '@front/lib/seo/page-data';
import { MANIFEST } from '@front/content/manifest';
import type { ContentKind } from '@front/content/types';
import type { JsonLdBlock } from '@/components/json-ld';

const base = SITE.url;
const u = (p: string) => `${base}${p}`;
const crumbs = (trail: { name: string; url: string }[], pageId: string) =>
  breadcrumbSchema(trail, pageId);
const home = { name: 'Home', url: `${base}/` };

function listFrom(items: SchemaListItem[], pageUrl: string) {
  return itemListSchema(
    items.map((it) => ({
      url: it.url ?? `${pageUrl}#${it.id}`,
      name: it.name,
      description: it.description,
    })),
    pageUrl,
  );
}

/* ── Home ──────────────────────────────────────────────────────────────── */

export function homeLd(): JsonLdBlock[] {
  return [
    { id: 'software', data: softwareApplicationSchema() },
    {
      id: 'howto',
      data: howToSchema({ ...HOMEPAGE_HOWTO, pageId: `${base}/` }),
    },
    { id: 'faq-home', data: faqSchema(HOMEPAGE_FAQS, `${base}/`) },
    { id: 'breadcrumb-home', data: crumbs([home], `${base}/`) },
  ];
}

/* ── Pricing ───────────────────────────────────────────────────────────── */

export function pricingLd(): JsonLdBlock[] {
  const url = u('/pricing');
  return [
    {
      id: 'webpage-pricing',
      data: webPageSchema({
        url,
        name: 'Pricing — Cold Scout AI Lead Generation',
        description:
          'Simple, transparent pricing for Cold Scout. Free open-source self-hosting, Pro managed API, and Enterprise plans for agencies.',
      }),
    },
    { id: 'faq-pricing', data: faqSchema(PRICING_FAQS, url) },
    { id: 'service-pricing', data: serviceSchema() },
    {
      id: 'breadcrumb-pricing',
      data: crumbs([home, { name: 'Pricing', url }], url),
    },
  ];
}

/* ── FAQ ───────────────────────────────────────────────────────────────── */

export function faqLd(): JsonLdBlock[] {
  const url = u('/faq');
  return [
    { id: 'faq-page', data: faqSchema(ALL_FAQS, url) },
    {
      id: 'breadcrumb-faq',
      data: crumbs([home, { name: 'FAQ', url }], url),
    },
    {
      id: 'webpage-faq',
      data: webPageSchema({
        url,
        name: 'FAQ — Cold Scout AI Lead Generation Platform',
        description:
          'Frequently asked questions about Cold Scout — product, pricing, integrations, MCP server, AI models, deliverability, and GDPR compliance.',
      }),
    },
  ];
}

/* ── Compare ───────────────────────────────────────────────────────────── */

export function compareLd(): JsonLdBlock[] {
  const url = u('/compare');
  return [
    {
      id: 'webpage-compare',
      data: webPageSchema({
        url,
        name: 'Cold Scout vs Apollo vs Outreach vs Instantly — Comparison',
        description:
          'Honest side-by-side comparison of Cold Scout against Apollo, Outreach, and Instantly. Pricing, AI features, data sources, and where each tool wins.',
      }),
    },
    {
      id: 'breadcrumb-compare',
      data: crumbs([home, { name: 'Compare', url }], url),
    },
    { id: 'faq-compare', data: faqSchema(COMPARE_FAQS, url) },
  ];
}

/* ── Docs ──────────────────────────────────────────────────────────────── */

export function docsLd(): JsonLdBlock[] {
  const url = u('/docs');
  return [
    {
      id: 'breadcrumb-docs',
      data: crumbs([home, { name: 'Documentation', url }], url),
    },
    {
      id: 'tech-article-docs',
      data: articleSchema({
        type: 'TechArticle',
        url,
        headline: 'Cold Scout Documentation — Setup & API Guide',
        description:
          'Complete setup guide for Cold Scout: architecture, Google Maps API, Groq AI, Supabase, environment variables, and Docker deployment.',
        datePublished: '2024-01-01',
        dateModified: '2026-05-08',
        keywords: [
          'Cold Scout documentation',
          'AI lead generation setup',
          'FastAPI deployment',
          'Groq API',
          'Google Places API',
          'self-hosting',
        ],
      }),
    },
    { id: 'howto-docs', data: howToSchema({ ...DOCS_HOWTO, pageId: url }) },
    {
      id: 'service-mcp',
      data: {
        '@context': 'https://schema.org',
        '@type': 'Service',
        '@id': `${url}#mcp-service`,
        name: 'Cold Scout MCP Server',
        description:
          'Model Context Protocol (MCP) server that lets AI agents (Claude, GPT-4, Gemini) call Cold Scout lead generation endpoints directly.',
        provider: { '@id': `${base}/#organization` },
        serviceType: 'Model Context Protocol Server',
        areaServed: 'Worldwide',
        termsOfService: `${base}/terms`,
        url: `${url}#mcp`,
      },
    },
  ];
}

/* ── Use Cases ─────────────────────────────────────────────────────────── */

export function useCasesLd(): JsonLdBlock[] {
  const url = u('/use-cases');
  return [
    {
      id: 'webpage-use-cases',
      data: webPageSchema({
        url,
        name: 'Use Cases — Cold Scout for Freelancers, Agencies, SaaS, AI Agents',
        description:
          'Cold Scout use cases for freelancers, marketing agencies, SaaS go-to-market teams, and AI agent builders.',
      }),
    },
    {
      id: 'breadcrumb-use-cases',
      data: crumbs([home, { name: 'Use Cases', url }], url),
    },
    { id: 'itemlist-use-cases', data: listFrom(USE_CASE_ITEMS, url) },
  ];
}

/* ── Integrations ──────────────────────────────────────────────────────── */

export function integrationsLd(): JsonLdBlock[] {
  const url = u('/integrations');
  return [
    {
      id: 'webpage-integrations',
      data: webPageSchema({
        url,
        name: 'Integrations — Cold Scout AI Lead Generation Platform',
        description:
          'Cold Scout integrates with Google Places, Groq, Brevo, Supabase, Razorpay, Meta Threads, and the Model Context Protocol.',
      }),
    },
    {
      id: 'breadcrumb-integrations',
      data: crumbs([home, { name: 'Integrations', url }], url),
    },
    { id: 'itemlist-integrations', data: listFrom(INTEGRATION_ITEMS, url) },
  ];
}

/* ── Blog / Guides index ───────────────────────────────────────────────── */

function indexLd(kind: ContentKind): JsonLdBlock[] {
  const isBlog = kind === 'blog';
  const path = isBlog ? '/blog' : '/guides';
  const label = isBlog ? 'Blog' : 'Guides';
  const url = u(path);
  const posts = MANIFEST.filter((p) => p.kind === kind);
  return [
    {
      id: `webpage-${path.slice(1)}`,
      data: webPageSchema({
        url,
        name: `${label} — Cold Scout`,
        description: isBlog
          ? 'Articles, comparisons, and how-tos on AI lead generation, B2B outreach automation, and the engineering of modern sales pipelines.'
          : 'Technical guides for the Cold Scout open-source AI lead generation platform — self-hosting, MCP server setup, deliverability, and engineering deep-dives.',
      }),
    },
    {
      id: `breadcrumb-${path.slice(1)}`,
      data: crumbs([home, { name: label, url }], url),
    },
    {
      id: `itemlist-${path.slice(1)}`,
      data: itemListSchema(
        posts.map((p) => ({
          url: `${url}/${p.slug}`,
          name: p.title,
          description: p.description,
          image: p.heroImage,
        })),
        url,
      ),
    },
  ];
}

export const blogIndexLd = () => indexLd('blog');
export const guidesIndexLd = () => indexLd('guide');

/* ── Blog post / Guide (single) ────────────────────────────────────────── */

export function postLd(kind: ContentKind, slug: string): JsonLdBlock[] {
  const post = MANIFEST.find((p) => p.kind === kind && p.slug === slug);
  if (!post) return [];
  const isBlog = kind === 'blog';
  const label = isBlog ? 'Blog' : 'Guides';
  const listPath = isBlog ? '/blog' : '/guides';
  const url = `${base}${listPath}/${post.slug}`;
  return [
    {
      id: `article-${kind}-${post.slug}`,
      data: articleSchema({
        type: isBlog ? 'BlogPosting' : 'TechArticle',
        url,
        headline: post.title,
        description: post.description,
        image: post.heroImage,
        datePublished: post.publishedAt,
        dateModified: post.updatedAt ?? post.publishedAt,
        authorName: post.author,
        keywords: post.keywords,
        wordCount: post.wordCount,
      }),
    },
    {
      id: `breadcrumb-${kind}-${post.slug}`,
      data: crumbs(
        [home, { name: label, url: u(listPath) }, { name: post.title, url }],
        url,
      ),
    },
  ];
}

/* ── Support ───────────────────────────────────────────────────────────── */

export function supportLd(): JsonLdBlock[] {
  const url = u('/support');
  return [
    {
      id: 'support-page',
      data: {
        '@context': 'https://schema.org',
        '@type': 'ContactPage',
        '@id': `${url}#contact`,
        name: 'Customer Support — Cold Scout',
        url,
        description:
          'Get help with Cold Scout. Reach our support team via email or explore our self-service resources.',
        isPartOf: { '@id': `${base}/#website` },
        publisher: { '@id': `${base}/#organization` },
      },
    },
    { id: 'support-faq', data: faqSchema(SUPPORT_FAQS, url) },
    {
      id: 'support-breadcrumb',
      data: crumbs([home, { name: 'Customer Support', url }], url),
    },
  ];
}

/* ── Generic legal pages ───────────────────────────────────────────────── */

export function simplePageLd(opts: {
  path: string;
  name: string;
  description: string;
  crumbName: string;
}): JsonLdBlock[] {
  const url = u(opts.path);
  const slug = opts.path.replace(/\//g, '') || 'home';
  return [
    {
      id: `webpage-${slug}`,
      data: webPageSchema({ url, name: opts.name, description: opts.description }),
    },
    {
      id: `breadcrumb-${slug}`,
      data: crumbs([home, { name: opts.crumbName, url }], url),
    },
  ];
}
