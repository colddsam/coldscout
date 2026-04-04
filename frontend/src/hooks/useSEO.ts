/**
 * useSEO — Dynamic page-level SEO hook.
 *
 * Updates `<title>`, `<meta>` description, canonical, Open Graph, Twitter Card,
 * and robots directives for each page. Works without any external library
 * by directly manipulating `document.head`.
 *
 * Usage:
 *   useSEO({
 *     title: 'Pricing — Cold Scout',
 *     description: 'Simple, transparent pricing...',
 *     canonical: 'https://coldscout.colddsam.com/pricing',
 *   });
 */

import { useEffect } from 'react';

interface SEOOptions {
  /** Page title — recommended ≤60 chars. */
  title: string;
  /** Meta description — recommended 120–160 chars. */
  description: string;
  /** Absolute canonical URL for this page. */
  canonical?: string;
  ogImage?: string;
  /** Override og:type. Defaults to "website". */
  ogType?: string;
  /** Alt text for the OG image — recommended for a11y + SEO. */
  ogImageAlt?: string;
  /** Whether search engines should index this page. Defaults to true. */
  index?: boolean;
  /** Additional keywords for this page. */
  keywords?: string;
  /** Article published date (ISO 8601) for article pages. */
  publishedTime?: string;
  /** Article modified date (ISO 8601) for article pages. */
  modifiedTime?: string;
}

const SITE_NAME = 'Cold Scout';
const BASE_URL = 'https://coldscout.colddsam.com';
const DEFAULT_OG_IMAGE = `${BASE_URL}/banner.png`;
const DEFAULT_KEYWORDS =
  'AI lead generation, local business leads, cold outreach automation, sales pipeline, B2B leads, automated prospecting';
const TWITTER_SITE = '@ColdSc0ut';

function setMeta(name: string, content: string, isProperty = false) {
  const attr = isProperty ? 'property' : 'name';
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string, extra: Record<string, string> = {}) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
  for (const [k, v] of Object.entries(extra)) {
    el.setAttribute(k, v);
  }
}

export function useSEO({
  title,
  description,
  canonical,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = 'website',
  ogImageAlt = 'Cold Scout — AI Lead Generation Platform',
  index = true,
  keywords,
  publishedTime,
  modifiedTime,
}: SEOOptions) {
  useEffect(() => {
    // Title
    document.title = title;

    // Description
    setMeta('description', description);

    // Keywords
    setMeta('keywords', keywords ?? DEFAULT_KEYWORDS);

    // Robots — fine-grained directives for maximum crawl budget efficiency
    if (index) {
      setMeta('robots', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
      setMeta('googlebot', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
    } else {
      setMeta('robots', 'noindex, nofollow');
      setMeta('googlebot', 'noindex, nofollow');
    }

    // Canonical
    if (canonical) setLink('canonical', canonical);

    // Alternate hreflang (English) — use specific selector to avoid overwriting x-default
    if (canonical) {
      let enLink = document.head.querySelector<HTMLLinkElement>('link[rel="alternate"][hreflang="en"]');
      if (!enLink) {
        enLink = document.createElement('link');
        enLink.rel = 'alternate';
        enLink.setAttribute('hreflang', 'en');
        document.head.appendChild(enLink);
      }
      enLink.href = canonical;
    }

    // Open Graph
    setMeta('og:type', ogType, true);
    setMeta('og:title', title, true);
    setMeta('og:description', description, true);
    setMeta('og:image', ogImage, true);
    setMeta('og:image:secure_url', ogImage, true);
    setMeta('og:url', canonical ?? `${BASE_URL}/`, true);
    setMeta('og:site_name', SITE_NAME, true);
    setMeta('og:locale', 'en_US', true);

    // Social Image Dimensions (if banner.png, use standard 1200x630)
    if (ogImage.includes('banner.png')) {
      setMeta('og:image:width', '1200', true);
      setMeta('og:image:height', '630', true);
      setMeta('og:image:type', 'image/png', true);
    }
    setMeta('og:image:alt', ogImageAlt, true);

    // Article dates (for docs and blog-style pages)
    if (publishedTime) setMeta('article:published_time', publishedTime, true);
    if (modifiedTime) setMeta('article:modified_time', modifiedTime, true);

    // Twitter Card
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:site', TWITTER_SITE);
    setMeta('twitter:url', canonical ?? `${BASE_URL}/`);
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);
    setMeta('twitter:image', ogImage);
    setMeta('twitter:image:alt', ogImageAlt);

  }, [title, description, canonical, ogImage, ogType, ogImageAlt, index, keywords, publishedTime, modifiedTime]); // eslint-disable-line react-hooks/exhaustive-deps
}
