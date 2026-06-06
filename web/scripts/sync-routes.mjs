#!/usr/bin/env node
/**
 * Route sync + parity guard between the web (Next.js) app and the Android
 * (frontend) app, driven by the single source of truth:
 *   frontend/src/routes.manifest.ts
 *
 * Android stays in sync automatically (App.tsx builds <Routes> from the
 * manifest at runtime). This script keeps the WEB file-based routes in sync:
 *
 *   --write   Scaffold web/src/app/<route>/page.tsx (+ client.tsx) for every
 *             manifest route that has no web page yet. Never overwrites
 *             existing files.
 *   --check   Fail (exit 1) if any manifest route is missing its web page, or
 *             if a web page exists with no matching manifest route (orphan), or
 *             if App.tsx is no longer manifest-driven. Used by the pre-commit
 *             hook and CI.
 *
 * Usage:
 *   node web/scripts/sync-routes.mjs --check
 *   node web/scripts/sync-routes.mjs --write
 */
import esbuild from 'esbuild';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(SCRIPT_DIR, '..');          // web/
const WEB_SRC = join(WEB_ROOT, 'src');            // web/src
const WEB_APP = join(WEB_SRC, 'app');             // web/src/app
const MANIFEST_TS = join(WEB_ROOT, '..', 'frontend', 'src', 'routes.manifest.ts');
const APP_TSX = join(WEB_ROOT, '..', 'frontend', 'src', 'App.tsx');

const MODE = process.argv.includes('--write') ? 'write' : 'check';

/* ── Load the TS manifest (pure data, no relative imports) ───────────── */
async function loadManifest() {
  const src = readFileSync(MANIFEST_TS, 'utf8');
  const { code } = await esbuild.transform(src, { loader: 'ts', format: 'esm' });
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  return import(url);
}

/* ── Helpers ────────────────────────────────────────────────────────── */
function basename(component) {
  const i = component.lastIndexOf('/');
  return i === -1 ? component : component.slice(i + 1);
}

function walkPageFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkPageFiles(full, out);
    else if (entry.name === 'page.tsx') out.push(full);
  }
  return out;
}

/** web/src/app/<...>/page.tsx → route path ('/leads/:id'), dropping (groups). */
function fileToRoutePath(pageFile) {
  const rel = relative(WEB_APP, pageFile).split(/[\\/]/).slice(0, -1); // drop page.tsx
  const segs = rel
    .filter((p) => !(p.startsWith('(') && p.endsWith(')'))) // drop route groups
    .map((p) => (p.startsWith('[') && p.endsWith(']') ? ':' + p.slice(1, -1) : p));
  return segs.length === 0 ? '/' : '/' + segs.join('/');
}

/* ── Scaffold templates ─────────────────────────────────────────────── */
function tplDashboardPage(r) {
  const name = basename(r.component);
  const guard =
    r.access === 'freelancer'
      ? "roles={['freelancer']}"
      : r.access === 'superuser'
        ? 'superuser'
        : '';
  return `'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

const ${name} = dynamic(() => import('@front/pages/${r.component}'), { ssr: false });

export default function Page() {
  return (
    <RequireAuth${guard ? ' ' + guard : ''}>
      <${name} />
    </RequireAuth>
  );
}
`;
}

function tplClientServerPage(r) {
  const follow = r.web.index === undefined ? false : false;
  return `import type { Metadata } from 'next';
import Client from './client';

export const metadata: Metadata = {
  robots: { index: false, follow: ${follow} },
};

export default function Page() {
  return <Client />;
}
`;
}

function tplClientWrapper(r) {
  const name = basename(r.component);
  if (r.access === 'auth-client') {
    return `'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

const ${name} = dynamic(() => import('@front/pages/${r.component}'), { ssr: false });

export default function Client() {
  return (
    <RequireAuth roles={['client']}>
      <${name} />
    </RequireAuth>
  );
}
`;
  }
  return `'use client';
import dynamic from 'next/dynamic';

const ${name} = dynamic(() => import('@front/pages/${r.component}'), { ssr: false });

export default function Client() {
  return <${name} />;
}
`;
}

function tplPublicServerPage(r) {
  const rev = r.web.revalidate ?? 3600;
  const isDynamic = r.web.mode === 'dynamic' || r.web.staticParams || r.path.includes(':');
  if (!isDynamic) {
    return `import { routeMetadata } from '@/lib/seo';
import Client from './client';

export const metadata = routeMetadata('${r.path}');
export const revalidate = ${rev};

export default function Page() {
  return <Client />;
}
`;
  }
  // Dynamic public route — emit a working baseline + TODOs for SSR/static params.
  const propsStr = r.props ? JSON.stringify(r.props) : '{}';
  return `import type { Metadata } from 'next';
import { SITE } from '@front/lib/seo/site';
import Client from './client';

export const revalidate = ${rev};
${r.web.staticParams ? `// TODO: export function generateStaticParams() { /* return [{ <param>: '...' }] */ }\n` : ''}
export async function generateMetadata({ params }: { params: Promise<Record<string, string>> }): Promise<Metadata> {
  const p = await params;
  // TODO: fetch per-item data (see web/src/lib/serverApi.ts) and build rich metadata.
  const canonical = \`\${SITE.url}${r.path.replace(/:([A-Za-z0-9_]+)/g, '${p.$1}')}\`;
  return {
    title: '${basename(r.component)} — Cold Scout',
    alternates: { canonical },
    robots: { index: ${r.web.index ?? true}, follow: true },
  };
}

// TODO (optional body SSR): prefetch into a QueryClient + <HydrationBoundary>.
export default function Page() {
  return <Client />;
}
`;
}

function tplPublicClientWrapper(r) {
  const name = basename(r.component);
  const propsStr = r.props
    ? ' ' + Object.entries(r.props).map(([k, v]) => `${k}="${v}"`).join(' ')
    : '';
  return `'use client';
import { Suspense } from 'react';
import ${name} from '@front/pages/${r.component}';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <${name}${propsStr} />
    </Suspense>
  );
}
`;
}

function scaffold(r, webPageFile) {
  const pageAbs = join(WEB_SRC, webPageFile);
  const dir = dirname(pageAbs);
  mkdirSync(dir, { recursive: true });

  const isDashboard = r.dashboard === true;
  const isClientOnly = r.web.mode === 'client';

  const written = [];
  if (isDashboard) {
    // Single self-contained client page (no separate wrapper).
    writeFileSync(pageAbs, tplDashboardPage(r));
    written.push(webPageFile);
  } else if (isClientOnly) {
    writeFileSync(pageAbs, tplClientServerPage(r));
    const clientAbs = join(dir, 'client.tsx');
    if (!existsSync(clientAbs)) writeFileSync(clientAbs, tplClientWrapper(r));
    written.push(webPageFile, relative(WEB_SRC, clientAbs).split(/[\\/]/).join('/'));
  } else {
    writeFileSync(pageAbs, tplPublicServerPage(r));
    const clientAbs = join(dir, 'client.tsx');
    if (!existsSync(clientAbs)) writeFileSync(clientAbs, tplPublicClientWrapper(r));
    written.push(webPageFile, relative(WEB_SRC, clientAbs).split(/[\\/]/).join('/'));
  }
  return written;
}

/* ── Main ───────────────────────────────────────────────────────────── */
async function main() {
  const mod = await loadManifest();
  const { ROUTES, webPageFile } = mod;

  const manifestPaths = new Set(ROUTES.map((r) => r.path));
  const problems = [];
  const created = [];

  // 1. Manifest → web (missing pages)
  for (const r of ROUTES) {
    const file = webPageFile(r); // e.g. 'app/leads/[id]/page.tsx'
    const abs = join(WEB_SRC, file);
    if (!existsSync(abs)) {
      if (MODE === 'write') {
        created.push(...scaffold(r, file));
      } else {
        problems.push(`MISSING web page for route "${r.path}" → expected web/src/${file}`);
      }
    }
  }

  // 2. Web → manifest (orphan pages, never auto-removed — flagged only)
  for (const pageFile of walkPageFiles(WEB_APP)) {
    const routePath = fileToRoutePath(pageFile);
    if (!manifestPaths.has(routePath)) {
      problems.push(
        `ORPHAN web page ${relative(WEB_ROOT, pageFile).split(/[\\/]/).join('/')} → route "${routePath}" not in routes.manifest.ts`,
      );
    }
  }

  // 3. App.tsx must remain manifest-driven (defence against accidental revert).
  if (existsSync(APP_TSX)) {
    const appSrc = readFileSync(APP_TSX, 'utf8');
    if (!appSrc.includes('routes.manifest')) {
      problems.push('frontend/src/App.tsx is no longer importing routes.manifest — Android routing would drift.');
    }
  }

  if (MODE === 'write') {
    if (created.length) {
      console.log('✓ Scaffolded web routes:\n  - ' + created.join('\n  - '));
    } else {
      console.log('✓ Web routes already in sync with the manifest — nothing to scaffold.');
    }
  }

  if (problems.length) {
    console.error('\n✗ Route parity check FAILED:\n  - ' + problems.join('\n  - '));
    console.error(
      '\nFix: edit frontend/src/routes.manifest.ts (single source of truth), then run\n  node web/scripts/sync-routes.mjs --write\n',
    );
    process.exit(1);
  }

  console.log(`✓ Route parity OK — ${ROUTES.length} routes in sync (web ⇄ manifest ⇄ Android).`);
}

main().catch((err) => {
  console.error('sync-routes failed:', err);
  process.exit(1);
});
