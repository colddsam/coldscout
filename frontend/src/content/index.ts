/**
 * Content registry.
 *
 * Two layers, deliberate split:
 *
 * 1. ./manifest.ts — pure data (PostMeta only). No React, no transitive
 *    imports. Build scripts (sitemap, llms.txt, prerender meta) bundle this
 *    cleanly with esbuild and run from Node without browser env stubbing.
 *
 * 2. This file — wires component modules to their metadata for runtime use.
 *    React components live in ./posts/*.tsx and are dynamically resolved
 *    so build-time tools never see them.
 *
 * Order in `entries` is the default display order (newest first by convention).
 * If you add a new post:
 *   1. Create src/content/posts/<slug>.tsx exporting `meta` + default component
 *   2. Append the meta to MANIFEST in ./manifest.ts
 *   3. Append the import + asEntry() call below
 *   4. Sitemap, listings, and prerender pick it up automatically
 */
import type { ComponentType } from 'react';
import type { PostMeta } from './types';

import * as automateMaps from './posts/automate-google-maps-lead-generation';
import * as vsApolloOutreach from './posts/cold-scout-vs-apollo-vs-outreach';
import * as whatIsIcp from './posts/what-is-icp';
import * as coldEmailAi from './posts/cold-email-ai-personalization';
import * as selfHostDocker from './posts/self-host-lead-generation-docker';
import * as mcpClaude from './posts/mcp-server-setup-claude';
import * as bantMeddic from './posts/lead-qualification-bant-meddic';
import * as anatomyPipeline from './posts/anatomy-of-cold-outreach-pipeline';
import * as topTools2026 from './posts/top-b2b-lead-generation-tools-2026';
import * as freelancerAi from './posts/freelancer-ai-client-acquisition';
import * as fastapiPostgres from './posts/fastapi-postgres-sales-pipeline';
import * as spfDkimDmarc from './posts/spf-dkim-dmarc-deliverability';
import * as ossSaas from './posts/open-source-saas-power-users';
import * as placesApi from './posts/google-places-api-best-practices';
import * as roadmap from './posts/cold-scout-roadmap';

export interface ContentEntry {
  meta: PostMeta;
  Component: ComponentType;
}

function asEntry(mod: { meta: PostMeta; default: ComponentType }): ContentEntry {
  return { meta: mod.meta, Component: mod.default };
}

export const entries: ContentEntry[] = [
  asEntry(automateMaps),
  asEntry(vsApolloOutreach),
  asEntry(whatIsIcp),
  asEntry(coldEmailAi),
  asEntry(selfHostDocker),
  asEntry(mcpClaude),
  asEntry(bantMeddic),
  asEntry(anatomyPipeline),
  asEntry(topTools2026),
  asEntry(freelancerAi),
  asEntry(fastapiPostgres),
  asEntry(spfDkimDmarc),
  asEntry(ossSaas),
  asEntry(placesApi),
  asEntry(roadmap),
];

export const blogEntries = entries.filter((e) => e.meta.kind === 'blog');
export const guideEntries = entries.filter((e) => e.meta.kind === 'guide');

export function findBySlug(kind: 'blog' | 'guide', slug: string): ContentEntry | undefined {
  return entries.find((e) => e.meta.kind === kind && e.meta.slug === slug);
}

// Re-export so consumers can pick the layer they need without importing
// from ./manifest directly (single import path is friendlier for refactors).
export { MANIFEST } from './manifest';
