/**
 * Reusable Schema.org JSON-LD builders.
 *
 * Every public page should call one or more of these helpers and pass the
 * results to <JsonLd>. Centralizing here means:
 *   1. Pricing/plan changes flow from one constants file to every schema.
 *   2. We can reference the canonical Organization / WebSite / SoftwareApplication
 *      nodes by @id from any page.
 *   3. The build-time prerenderer can serialize the same shapes the runtime uses.
 */

import { SITE, PRIMARY_KEYWORDS } from './site';
import { BASE_PRICING, PLANS, type Plan } from './pricing';

type JsonLd = Record<string, unknown>;

/* ── Shared @id references ─────────────────────────────────────────────── */

export const ORG_ID = `${SITE.url}/#organization`;
export const WEBSITE_ID = `${SITE.url}/#website`;
export const SOFTWARE_APP_ID = `${SITE.url}/#software`;

/* ── Organization ──────────────────────────────────────────────────────── */

export function organizationSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE.name,
    legalName: SITE.legalName,
    url: `${SITE.url}/`,
    logo: {
      '@type': 'ImageObject',
      url: SITE.logo512,
      width: 512,
      height: 512,
    },
    image: SITE.defaultOgImage,
    description:
      'AI-powered lead generation platform that discovers, qualifies, and engages local business leads at scale. Automate your entire outreach pipeline from search to inbox.',
    foundingDate: SITE.foundingDate,
    email: SITE.email.support,
    contactPoint: [
      {
        '@type': 'ContactPoint',
        email: SITE.email.support,
        contactType: 'customer support',
        availableLanguage: 'English',
      },
      {
        '@type': 'ContactPoint',
        email: SITE.email.sales,
        contactType: 'sales',
        availableLanguage: 'English',
      },
    ],
    sameAs: [SITE.social.github, SITE.social.twitter],
  };
}

/* ── WebSite (with sitelinks searchbox + speakable) ────────────────────── */

export function websiteSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE.name,
    alternateName: 'Cold Scout AI Lead Generation',
    url: `${SITE.url}/`,
    description:
      'AI-powered lead generation platform that discovers, qualifies, and engages local business leads at scale.',
    publisher: { '@id': ORG_ID },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE.url}/docs?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
    inLanguage: SITE.inLanguage,
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['h1', '.text-gradient', "meta[name='description']"],
      url: [`${SITE.url}/`, `${SITE.url}/pricing`, `${SITE.url}/docs`, `${SITE.url}/faq`],
    },
  };
}

/* ── SoftwareApplication (homepage + landing) ──────────────────────────── */

function planToOffer(plan: Plan): JsonLd {
  return {
    '@type': 'Offer',
    name: plan.name,
    description: plan.shortDescription,
    price: String(plan.inrPerMonth),
    priceCurrency: 'INR',
    availability: 'https://schema.org/InStock',
    url: plan.offerUrl,
    ...(plan.inrPerMonth > 0 && {
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: String(plan.inrPerMonth),
        priceCurrency: 'INR',
        unitCode: 'MON',
        billingDuration: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
      },
    }),
  };
}

export function softwareApplicationSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': SOFTWARE_APP_ID,
    name: SITE.name,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'SalesApplication',
    operatingSystem: 'Web, Linux, macOS, Windows (Docker)',
    url: `${SITE.url}/`,
    image: SITE.defaultOgImage,
    description:
      'AI-powered lead generation platform: discover local businesses on Google Maps, AI-qualify each lead, generate personalized cold emails, and run the entire outreach pipeline. Open source self-host or managed SaaS.',
    keywords: PRIMARY_KEYWORDS.join(', '),
    publisher: { '@id': ORG_ID },
    softwareVersion: '1.x',
    inLanguage: SITE.inLanguage,
    featureList: [
      'Google Maps lead discovery',
      'AI lead qualification (Llama 3.3 70B)',
      'AI personalized cold email generation',
      'Brevo SMTP outreach with tracking',
      'Pipeline analytics dashboard',
      'MCP server for AI agents',
      'Open source self-host (Docker, pip)',
      'Meta Threads engagement pipeline',
    ],
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'INR',
      lowPrice: '0',
      highPrice: String(BASE_PRICING.enterprise.inrPerMonth),
      offerCount: PLANS.length,
      offers: PLANS.map(planToOffer),
    },
  };
}

/* ── Service (pricing page) ────────────────────────────────────────────── */

export function serviceSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${SITE.url}/pricing#service`,
    name: 'Cold Scout AI Lead Generation',
    description:
      'AI-powered lead generation platform that discovers, qualifies, and engages local business leads at scale.',
    provider: { '@id': ORG_ID },
    serviceType: 'AI Lead Generation',
    areaServed: 'Worldwide',
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Cold Scout Plans',
      itemListElement: PLANS.map(planToOffer),
    },
  };
}

/* ── BreadcrumbList ────────────────────────────────────────────────────── */

export function breadcrumbSchema(
  trail: { name: string; url: string }[],
  pageId?: string,
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    ...(pageId && { '@id': `${pageId}#breadcrumb` }),
    itemListElement: trail.map((node, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: node.name,
      item: node.url,
    })),
  };
}

/* ── FAQPage ───────────────────────────────────────────────────────────── */

export interface Faq {
  q: string;
  a: string;
}

export function faqSchema(faqs: Faq[], pageId?: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    ...(pageId && { '@id': `${pageId}#faq` }),
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };
}

/* ── HowTo ─────────────────────────────────────────────────────────────── */

export interface HowToStep {
  name: string;
  text: string;
  url?: string;
}

export function howToSchema(args: {
  name: string;
  description: string;
  steps: HowToStep[];
  totalTimeISO?: string;
  pageId?: string;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    ...(args.pageId && { '@id': `${args.pageId}#howto` }),
    name: args.name,
    description: args.description,
    ...(args.totalTimeISO && { totalTime: args.totalTimeISO }),
    step: args.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
      ...(s.url && { url: s.url }),
    })),
  };
}

/* ── Article / BlogPosting ─────────────────────────────────────────────── */

export interface ArticleArgs {
  type?: 'BlogPosting' | 'Article' | 'TechArticle';
  url: string;
  headline: string;
  description: string;
  image?: string;
  datePublished: string;
  dateModified?: string;
  authorName?: string;
  authorUrl?: string;
  keywords?: string[];
  wordCount?: number;
}

export function articleSchema(a: ArticleArgs): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': a.type ?? 'BlogPosting',
    '@id': `${a.url}#article`,
    headline: a.headline,
    description: a.description,
    image: a.image ?? SITE.defaultOgImage,
    url: a.url,
    datePublished: a.datePublished,
    dateModified: a.dateModified ?? a.datePublished,
    author: {
      '@type': 'Person',
      name: a.authorName ?? 'Cold Scout Team',
      url: a.authorUrl ?? `${SITE.url}/`,
    },
    publisher: { '@id': ORG_ID },
    mainEntityOfPage: { '@type': 'WebPage', '@id': a.url },
    inLanguage: SITE.inLanguage,
    ...(a.keywords && { keywords: a.keywords.join(', ') }),
    ...(a.wordCount && { wordCount: a.wordCount }),
  };
}

/* ── ItemList (e.g. /blog index, /guides index) ────────────────────────── */

export interface ListItemArgs {
  url: string;
  name: string;
  description?: string;
  image?: string;
}

export function itemListSchema(items: ListItemArgs[], pageId?: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    ...(pageId && { '@id': `${pageId}#list` }),
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: it.url,
      name: it.name,
      ...(it.description && { description: it.description }),
      ...(it.image && { image: it.image }),
    })),
  };
}

/* ── WebPage (generic wrapper for non-article pages) ───────────────────── */

export function webPageSchema(args: {
  url: string;
  name: string;
  description: string;
  dateModified?: string;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${args.url}#webpage`,
    name: args.name,
    url: args.url,
    description: args.description,
    isPartOf: { '@id': WEBSITE_ID },
    breadcrumb: { '@id': `${args.url}#breadcrumb` },
    ...(args.dateModified && { dateModified: args.dateModified }),
    inLanguage: SITE.inLanguage,
  };
}
