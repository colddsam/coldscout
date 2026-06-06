import type { MetadataRoute } from 'next';
import { SITE, PUBLIC_ROUTES } from '@front/lib/seo/site';
import { MANIFEST } from '@front/content/manifest';

// Regenerated daily; always reflects current routes + content manifest.
export const revalidate = 86400;

type ChangeFreq = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE.url;

  // Static public routes from the shared SITE config, plus /scanner which is
  // public+indexable but not in PUBLIC_ROUTES.
  const staticRoutes = [
    ...PUBLIC_ROUTES,
    { path: '/scanner', priority: 0.8, changefreq: 'weekly' as ChangeFreq },
  ];

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((r) => ({
    url: r.path === '/' ? `${base}/` : `${base}${r.path}`,
    changeFrequency: r.changefreq as ChangeFreq,
    priority: r.priority,
    ...(r.lastmod ? { lastModified: new Date(r.lastmod) } : {}),
  }));

  // Blog posts + guides from the content manifest.
  const postEntries: MetadataRoute.Sitemap = MANIFEST.map((p) => ({
    url: `${base}/${p.kind === 'blog' ? 'blog' : 'guides'}/${p.slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
    lastModified: new Date(p.updatedAt ?? p.publishedAt),
  }));

  return [...staticEntries, ...postEntries];
}
