/**
 * OG image URL builder.
 *
 * Returns an absolute URL pointing at the Vercel Edge OG endpoint with
 * encoded parameters. Use as the `ogImage` value to useSEO so each page
 * gets a unique social card.
 *
 * Local dev:
 *   The /api/og.tsx edge function only runs on Vercel. In `vite dev`, the
 *   path 404s — so callers should fall back to SITE.defaultOgImage. The
 *   `VITE_PUBLIC_OG_DISABLED=1` env variable forces the static banner
 *   everywhere if you want to opt out for any reason.
 */
import { SITE } from './site';

export interface OgImageArgs {
  title: string;
  subtitle?: string;
  kind?: 'page' | 'profile' | 'article' | 'guide' | 'pricing' | 'blog';
  badge?: string;
}

const DISABLED = import.meta.env.VITE_PUBLIC_OG_DISABLED === '1';

export function buildOgImage({ title, subtitle, kind, badge }: OgImageArgs): string {
  if (DISABLED) return SITE.defaultOgImage;

  const params = new URLSearchParams();
  params.set('title', title);
  if (subtitle) params.set('subtitle', subtitle);
  if (kind) params.set('kind', kind);
  if (badge) params.set('badge', badge);

  return `${SITE.url}/api/og?${params.toString()}`;
}
