/**
 * Shape every blog post and guide must satisfy.
 *
 * Each content file exports `meta: PostMeta` plus a default React component.
 * The registry in `index.ts` collects them so the listing pages, sitemap
 * generator, and llms.txt builder can iterate over the catalog without
 * importing every body component up front.
 */

export type ContentKind = 'blog' | 'guide';

export interface PostMeta {
  /** URL slug. Lowercase, hyphenated. Must be unique within `kind`. */
  slug: string;
  /** Top-level kind — drives the URL prefix and listing page. */
  kind: ContentKind;
  /** Page title (≤70 chars ideal). */
  title: string;
  /** Meta description (120–160 chars). */
  description: string;
  /** ISO 8601 publish date (YYYY-MM-DD). */
  publishedAt: string;
  /** ISO 8601 last-update date. */
  updatedAt?: string;
  /** Approximate read time in minutes — surfaced to the reader. */
  readMinutes: number;
  /** Author name (default: 'Cold Scout Team'). */
  author?: string;
  /** Targeted keywords for this article — flow into JSON-LD + meta keywords. */
  keywords: string[];
  /** Hero image URL (defaults to site banner). */
  heroImage?: string;
  /** Approx. word count — fed to JSON-LD `wordCount`. */
  wordCount?: number;
  /** When true, the post is a stub/outline and shows a CTA to subscribe. */
  isOutline?: boolean;
  /** Category badge shown in the listing. */
  category: string;
}
