#!/usr/bin/env node
/**
 * IndexNow ping — tells Bing, Yandex, and Yep about updated URLs in one
 * lightweight request. Google does not accept IndexNow today (uses Search
 * Console pings instead) but every other major engine does, and a single
 * call covers them all.
 *
 * Usage:
 *   COLDSCOUT_INDEXNOW_KEY=<32-char hex> node scripts/indexnow-ping.mjs
 *
 *   The key must also be served at:
 *     https://coldscout.colddsam.com/<KEY>.txt
 *   containing the same key on a single line. Drop a file in public/ named
 *   <KEY>.txt before deploying. (You only need to do this once.)
 *
 * What it submits:
 *   - Every URL in public/sitemap.xml that we just generated.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), '..');

const HOST = 'coldscout.colddsam.com';
const KEY = process.env.COLDSCOUT_INDEXNOW_KEY;

if (!KEY) {
  console.log('⏭  IndexNow skipped — set COLDSCOUT_INDEXNOW_KEY env var to enable.');
  process.exit(0);
}

const sitemapPath = resolve(ROOT, 'public', 'sitemap.xml');
if (!existsSync(sitemapPath)) {
  console.log('⏭  IndexNow skipped — public/sitemap.xml does not exist yet.');
  process.exit(0);
}

const xml = readFileSync(sitemapPath, 'utf-8');
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

if (urls.length === 0) {
  console.log('⏭  IndexNow skipped — no URLs in sitemap.');
  process.exit(0);
}

const body = {
  host: HOST,
  key: KEY,
  keyLocation: `https://${HOST}/${KEY}.txt`,
  urlList: urls,
};

try {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    console.log(`✓ IndexNow: submitted ${urls.length} URLs (HTTP ${res.status})`);
  } else {
    const text = await res.text();
    console.warn(`⚠ IndexNow: HTTP ${res.status} — ${text}`);
    process.exit(0);
  }
} catch (err) {
  console.warn('⚠ IndexNow request failed:', err.message);
  process.exit(0);
}
