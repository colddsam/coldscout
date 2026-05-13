#!/usr/bin/env node
/**
 * Generate sitemap.xml, sitemap-index.xml, and content-meta.json from the
 * route + content registry. Runs as a Vite postbuild step (or standalone via
 * `node scripts/generate-seo-assets.mjs`).
 *
 * Outputs (overwritten each run):
 *   public/sitemap.xml             — main static sitemap
 *   public/sitemap-index.xml       — wraps sitemap.xml + sitemap-images.xml
 *                                    + the dynamic profile sitemap
 *   public/content-meta.json       — slug → {title, description} map for
 *                                    the prerender layer (blog + guides)
 *
 * Why a script instead of a build plugin:
 *   The route + content metadata lives in TS modules. Doing this from a tiny
 *   Node script keeps the build chain simple — no Rollup transform, no
 *   ts-node, no extra Vite plugins. We import the source modules directly
 *   via @rollup/pluginutils-style esbuild registration… nope, simpler: we
 *   read them and parse the relevant exports as JSON-shaped literals.
 *
 *   Even simpler: since both modules are pure data with no runtime concerns,
 *   we can use `esbuild` to bundle each into a temporary CJS file and
 *   require() it. esbuild is already a transitive dep of Vite — no new
 *   installs needed.
 */

import { build } from 'esbuild';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const SITE_URL = 'https://coldscout.colddsam.com';
const NOW = new Date().toISOString().split('T')[0];

/** Bundle a TS module to a temp ESM file and import it. */
async function loadTsModule(entry) {
  const out = join(tmpdir(), `cs-seo-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    outfile: out,
    logLevel: 'error',
    // Inline everything — including imported TS modules.
    external: [],
  });
  // Bust ESM module cache.
  return import(`${pathToFileURL(out).href}?t=${Date.now()}`);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlBlock({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    priority != null ? `    <priority>${priority.toFixed(1)}</priority>` : null,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');
}

async function main() {
  const routeMod = await loadTsModule(resolve(ROOT, 'src/lib/seo/route-meta.ts'));
  const manifestMod = await loadTsModule(resolve(ROOT, 'src/content/manifest.ts'));

  const routes = routeMod.ROUTE_META.filter((r) => r.inSitemap !== false);
  // Wrap manifest entries to look like { meta: ... } for code below.
  const blog = manifestMod.BLOG_MANIFEST.map((meta) => ({ meta }));
  const guides = manifestMod.GUIDE_MANIFEST.map((meta) => ({ meta }));

  // ─── public/sitemap.xml ────────────────────────────────────────────────
  const urls = [
    ...routes.map((r) => ({
      loc: `${SITE_URL}${r.path === '/' ? '/' : r.path}`,
      lastmod: r.lastmod ?? NOW,
      changefreq: r.changefreq ?? 'monthly',
      priority: r.priority ?? 0.5,
    })),
    ...blog.map((e) => ({
      loc: `${SITE_URL}/blog/${e.meta.slug}`,
      lastmod: e.meta.updatedAt ?? e.meta.publishedAt,
      changefreq: 'monthly',
      priority: 0.7,
    })),
    ...guides.map((e) => ({
      loc: `${SITE_URL}/guides/${e.meta.slug}`,
      lastmod: e.meta.updatedAt ?? e.meta.publishedAt,
      changefreq: 'monthly',
      priority: 0.7,
    })),
  ];

  // Add the homepage banner image to the homepage entry as an inline image
  // tag (kept simple; the dedicated image sitemap stays for fuller coverage).
  const sitemapXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    urls.map(urlBlock).join('\n'),
    '</urlset>',
    '',
  ].join('\n');

  // ─── public/sitemap-index.xml ──────────────────────────────────────────
  const sitemapIndexXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <sitemap><loc>${SITE_URL}/sitemap.xml</loc><lastmod>${NOW}</lastmod></sitemap>`,
    `  <sitemap><loc>${SITE_URL}/sitemap-images.xml</loc><lastmod>${NOW}</lastmod></sitemap>`,
    `  <sitemap><loc>${SITE_URL}/api/v1/seo/sitemap-profiles.xml</loc><lastmod>${NOW}</lastmod></sitemap>`,
    `  <sitemap><loc>${SITE_URL}/api/v1/seo/sitemap-directory.xml</loc><lastmod>${NOW}</lastmod></sitemap>`,
    '</sitemapindex>',
    '',
  ].join('\n');

  // ─── public/content-meta.json ──────────────────────────────────────────
  const contentMeta = {};
  for (const e of blog) {
    contentMeta[`/blog/${e.meta.slug}`] = {
      title: e.meta.title,
      description: e.meta.description,
    };
  }
  for (const e of guides) {
    contentMeta[`/guides/${e.meta.slug}`] = {
      title: e.meta.title,
      description: e.meta.description,
    };
  }

  // ─── write outputs ─────────────────────────────────────────────────────
  const publicDir = resolve(ROOT, 'public');
  const distDir = resolve(ROOT, 'dist');
  if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

  writeFileSync(resolve(publicDir, 'sitemap.xml'), sitemapXml, 'utf-8');
  writeFileSync(resolve(publicDir, 'sitemap-index.xml'), sitemapIndexXml, 'utf-8');
  writeFileSync(resolve(publicDir, 'content-meta.json'), JSON.stringify(contentMeta, null, 2), 'utf-8');

  // Mirror to dist if it exists (so prerender endpoint can read at runtime).
  if (existsSync(distDir)) {
    writeFileSync(resolve(distDir, 'sitemap.xml'), sitemapXml, 'utf-8');
    writeFileSync(resolve(distDir, 'sitemap-index.xml'), sitemapIndexXml, 'utf-8');
    writeFileSync(resolve(distDir, 'content-meta.json'), JSON.stringify(contentMeta, null, 2), 'utf-8');
  }

  console.log('✓ generate-seo-assets:');
  console.log(`  ${urls.length} URLs in sitemap.xml`);
  console.log(`  ${blog.length} blog + ${guides.length} guide entries in content-meta.json`);
  console.log(`  sitemap-index.xml wraps 3 sitemaps`);
}

main().catch((err) => {
  console.error('✗ generate-seo-assets failed:', err);
  process.exit(1);
});
