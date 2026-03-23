/**
 * JsonLd — Injects a JSON-LD structured data block into `<head>`.
 *
 * Renders a `<script type="application/ld+json">` tag so search engines
 * can parse rich structured data (Organization, SoftwareApplication, FAQ, etc.).
 *
 * Usage:
 *   <JsonLd data={{ "@context": "https://schema.org", "@type": "Organization", ... }} />
 */

import { useEffect } from 'react';

interface JsonLdProps {
  /** The structured data object — must conform to schema.org vocabulary. */
  data: Record<string, unknown> | Record<string, unknown>[];
  /** Unique ID for the script tag so multiple schemas can coexist per page. */
  id?: string;
}

export default function JsonLd({ data, id = 'json-ld' }: JsonLdProps) {
  useEffect(() => {
    const scriptId = `json-ld-${id}`;
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }

    script.textContent = JSON.stringify(data);

    return () => {
      // Remove on unmount to avoid stale schemas on navigation
      const el = document.getElementById(scriptId);
      if (el) el.remove();
    };
  }, [data, id]);

  return null;
}
