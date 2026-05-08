import { Link } from 'react-router-dom';
import ArticleLayout from '../../components/layout/ArticleLayout';
import type { PostMeta } from '../types';

export const meta: PostMeta = {
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
  keywords: [
    'ideal customer profile',
    'ICP definition',
    'how to build an ICP',
    'B2B sales',
    'lead qualification',
    'ICP scoring',
  ],
  wordCount: 1100,
};

export default function Post() {
  return (
    <ArticleLayout meta={meta}>
      <h2>The one-sentence definition</h2>
      <p>
        An <strong>Ideal Customer Profile (ICP)</strong> is a written description of
        the type of company that, when sold to, gets the most value from your product
        the fastest, the cheapest, and is the most likely to renew or refer. It is
        not a buyer persona — that's a person. ICP is the company.
      </p>

      <h2>What an ICP is not</h2>
      <ul>
        <li><strong>Not a wish-list.</strong> "Fortune 500 companies" is a fantasy, not an ICP.</li>
        <li><strong>Not a buyer persona.</strong> The persona ("VP of Engineering, 35–50, has used Datadog") sits inside the ICP.</li>
        <li><strong>Not your TAM.</strong> Total addressable market is "everyone who could plausibly buy". ICP is "who you should target first".</li>
      </ul>

      <h2>The five fields every ICP must have</h2>
      <ol>
        <li>
          <strong>Firmographics</strong> — industry, sub-industry, company size (employees,
          revenue), geography, public/private.
        </li>
        <li>
          <strong>Technographics</strong> — what tools they already use that signal
          fit. Selling email infra? Targets that already use SendGrid are warmer than
          targets that send through Gmail.
        </li>
        <li>
          <strong>Triggering events</strong> — recent funding round, leadership change,
          new office, hiring spree, security incident, regulatory deadline. Triggers
          beat demographics.
        </li>
        <li>
          <strong>Pain you can name in one sentence</strong> — "Their support queue
          gets backed up over the weekend because no human is on" beats "they need
          better support".
        </li>
        <li>
          <strong>Disqualifiers</strong> — equally important. Who looks like a fit but
          isn't? (Wrong region, regulatory blocker, can't afford the floor price.)
        </li>
      </ol>

      <h2>A worked B2B SaaS example</h2>
      <blockquote>
        <p><strong>Product:</strong> AI customer support copilot.</p>
        <p>
          <strong>ICP:</strong> US/EU-based mid-market SaaS companies (50–500
          employees, $5–50M ARR) that run support on Zendesk or Intercom, have a
          team of 6–30 support agents, support a product with a self-serve free
          tier (so support volume is high), and have raised a Series B in the last
          18 months (budget unlocked).
        </p>
        <p>
          <strong>Disqualifiers:</strong> healthcare (HIPAA blocker), Asia-Pacific
          headquartered (timezone friction with our team), Salesforce Service Cloud
          users (different stack, not our integration target).
        </p>
      </blockquote>

      <h2>A worked freelance/agency example</h2>
      <blockquote>
        <p><strong>Product:</strong> Done-for-you website redesign for local businesses.</p>
        <p>
          <strong>ICP:</strong> Independently-owned restaurants and dental clinics in
          tier-1 Indian cities, currently rated 4.3+ on Google Maps with 200+ reviews
          (signals: real, established, has revenue), with a website that scores below
          70 on Lighthouse mobile (signal: clear gap), no active Instagram link from
          the site (signal: low marketing maturity).
        </p>
        <p>
          <strong>Disqualifiers:</strong> Chains with 4+ locations (centralised marketing —
          our pitch lands wrong), already using Wix/Squarespace with a recent template
          (already addressed the pain).
        </p>
      </blockquote>
      <p>
        The second example is exactly the kind of ICP that{' '}
        <Link to="/">Cold Scout's</Link> Maps-based discovery is built for.
      </p>

      <h2>How to actually build yours</h2>
      <ol>
        <li>
          List your last 20 closed-won customers. Strip outliers (the favor deal, the
          pilot that didn't pay).
        </li>
        <li>
          For each, write down the five fields above as they actually were when the
          deal closed.
        </li>
        <li>
          Look for the cluster. The ICP is the description that fits at least 60% of
          the rows.
        </li>
        <li>
          Validate against your last 10 closed-lost. If the lost deals match the same
          description, your ICP isn't tight enough — add a discriminator.
        </li>
      </ol>

      <h2>ICP scoring (the fun part)</h2>
      <p>
        Once the ICP is written, encode it as a scoring rubric so you can rank
        inbound and outbound leads automatically. A simple weighted formula:
      </p>
      <pre><code>{`score = 0
score += 30 if industry matches
score += 20 if company size in [50, 500]
score += 20 if geography matches
score += 15 if uses one of {tool_a, tool_b}
score += 15 if has triggering event in last 90d
score -= 50 if any disqualifier`}</code></pre>
      <p>
        That's it. A 0–100 score, every lead, every day, no judgment calls. Cold Scout
        does this for Maps-sourced businesses by passing the ICP rubric to a small
        Llama model and asking it to score and explain — same idea, more inputs.
      </p>

      <h2>When to revisit</h2>
      <p>
        Every quarter at minimum, after a major product change, or whenever your win
        rate drops on a specific segment. ICPs aren't static — yours should evolve
        as your product does.
      </p>
    </ArticleLayout>
  );
}
