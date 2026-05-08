import ArticleLayout from '../../components/layout/ArticleLayout';
import type { PostMeta } from '../types';

export const meta: PostMeta = {
  slug: 'google-places-api-best-practices',
  kind: 'guide',
  title: 'Local Business Discovery with Google Places API: Best Practices',
  description:
    'Practical recipe for using the Google Places API at scale — geographic tiling, dedup by place_id, smart caching of details, and avoiding ToS pitfalls.',
  publishedAt: '2026-05-07',
  readMinutes: 5,
  author: 'Samrat Kumar Das',
  category: 'Engineering',
  isOutline: true,
  keywords: [
    'Google Places API',
    'local business scraping',
    'Places API best practices',
    'Maps lead generation',
    'Places API rate limits',
  ],
  wordCount: 450,
};

export default function Post() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        Five practices that separate "Maps API hobby project" from "production lead
        pipeline":
      </p>
      <ol>
        <li>
          <strong>Tile your geography.</strong> Text Search caps results at 60 per
          query. Split a city into a grid and run a query per cell.
        </li>
        <li>
          <strong>Dedup by <code>place_id</code>.</strong> Don't trust name+address
          matching — Google does it for you.
        </li>
        <li>
          <strong>Cache Place Details.</strong> They're cheap-relative-to-search but
          rarely change. 7–14 day TTL is sane.
        </li>
        <li>
          <strong>Restrict the API key.</strong> By referrer, by API surface, by IP.
          Loose keys cost real money.
        </li>
        <li>
          <strong>Stay inside the ToS.</strong> Don't store full Place Details
          indefinitely. Re-fetch on a TTL.
        </li>
      </ol>
      <h2>This article is a stub</h2>
      <p>
        Coming soon: a working Python tile-generator, the dedup query, and the
        TTL'd cache table schema we use in Cold Scout.
      </p>
    </ArticleLayout>
  );
}
