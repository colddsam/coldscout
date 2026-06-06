/**
 * Server-rendered JSON-LD.
 *
 * Emits `<script type="application/ld+json">` directly in the server HTML so
 * non-JS crawlers — AI answer engines (GPTBot, ClaudeBot, OAI-SearchBot,
 * PerplexityBot, Google-Extended) and social scrapers — see the structured
 * data. This is the GEO/AEO-critical counterpart to the metadata that each
 * route already exports via the Next Metadata API.
 *
 * Why the `json-ld-<id>` id matters: the shared legacy client component
 * (frontend/src/components/seo/JsonLd.tsx) looks up `document.getElementById(
 * 'json-ld-<id>')` on mount and *reuses* the element if it exists, only
 * updating its textContent. So when this server tag is present, the client
 * never creates a duplicate — it adopts ours. Keep the `id` prop here in
 * lockstep with the `id` the client page passes for the same schema.
 *
 * The Android/Vite build doesn't use this component at all (no SSR), so its
 * client-injected JSON-LD continues to work unchanged.
 */
import { Fragment } from 'react';

type Json = Record<string, unknown>;

export interface JsonLdBlock {
  /** Stable id; must match the client <JsonLd id> for the same schema. */
  id: string;
  /** A single schema object or an array of them. */
  data: Json | Json[];
}

function Script({ id, data }: JsonLdBlock) {
  return (
    <script
      id={`json-ld-${id}`}
      type="application/ld+json"
      // Schema objects are built from our own constants — no user input — so
      // this is safe. We still escape `<` to avoid any chance of breaking out
      // of the script element via a stray "</script>" in copy.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}

/** Render one or many JSON-LD blocks server-side. */
export default function JsonLd({ blocks }: { blocks: JsonLdBlock[] }) {
  return (
    <Fragment>
      {blocks.map((b) => (
        <Script key={b.id} id={b.id} data={b.data} />
      ))}
    </Fragment>
  );
}
