import ArticleLayout from '../../components/layout/ArticleLayout';
import type { PostMeta } from '../types';

export const meta: PostMeta = {
  slug: 'building-a-sales-pipeline-with-fastapi-postgres',
  kind: 'guide',
  title: 'Building a Sales Pipeline with FastAPI, PostgreSQL, and APScheduler',
  description:
    'Architectural notes from building Cold Scout — the open-source AI lead generation pipeline — with FastAPI, async SQLAlchemy, PostgreSQL, and APScheduler.',
  publishedAt: '2026-05-07',
  readMinutes: 5,
  author: 'Samrat Kumar Das',
  category: 'Engineering',
  isOutline: true,
  keywords: [
    'FastAPI sales pipeline',
    'FastAPI PostgreSQL',
    'APScheduler async',
    'Python lead generation',
    'open source CRM architecture',
  ],
  wordCount: 450,
};

export default function Post() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        Cold Scout's backend is a useful reference architecture for anyone building
        an async data pipeline: FastAPI for the HTTP surface, async SQLAlchemy for
        DB I/O, APScheduler for background jobs, and Pydantic everywhere for the
        contract.
      </p>
      <h2>Why each piece</h2>
      <ul>
        <li>
          <strong>FastAPI</strong> — async-first, OpenAPI spec for free, dependency
          injection that maps cleanly to per-request DB sessions.
        </li>
        <li>
          <strong>SQLAlchemy 2.x async</strong> — the only Python ORM that's caught
          up with async cleanly. Use the imperative <code>select()</code> style, not
          the ORM-implicit lazy-load pattern.
        </li>
        <li>
          <strong>PostgreSQL</strong> — JSONB for the lead enrichment blobs, full
          relational for everything else.
        </li>
        <li>
          <strong>APScheduler</strong> — cron-style jobs in-process. Enough scale for
          most freelancer/agency workloads. Graduate to Celery + Redis if you outgrow
          it.
        </li>
      </ul>
      <h2>This article is a stub</h2>
      <p>
        The full version walks through the actual repo structure, the workers, the
        retry logic, and the migrations strategy. Coming soon.
      </p>
    </ArticleLayout>
  );
}
