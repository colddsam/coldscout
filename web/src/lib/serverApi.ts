/**
 * Server-side fetch helper for building per-item SEO metadata in
 * generateMetadata() of dynamic routes (directory leads, public profiles).
 *
 * Mirrors the X-API-Key header the browser client sends. Always fails soft
 * (returns null) so a backend hiccup never breaks the build or a page render —
 * the route falls back to generic metadata and the client component still
 * fetches + renders the live data after hydration.
 */
const API_BASE = process.env.VITE_API_BASE_URL || '';
const API_KEY = process.env.VITE_API_KEY || '';

export async function serverGet<T>(
  path: string,
  revalidate = 300,
): Promise<T | null> {
  if (!API_BASE) return null;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        'X-API-Key': API_KEY,
        accept: 'application/json',
      },
      next: { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
