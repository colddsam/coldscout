import ArticleLayout from '../../components/layout/ArticleLayout';
import type { PostMeta } from '../types';

export const meta: PostMeta = {
  slug: 'anatomy-of-a-cold-outreach-pipeline',
  kind: 'blog',
  title: 'From Discovery to Reply: The Anatomy of a Cold Outreach Pipeline',
  description:
    'The five stages every cold-outreach pipeline shares — discovery, enrichment, qualification, personalization, sending — and the metrics to measure each one.',
  publishedAt: '2026-05-06',
  updatedAt: '2026-05-08',
  readMinutes: 5,
  author: 'Samrat Kumar Das',
  category: 'Outreach',
  isOutline: true,
  keywords: [
    'cold outreach pipeline',
    'sales pipeline stages',
    'B2B sales process',
    'cold email funnel',
    'lead generation pipeline',
  ],
  wordCount: 500,
};

export default function Post() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        Whether built in-house or bought as a SaaS, every cold outreach pipeline has
        the same five stages. Knowing them as a unit helps you debug which stage is
        the actual bottleneck.
      </p>
      <ol>
        <li><strong>Discovery</strong> — sourcing the universe of candidate businesses.</li>
        <li><strong>Enrichment</strong> — attaching website, contact, social, technographic data.</li>
        <li><strong>Qualification</strong> — scoring fit and intent against your ICP.</li>
        <li><strong>Personalization</strong> — writing a message tied to the prospect's specifics.</li>
        <li><strong>Sending</strong> — delivering reliably and tracking the response.</li>
      </ol>
      <p>
        Each stage has a leak: discovery has yield, enrichment has data quality,
        qualification has precision/recall, personalization has tone, sending has
        deliverability. Optimizing the wrong leak is the most common waste of time
        in B2B sales operations.
      </p>
      <h2>This article is a stub</h2>
      <p>
        Coming soon: per-stage diagnostics, the leak indicator metrics, and which
        tools to reach for at each stage.
      </p>
    </ArticleLayout>
  );
}
