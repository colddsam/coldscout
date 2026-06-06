/**
 * Bridges the shared SEO metadata (ROUTE_META + SITE) into the Next.js
 * Metadata API. Each public route exports `routeMetadata('/path')` (or builds
 * a Metadata object from a RouteMeta) so crawlers get real server-rendered
 * <head> tags — replacing the old bot-prerender middleware.
 */
import type { Metadata } from 'next';
import { SITE } from '@front/lib/seo/site';
import {
  findRouteMeta,
  SITE_DEFAULT_META,
  type RouteMeta,
} from '@front/lib/seo/route-meta';
import { MANIFEST } from '@front/content/manifest';
import type { ContentKind, PostMeta } from '@front/content/types';

export const metadataBase = new URL(SITE.url);

function canonicalFor(p: string): string {
  if (p === '/' || p === '') return `${SITE.url}/`;
  return `${SITE.url}${p.startsWith('/') ? p : `/${p}`}`;
}

/**
 * Build an absolute URL to the dynamic OG card endpoint (/api/og) so each page
 * gets a unique 1200x630 social image. Mirrors frontend/src/lib/seo/og.ts but
 * runs server-side (in generateMetadata) so crawlers see the per-page card.
 * Set VITE_PUBLIC_OG_DISABLED=1 to fall back to the static banner everywhere.
 */
export function ogImageUrl(args: {
  title: string;
  subtitle?: string;
  kind?: 'page' | 'profile' | 'article' | 'guide' | 'pricing' | 'blog';
  badge?: string;
}): string {
  if (process.env.VITE_PUBLIC_OG_DISABLED === '1') return SITE.defaultOgImage;
  const p = new URLSearchParams();
  p.set('title', args.title);
  if (args.subtitle) p.set('subtitle', args.subtitle);
  if (args.kind) p.set('kind', args.kind);
  if (args.badge) p.set('badge', args.badge);
  return `${SITE.url}/api/og?${p.toString()}`;
}

export function metaFrom(rm: RouteMeta): Metadata {
  const canonical = canonicalFor(rm.path);
  const index = rm.index ?? true;
  const follow = rm.follow ?? index;
  const ogType = (rm.ogType as 'website' | 'article' | undefined) ?? 'website';
  // Respect an explicit ogImage; otherwise generate a per-page dynamic card.
  const ogImage =
    rm.ogImage ??
    ogImageUrl({
      title: rm.title,
      subtitle: rm.description,
      kind: ogType === 'article' ? 'article' : 'page',
    });

  return {
    title: rm.title,
    description: rm.description,
    keywords: rm.keywords,
    alternates: {
      canonical,
      languages: { en: canonical, 'x-default': canonical },
    },
    robots: {
      index,
      follow,
      googleBot: {
        index,
        follow,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
    openGraph: {
      type: ogType,
      url: canonical,
      siteName: SITE.name,
      title: rm.title,
      description: rm.description,
      locale: 'en_US',
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: SITE.defaultOgImageAlt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      site: SITE.twitterSite,
      title: rm.title,
      description: rm.description,
      images: [ogImage],
    },
  };
}

/** Build Next Metadata for a known static route path (from ROUTE_META). */
export function routeMetadata(path: string): Metadata {
  const rm = findRouteMeta(path) ?? { ...SITE_DEFAULT_META, path };
  return metaFrom(rm);
}

/* ── Content (blog / guides) ───────────────────────────────────────────── */

export function findPost(kind: ContentKind, slug: string): PostMeta | undefined {
  return MANIFEST.find((p) => p.kind === kind && p.slug === slug);
}

export function postSlugs(kind: ContentKind): string[] {
  return MANIFEST.filter((p) => p.kind === kind).map((p) => p.slug);
}

/** Article-type Metadata for a blog post / guide. Returns undefined if unknown. */
export function postMetadata(kind: ContentKind, slug: string): Metadata {
  const post = findPost(kind, slug);
  if (!post) {
    return { title: 'Not Found', robots: { index: false, follow: false } };
  }
  const canonical = `${SITE.url}/${kind === 'blog' ? 'blog' : 'guides'}/${post.slug}`;
  const ogImage =
    post.heroImage ??
    ogImageUrl({
      title: post.title,
      subtitle: post.description,
      kind: kind === 'blog' ? 'blog' : 'guide',
      badge: post.category?.toUpperCase(),
    });
  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical, languages: { en: canonical, 'x-default': canonical } },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
    authors: post.author ? [{ name: post.author }] : undefined,
    openGraph: {
      type: 'article',
      url: canonical,
      siteName: SITE.name,
      title: post.title,
      description: post.description,
      locale: 'en_US',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt ?? post.publishedAt,
      authors: post.author ? [post.author] : undefined,
      tags: post.keywords,
      images: [{ url: ogImage, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: 'summary_large_image',
      site: SITE.twitterSite,
      title: post.title,
      description: post.description,
      images: [ogImage],
    },
  };
}
