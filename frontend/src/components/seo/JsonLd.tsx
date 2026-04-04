/**
 * JsonLd Component — Injects a JSON-LD structured data block into `<head>`.
 *
 * Renders a `<script type="application/ld+json">` tag so search engines
 * can parse rich structured data (Organization, SoftwareApplication, FAQ, etc.).
 *
 * @example
 *   <JsonLd data={{ "@context": "https://schema.org", "@type": "Organization", ... }} />
 */

import { useEffect } from 'react';

/**
 * Props for the JsonLd Component.
 *
 * @interface JsonLdProps
 */
interface JsonLdProps {
  /**
   * The structured data object — must conform to schema.org vocabulary.
   */
  data: Record<string, unknown> | Record<string, unknown>[];

  /**
   * Unique ID for the script tag so multiple schemas can coexist per page.
   */
  id?: string;
}

/**
 * JsonLd Component.
 *
 * Injects a JSON-LD structured data block into `<head>`.
 *
 * @param {JsonLdProps} props
 * @returns {JSX.Element}
 */
export default function JsonLd({ data, id = 'json-ld' }: JsonLdProps) {
  /**
   * Effect hook to inject the JSON-LD script tag into the document head.
   */
  useEffect(() => {
    // Generate a unique ID for the script tag.
    const scriptId = `json-ld-${id}`;

    // Attempt to retrieve the existing script element.
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    // If the script element does not exist, create a new one.
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }

    // Set the script element's text content to the JSON-LD data.
    script.textContent = JSON.stringify(data);

    // Cleanup function to remove the script element on unmount.
    return () => {
      // Remove the script element to avoid stale schemas on navigation.
      const el = document.getElementById(scriptId);
      if (el) el.remove();
    };
  }, [data, id]);

  // Return null as the component does not render any UI.
  return null;
}