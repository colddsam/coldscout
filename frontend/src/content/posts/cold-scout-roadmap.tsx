import ArticleLayout from '../../components/layout/ArticleLayout';
import type { PostMeta } from '../types';

export const meta: PostMeta = {
  slug: 'cold-scout-roadmap-2026',
  kind: 'blog',
  title: 'Cold Scout Roadmap: Threads Pipeline, Web Scraper, and More',
  description:
    'Public roadmap for Cold Scout — what is shipping next across the discovery, qualification, and outreach stages, plus the new platform features.',
  publishedAt: '2026-05-07',
  readMinutes: 3,
  author: 'Samrat Kumar Das',
  category: 'Roadmap',
  isOutline: true,
  keywords: [
    'Cold Scout roadmap',
    'Cold Scout features',
    'lead generation roadmap',
    'Threads pipeline',
    'web scraper',
  ],
  wordCount: 350,
};

export default function Post() {
  return (
    <ArticleLayout meta={meta}>
      <h2>Shipping next quarter</h2>
      <ul>
        <li><strong>Threads engagement pipeline</strong> — discover and engage prospects on Meta Threads via the official API.</li>
        <li><strong>Web-scraper discovery source</strong> — a second discovery surface beyond Maps for non-local B2B.</li>
        <li><strong>HubSpot + Pipedrive sync</strong> — push qualified leads directly into your CRM.</li>
        <li><strong>Sequence builder</strong> — multi-step follow-ups with response-aware branching.</li>
      </ul>
      <h2>Already shipped</h2>
      <ul>
        <li>MCP server for AI agents (Claude, GPT, Cursor).</li>
        <li>Lead Scanner — bulk-classify imported lists.</li>
        <li>Public profile pages at <code>/u/&#123;username&#125;</code>.</li>
        <li>AI demo-website builder for leads with no current website.</li>
      </ul>
      <h2>This page is a stub</h2>
      <p>
        Detailed timelines, ETAs, and a public-vote feature board are coming soon.
        Open issues against the roadmap on GitHub in the meantime.
      </p>
    </ArticleLayout>
  );
}
