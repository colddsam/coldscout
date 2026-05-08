/**
 * Vercel Edge Middleware — bot prerender router.
 *
 * Detects search-engine crawlers and social-card scrapers by User-Agent and
 * rewrites their requests to /api/prerender, where the SPA shell is served
 * with route-specific meta + JSON-LD already injected. Real users hit the
 * regular SPA path unchanged.
 *
 * Why rewrite (not redirect):
 *   Search engines treat 301/302 chains differently from rewrites. A rewrite
 *   keeps the URL the same in the response while letting us serve different
 *   HTML — which is exactly what we want for prerendered meta.
 *
 * Why match by UA at all:
 *   Twitter, LinkedIn, Slack, Discord, FB, and the AI engines (Perplexity,
 *   ChatGPT, ClaudeBot) read the raw HTML response. They typically don't run
 *   JS. Without prerender, they see the SPA shell with the static
 *   index.html meta — which is decent but not per-route. With prerender,
 *   they see route-specific titles, descriptions, and OG images.
 *
 * Bypass paths: assets, the API folder itself, robots/sitemap/llms.txt.
 */

const BOT_UA_RE = new RegExp(
  [
    // Search engines
    'googlebot',
    'bingbot',
    'slurp',
    'duckduckbot',
    'baiduspider',
    'yandexbot',
    'sogou',
    'applebot',
    // Social previews
    'twitterbot',
    'facebookexternalhit',
    'facebot',
    'linkedinbot',
    'slackbot',
    'discordbot',
    'whatsapp',
    'telegrambot',
    'pinterestbot',
    'redditbot',
    // AI / answer engines
    'gptbot',
    'oai-searchbot',
    'chatgpt-user',
    'perplexitybot',
    'claude-web',
    'anthropic-ai',
    'claudebot',
    'cohere-ai',
    'google-extended',
    'ccbot',
    'amazonbot',
    'mistralai',
  ].join('|'),
  'i',
);

const ASSET_RE = /\.(?:js|css|png|jpe?g|webp|avif|svg|ico|woff2?|ttf|otf|map|json|xml|txt|webmanifest)$/i;

const NEVER_REWRITE_PREFIX = ['/api', '/assets', '/_vercel', '/_next', '/.well-known'];

export const config = {
  // Match all paths except static asset extensions and API. We further filter
  // inside the function — the matcher is the cheapest gate.
  matcher: ['/((?!api|assets|_vercel|_next|.*\\..*).*)'],
};

export default async function middleware(req: Request) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Hard bypass — these never get rewritten regardless of UA.
  if (NEVER_REWRITE_PREFIX.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return;
  }
  if (ASSET_RE.test(pathname)) return;

  const ua = req.headers.get('user-agent') ?? '';
  if (!BOT_UA_RE.test(ua)) return;

  // Rewrite (not redirect): fetch the prerender endpoint server-side and
  // return its response so the bot keeps the original URL but receives
  // the prerendered HTML body. A redirect would change the URL and break
  // the canonicalization story.
  const rewriteUrl = new URL('/api/prerender', url.origin);
  rewriteUrl.searchParams.set('path', pathname);

  const upstream = await fetch(rewriteUrl, {
    headers: {
      // Forward minimal context so the prerender knows it's a bot fetch.
      'x-cold-scout-bot': '1',
      'user-agent': ua,
    },
  });

  // Pass the response straight through (preserve status, headers, body).
  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}
