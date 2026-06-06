/**
 * Dynamic Open Graph image — ported from frontend/api/og.tsx to a Next.js
 * route handler using the built-in next/og (Satori) renderer.
 *
 * Endpoint: /api/og?title=...&subtitle=...&kind=page|profile|article&badge=...
 * Output:   1200x630 PNG, edge-rendered, cached 24h.
 *
 * The shared client code builds absolute `${SITE.url}/api/og?...` URLs via
 * lib/seo/og.ts, so this must live on the same origin as the web app.
 */
import { ImageResponse } from 'next/og';

export const runtime = 'edge';

const SITE_NAME = 'Cold Scout';
const TAGLINE_DEFAULT = 'AI Lead Generation Platform';

const KIND_BADGE: Record<string, string> = {
  page: 'PAGE',
  profile: 'PROFILE',
  article: 'ARTICLE',
  guide: 'GUIDE',
  pricing: 'PRICING',
  blog: 'BLOG',
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const title = (searchParams.get('title') ?? SITE_NAME).slice(0, 120);
  const subtitle = (searchParams.get('subtitle') ?? TAGLINE_DEFAULT).slice(0, 200);
  const kind = (searchParams.get('kind') ?? 'page').toLowerCase();
  const badge = searchParams.get('badge') ?? KIND_BADGE[kind] ?? 'COLD SCOUT';

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          backgroundColor: '#000000',
          backgroundImage:
            'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.06) 0, transparent 35%), radial-gradient(circle at 80% 75%, rgba(255,255,255,0.04) 0, transparent 35%)',
          padding: '80px',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#000000',
                fontSize: '24px',
                fontWeight: 800,
                letterSpacing: '-0.04em',
              }}
            >
              C
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em' }}>
              {SITE_NAME}
            </div>
          </div>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              letterSpacing: '0.18em',
              color: '#A0A0A0',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: '999px',
              padding: '6px 16px',
              textTransform: 'uppercase',
            }}
          >
            {badge}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '24px',
            maxWidth: '1040px',
          }}
        >
          <div
            style={{
              fontSize: title.length > 70 ? '60px' : '76px',
              fontWeight: 800,
              letterSpacing: '-0.04em',
              lineHeight: 1.05,
              color: '#FFFFFF',
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: '28px', color: '#B0B0B0', lineHeight: 1.4, maxWidth: '900px' }}>
              {subtitle}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#888888',
            fontSize: '20px',
          }}
        >
          <span>coldscout.colddsam.com</span>
          <span style={{ color: '#FFFFFF', fontWeight: 600 }}>Discover · Qualify · Engage</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'cache-control':
          'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400',
      },
    },
  );
}
