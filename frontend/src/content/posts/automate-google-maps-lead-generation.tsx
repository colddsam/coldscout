import { Link } from 'react-router-dom';
import ArticleLayout from '../../components/layout/ArticleLayout';
import type { PostMeta } from '../types';

export const meta: PostMeta = {
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
};

export default function Post() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        Google Maps is the largest live database of operating businesses in the world.
        For freelancers and agencies selling websites, marketing, software, or any local
        service, it is the single richest hunting ground for qualified B2B leads — but
        only if you can extract, qualify, and contact the right businesses without
        burning weeks doing it manually.
      </p>

      <p>
        This guide walks through how to build (or buy) a compliant pipeline that turns
        Google Maps into a steady source of qualified prospects. The same five stages
        power the open-source <strong>Cold Scout</strong> pipeline, so we'll use it as
        the running example.
      </p>

      <h2>Stage 1 — Define your Ideal Customer Profile</h2>
      <p>
        Before you scrape a single result, write down what a "good" lead looks like.
        At minimum, capture:
      </p>
      <ul>
        <li><strong>Industry / business type</strong> — restaurants, dentists, plumbers, dental clinics, gyms, etc.</li>
        <li><strong>Geography</strong> — country, region, city, or a specific bounding box.</li>
        <li><strong>Operating signals</strong> — minimum review count, minimum star rating, currently open status.</li>
        <li><strong>Disqualifiers</strong> — already has a modern website? Already running ads? Chain or franchise?</li>
      </ul>
      <p>
        Without an ICP, you will spray-and-pray. With one, every later stage gets cheaper.
      </p>

      <h2>Stage 2 — Discover with the Google Places API</h2>
      <p>
        The right way to source leads from Maps at scale is the Places API, not browser
        scraping. The API gives you a stable contract, generous free quotas, and is
        explicitly within the terms of service when used as documented. The two
        endpoints that do the heavy lifting are <code>Places Text Search</code> for
        keyword + location queries and <code>Place Details</code> for enrichment
        (website, phone, hours, photos, types).
      </p>
      <p>
        Two practical tips that save hours:
      </p>
      <ol>
        <li>
          <strong>Tile your geography.</strong> A single Text Search caps results at
          60 per query. Split your target area into a grid of cells and run a query
          per cell, deduping by <code>place_id</code> in the merge step.
        </li>
        <li>
          <strong>Cache Place Details aggressively.</strong> They cost more than
          searches and rarely change. Persist them with a TTL of 7–14 days.
        </li>
      </ol>

      <h2>Stage 3 — Qualify with AI</h2>
      <p>
        Raw search results are noisy. The qualification stage is where you decide
        which businesses are worth contacting. Three signals do most of the work:
      </p>
      <ol>
        <li>
          <strong>Website quality.</strong> Fetch the site, parse the title and meta,
          and pass it to a small language model with a rubric — "rate the website
          on professionalism (1–10) and modernity (1–10), and tell me if it appears
          mobile-friendly." A 7B-parameter model is more than enough.
        </li>
        <li>
          <strong>Social presence.</strong> Look for Instagram, Facebook, and LinkedIn
          links from the site. A business with no social presence is often a stronger
          lead for an agency selling marketing services.
        </li>
        <li>
          <strong>ICP fit score.</strong> Encode your ICP as a structured prompt and
          have the model return a score 0–100 with a one-line rationale.
        </li>
      </ol>
      <p>
        Cold Scout uses Groq-hosted Llama 3.3 70B for this because Groq's per-token
        latency is low enough to score thousands of leads per minute without batching
        gymnastics.
      </p>

      <h2>Stage 4 — Personalize the outreach</h2>
      <p>
        The fastest way to kill open rates is to send identical "Hi {'{firstName}'}"
        emails. Use what you've already enriched: the business's actual website
        copy, photos, and reviews. A useful prompt template:
      </p>
      <pre><code>{`Write a 90-word cold email to the owner of {{business_name}}.
- Reference one specific thing from their website ({{site_summary}})
- Tie it to {{my_offer}}
- One clear CTA, soft tone, no superlatives
- Sign off as {{my_name}}`}</code></pre>
      <p>
        Anything generated this way still needs an unsubscribe link and a real
        physical address — both legal requirements under CAN-SPAM and GDPR for
        commercial email.
      </p>

      <h2>Stage 5 — Send, track, and iterate</h2>
      <p>
        Three rules of thumb to stay deliverable:
      </p>
      <ul>
        <li>Warm new sending domains for at least 2 weeks before scaling.</li>
        <li>Send through a reputable SMTP provider (Cold Scout uses Brevo) with SPF, DKIM, and DMARC fully aligned.</li>
        <li>Cap volume per inbox per day. 50–100 is a safe ceiling for new sender reputation.</li>
      </ul>
      <p>
        Track open rate, reply rate, and complaint rate weekly. The pipeline is
        only as good as its last cohort.
      </p>

      <h2>Build vs buy</h2>
      <p>
        If you are a developer, building the pipeline above is a 2–4 week project.
        If you are not, the entire pipeline is open source at{' '}
        <a href="https://github.com/colddsam/coldscout">github.com/colddsam/coldscout</a>{' '}
        — clone, set your API keys, run <code>docker compose up</code>, and you have
        the same pipeline running on your own machine for the cost of the underlying
        APIs.
      </p>
      <p>
        If you want to skip the deployment, the managed{' '}
        <Link to="/pricing">Cold Scout Pro</Link> plan ships the same pipeline as a
        hosted API + MCP server.
      </p>

      <h2>Compliance reminders</h2>
      <ul>
        <li>Respect the Google Maps Terms of Service — especially around caching place data.</li>
        <li>Honor opt-outs immediately. Hard-bounce emails should be auto-suppressed.</li>
        <li>For EU-based recipients, ground your outreach in legitimate interest and have a clear unsubscribe path.</li>
        <li>Keep a record of where each lead was sourced from. If a recipient asks, you should be able to answer.</li>
      </ul>

      <p>
        Done well, this pipeline turns a freelancer's Monday morning from "who do I
        contact this week" into a weekly cohort of pre-qualified prospects with
        first-draft emails ready to review and send.
      </p>
    </ArticleLayout>
  );
}
