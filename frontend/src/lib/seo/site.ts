/**
 * Single source of truth for site-wide SEO constants.
 *
 * Why this exists:
 *   index.html, useSEO, JSON-LD blocks, llms.txt, sitemap.xml, the OSS README,
 *   and the Vercel OG endpoint all reference the same site name, URLs, social
 *   handles, and pricing. Hard-coding them in 8 places means one of those 8
 *   inevitably drifts. Anything that's a "platform fact" lives here.
 *
 * Read paths:
 *   - JSX components → import from this module
 *   - Build scripts (sitemap, llms.txt) → import from this module
 *   - Edge functions → import from this module (it's plain ESM)
 *
 * Do NOT inline these strings anywhere else.
 */

export const SITE = {
  name: 'Cold Scout',
  legalName: 'Cold Scout',
  url: 'https://coldscout.colddsam.com',
  apiUrl: 'https://api.coldscout.colddsam.com',
  repository: 'https://github.com/colddsam/coldscout',
  releasesUrl: 'https://github.com/colddsam/coldscout/releases',
  issuesUrl: 'https://github.com/colddsam/coldscout/issues',
  foundingDate: '2024',
  inLanguage: 'en-US',
  locale: 'en_US',
  defaultOgImage: 'https://coldscout.colddsam.com/banner.png',
  defaultOgImageAlt: 'Cold Scout — AI Lead Generation Platform',
  logo512: 'https://coldscout.colddsam.com/web-app-manifest-512x512.png',
  twitterSite: '@ColdSc0ut',
  twitterCreator: '@colddsam',
  email: {
    support: 'admin@colddsam.com',
    sales: 'colddsam@gmail.com',
  },
  social: {
    github: 'https://github.com/colddsam/coldscout',
    twitter: 'https://x.com/ColdSc0ut',
  },
} as const;

/**
 * Default keywords used as the global meta `keywords` value when a page does
 * not provide its own. Page-level `keywords` should always override this.
 */
export const DEFAULT_KEYWORDS = [
  'AI lead generation platform',
  'Google Maps lead scraper',
  'B2B outreach automation',
  'open source lead generation',
  'cold email AI generator',
  'local business leads',
  'sales pipeline automation',
  'MCP server for lead generation',
].join(', ');

/**
 * Primary target keyword set surfaced on the landing page and in JSON-LD
 * `applicationCategory` / `keywords` fields. Order matters — first three are
 * the highest-priority terms.
 */
export const PRIMARY_KEYWORDS = [
  'AI lead generation platform',
  'Google Maps lead scraper',
  'B2B outreach automation',
  'open source lead generation',
  'cold email AI generator',
] as const;

/**
 * Public, indexable routes. Used by the sitemap generator and bot prerender
 * middleware to know which paths to consider. Keep in lockstep with App.tsx.
 *
 * `priority` and `changefreq` follow the sitemaps.org spec.
 */
export type PublicRoute = {
  path: string;
  priority: number;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  /** ISO 8601 date string. Sitemap generator uses this as `lastmod`. */
  lastmod?: string;
  /** When false, route is reachable but not added to sitemap (e.g. /demo/:id). */
  inSitemap?: boolean;
};

export const PUBLIC_ROUTES: PublicRoute[] = [
  { path: '/', priority: 1.0, changefreq: 'weekly' },
  { path: '/pricing', priority: 0.9, changefreq: 'monthly' },
  { path: '/docs', priority: 0.85, changefreq: 'weekly' },
  { path: '/faq', priority: 0.8, changefreq: 'monthly' },
  { path: '/compare', priority: 0.8, changefreq: 'monthly' },
  { path: '/use-cases', priority: 0.8, changefreq: 'monthly' },
  { path: '/integrations', priority: 0.75, changefreq: 'monthly' },
  { path: '/changelog', priority: 0.7, changefreq: 'weekly' },
  { path: '/blog', priority: 0.85, changefreq: 'weekly' },
  { path: '/guides', priority: 0.85, changefreq: 'weekly' },
  { path: '/support', priority: 0.7, changefreq: 'monthly' },
  { path: '/privacy', priority: 0.4, changefreq: 'yearly' },
  { path: '/terms', priority: 0.4, changefreq: 'yearly' },
  { path: '/refund-policy', priority: 0.4, changefreq: 'yearly' },
  { path: '/delete-data', priority: 0.3, changefreq: 'yearly' },
  { path: '/download', priority: 0.5, changefreq: 'monthly' },
];
