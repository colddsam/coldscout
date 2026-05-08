/**
 * Pure-data content manifest.
 *
 * Mirrors the meta exports of every file under ./posts/*.tsx but contains
 * NO React / browser-runtime imports. This file is loaded by build-time
 * scripts (sitemap generation, content-meta.json, llms.txt regen) which run
 * under Node and would otherwise choke on import.meta.env access in
 * transitive imports (Supabase client, etc.).
 *
 * Keep this file in sync with ./posts/*.tsx — when a post's meta changes,
 * update both. CI could be added to enforce this, but for a 15-post catalog
 * the manual discipline is cheaper.
 */
import type { PostMeta } from './types';

export const MANIFEST: PostMeta[] = [
  {
    slug: 'automate-google-maps-lead-generation',
    kind: 'blog',
    title: 'How to Automate Google Maps Lead Generation in 2026',
    description:
      'A practical guide to extracting qualified B2B leads from Google Maps at scale using the Places API, AI qualification, and a compliant outreach pipeline.',
    publishedAt: '2026-04-12',
    updatedAt: '2026-05-08',
    readMinutes: 9,
    author: 'Samrat Kumar Das',
    category: 'Lead Generation',
    keywords: [
      'Google Maps lead scraper',
      'AI lead generation platform',
      'B2B outreach automation',
      'Places API',
      'Cold Scout',
      'local business leads',
    ],
    wordCount: 1450,
  },
  {
    slug: 'cold-scout-vs-apollo-vs-outreach',
    kind: 'blog',
    title: 'Cold Scout vs Apollo vs Outreach vs Instantly: 2026 Comparison',
    description:
      'Honest comparison of four B2B lead generation tools — pricing, data sources, AI features, and where each one wins for solo founders, freelancers, and agencies.',
    publishedAt: '2026-04-22',
    updatedAt: '2026-05-08',
    readMinutes: 8,
    author: 'Samrat Kumar Das',
    category: 'Comparisons',
    keywords: [
      'Cold Scout vs Apollo',
      'Apollo alternative',
      'Outreach alternative',
      'open source lead generation',
      'B2B outreach automation',
      'lead generation comparison',
    ],
    wordCount: 1300,
  },
  {
    slug: 'what-is-icp-ideal-customer-profile',
    kind: 'blog',
    title: 'What Is an Ideal Customer Profile (ICP)? Definition, Examples, How to Build One',
    description:
      'Plain-English definition of Ideal Customer Profile (ICP), worked examples for B2B SaaS and freelance agencies, and a step-by-step framework to write your own.',
    publishedAt: '2026-04-28',
    updatedAt: '2026-05-08',
    readMinutes: 7,
    author: 'Samrat Kumar Das',
    category: 'Sales Fundamentals',
    keywords: ['ideal customer profile', 'ICP definition', 'how to build an ICP', 'B2B sales', 'lead qualification', 'ICP scoring'],
    wordCount: 1100,
  },
  {
    slug: 'cold-email-ai-personalization-at-scale',
    kind: 'blog',
    title: 'Cold Email AI: How to Generate Personalized Outreach at Scale',
    description:
      'A practical playbook for using LLMs to write cold emails that actually feel personal — covering data inputs, prompts, deliverability, and CAN-SPAM compliance.',
    publishedAt: '2026-05-02',
    updatedAt: '2026-05-08',
    readMinutes: 8,
    author: 'Samrat Kumar Das',
    category: 'Outreach',
    keywords: [
      'cold email AI generator',
      'AI personalized outreach',
      'cold email automation',
      'B2B email writing',
      'CAN-SPAM compliance',
      'cold email deliverability',
    ],
    wordCount: 1250,
  },
  {
    slug: 'self-host-lead-generation-docker-guide',
    kind: 'guide',
    title: 'Self-Hosted Lead Generation: Complete Setup Guide with Docker',
    description:
      'Step-by-step guide to running the open-source Cold Scout AI lead generation pipeline on your own infrastructure with Docker, including API keys, environment, and a first run.',
    publishedAt: '2026-04-30',
    updatedAt: '2026-05-08',
    readMinutes: 12,
    author: 'Samrat Kumar Das',
    category: 'Self-Hosting',
    keywords: [
      'self-host lead generation',
      'open source lead generation',
      'Cold Scout Docker setup',
      'FastAPI Docker',
      'Groq API setup',
      'Google Places API setup',
    ],
    wordCount: 1700,
  },
  {
    slug: 'mcp-server-setup-ai-agents-claude',
    kind: 'guide',
    title: 'MCP Server Setup: Connecting Claude and GPT Agents to Cold Scout',
    description:
      'Quickstart for using Cold Scout as an MCP (Model Context Protocol) server so Claude Desktop, Claude Code, and other AI agents can call lead generation endpoints.',
    publishedAt: '2026-05-04',
    updatedAt: '2026-05-08',
    readMinutes: 5,
    author: 'Samrat Kumar Das',
    category: 'AI Agents',
    isOutline: true,
    keywords: [
      'MCP server',
      'Model Context Protocol',
      'Claude MCP server',
      'AI agent lead generation',
      'GPT lead generation tool',
      'Cold Scout MCP',
    ],
    wordCount: 600,
  },
  {
    slug: 'lead-qualification-bant-meddic-icp-scoring',
    kind: 'blog',
    title: 'Lead Qualification Frameworks: BANT, MEDDIC, and Modern ICP Scoring',
    description:
      'A side-by-side look at BANT, MEDDIC, CHAMP, and modern ICP-based scoring for B2B sales — when each one fits and how AI changes the game.',
    publishedAt: '2026-05-05',
    updatedAt: '2026-05-08',
    readMinutes: 5,
    author: 'Samrat Kumar Das',
    category: 'Sales Fundamentals',
    isOutline: true,
    keywords: ['lead qualification', 'BANT', 'MEDDIC', 'CHAMP', 'ICP scoring', 'B2B sales qualification framework'],
    wordCount: 500,
  },
  {
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
    keywords: ['cold outreach pipeline', 'sales pipeline stages', 'B2B sales process', 'cold email funnel', 'lead generation pipeline'],
    wordCount: 500,
  },
  {
    slug: 'top-b2b-lead-generation-tools-2026',
    kind: 'blog',
    title: 'Top 10 B2B Lead Generation Tools Compared (2026)',
    description:
      'A short, opinionated comparison of the top B2B lead generation tools in 2026 — from contact databases to AI-first scrapers and outreach automation platforms.',
    publishedAt: '2026-05-07',
    updatedAt: '2026-05-08',
    readMinutes: 4,
    author: 'Samrat Kumar Das',
    category: 'Comparisons',
    isOutline: true,
    keywords: [
      'best B2B lead generation tools',
      'top lead generation software 2026',
      'Apollo alternatives',
      'Outreach alternatives',
      'AI lead generation platform',
    ],
    wordCount: 400,
  },
  {
    slug: 'how-freelancers-use-ai-to-land-clients',
    kind: 'blog',
    title: 'How Freelancers Use AI to Land 10x More Clients',
    description:
      'A short playbook for solo freelancers and small agencies using AI lead generation, qualification, and personalized cold email to fill the pipeline without an SDR.',
    publishedAt: '2026-05-07',
    readMinutes: 4,
    author: 'Samrat Kumar Das',
    category: 'For Freelancers',
    isOutline: true,
    keywords: ['freelancer client acquisition', 'AI for freelancers', 'cold email for freelancers', 'B2B freelancing', 'agency lead generation'],
    wordCount: 400,
  },
  {
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
    keywords: ['FastAPI sales pipeline', 'FastAPI PostgreSQL', 'APScheduler async', 'Python lead generation', 'open source CRM architecture'],
    wordCount: 450,
  },
  {
    slug: 'spf-dkim-dmarc-cold-email-deliverability',
    kind: 'guide',
    title: 'Email Deliverability: SPF, DKIM, and DMARC Explained',
    description:
      'Plain-English guide to setting up SPF, DKIM, and DMARC so your cold outreach actually lands in the primary inbox instead of spam.',
    publishedAt: '2026-05-07',
    readMinutes: 5,
    author: 'Samrat Kumar Das',
    category: 'Deliverability',
    isOutline: true,
    keywords: ['cold email deliverability', 'SPF DKIM DMARC setup', 'email authentication', 'inbox placement', 'B2B cold email'],
    wordCount: 480,
  },
  {
    slug: 'open-source-saas-why-it-wins',
    kind: 'blog',
    title: 'Open-Source SaaS: Why It Wins for Power Users',
    description:
      'The five concrete advantages of open-source SaaS — cost floor, data ownership, modifiability, audit-ability, and community speed — for power users.',
    publishedAt: '2026-05-07',
    readMinutes: 4,
    author: 'Samrat Kumar Das',
    category: 'Open Source',
    isOutline: true,
    keywords: ['open source SaaS', 'self-hosted SaaS', 'open source vs SaaS', 'data ownership', 'open source business model'],
    wordCount: 400,
  },
  {
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
    keywords: ['Google Places API', 'local business scraping', 'Places API best practices', 'Maps lead generation', 'Places API rate limits'],
    wordCount: 450,
  },
  {
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
    keywords: ['Cold Scout roadmap', 'Cold Scout features', 'lead generation roadmap', 'Threads pipeline', 'web scraper'],
    wordCount: 350,
  },
];

export const BLOG_MANIFEST = MANIFEST.filter((m) => m.kind === 'blog');
export const GUIDE_MANIFEST = MANIFEST.filter((m) => m.kind === 'guide');
