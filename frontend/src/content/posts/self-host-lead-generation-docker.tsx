import { Link } from 'react-router-dom';
import ArticleLayout from '../../components/layout/ArticleLayout';
import type { PostMeta } from '../types';

export const meta: PostMeta = {
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
};

export default function Post() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        This guide walks through the entire process of self-hosting{' '}
        <Link to="/">Cold Scout</Link> — the open-source AI lead generation pipeline —
        on your own machine or VPS. By the end, you will have a running web dashboard,
        a FastAPI backend, and an AI pipeline that can discover leads from Google Maps
        and draft personalized cold emails.
      </p>

      <h2>What you will need</h2>
      <ul>
        <li><strong>A machine</strong> — your laptop, or a VPS with at least 1 GB RAM and Docker installed.</li>
        <li><strong>A Google Cloud project</strong> with the Places API enabled. Free tier is more than enough to get started.</li>
        <li><strong>A Groq account</strong> (free) for AI inference.</li>
        <li><strong>A Brevo (Sendinblue) account</strong> (free up to 300 emails/day) for sending.</li>
        <li><strong>A Supabase project</strong> (free) — Cold Scout uses Supabase Auth + Postgres.</li>
      </ul>

      <h2>Step 1 — Clone the repository</h2>
      <pre><code>{`git clone https://github.com/colddsam/coldscout.git
cd coldscout`}</code></pre>
      <p>
        The repo includes a <code>docker-compose.yml</code> that orchestrates the
        backend, frontend, and the APScheduler worker.
      </p>

      <h2>Step 2 — Provision API keys</h2>

      <h3>2.1 Google Places API</h3>
      <ol>
        <li>Go to the Google Cloud Console and create a project (or pick an existing one).</li>
        <li>Enable the <em>Places API (New)</em> from the API Library.</li>
        <li>Create an API key from <em>APIs &amp; Services → Credentials</em>.</li>
        <li>Restrict the key to the Places API to limit blast radius if it leaks.</li>
      </ol>

      <h3>2.2 Groq</h3>
      <ol>
        <li>Sign up at console.groq.com.</li>
        <li>Create an API key — Cold Scout calls Llama 3.3 70B and Llama 3.1 8B.</li>
      </ol>

      <h3>2.3 Brevo (Sendinblue)</h3>
      <ol>
        <li>Sign up at brevo.com — confirm the email associated with the account.</li>
        <li>Generate an SMTP key from the SMTP &amp; API page.</li>
        <li>Verify a sending domain (recommended). DKIM and SPF take effect within minutes.</li>
      </ol>

      <h3>2.4 Supabase</h3>
      <ol>
        <li>Create a new Supabase project (the free tier works).</li>
        <li>Copy the database URL, the anon key, and the service-role key.</li>
        <li>Run the SQL migrations from <code>sqlcommands/</code> against the project.</li>
      </ol>

      <h2>Step 3 — Configure environment variables</h2>
      <p>
        Copy the example file and fill in the keys you just created:
      </p>
      <pre><code>{`cp .env.example .env`}</code></pre>
      <p>The fields you must set:</p>
      <pre><code>{`# Database
DATABASE_URL=postgresql+asyncpg://[USER]:[PASSWORD]@[HOST]:[PORT]/[DB_NAME]
SUPABASE_URL=https://[PROJECT].supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# AI
GROQ_API_KEY=...

# Discovery
GOOGLE_PLACES_API_KEY=...

# Outreach
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_USER=...
BREVO_SMTP_PASSWORD=...
SENDER_EMAIL=hello@yourdomain.com
SENDER_NAME=Your Name

# Misc
SECRET_KEY=$(openssl rand -hex 32)`}</code></pre>

      <h2>Step 4 — Run with Docker Compose</h2>
      <pre><code>docker compose up --build</code></pre>
      <p>
        On a fresh machine the first build pulls about 1 GB of layers. After that,
        starts are fast. The default ports:
      </p>
      <ul>
        <li>Frontend dashboard — <code>http://localhost:5173</code></li>
        <li>FastAPI backend — <code>http://localhost:8000</code></li>
        <li>API docs (Swagger UI) — <code>http://localhost:8000/docs</code></li>
      </ul>

      <h2>Step 5 — Create your account</h2>
      <p>
        Open the dashboard, click Sign up, and verify the email. The first user is
        automatically promoted to the <em>freelancer</em> role with full access.
      </p>

      <h2>Step 6 — Define your first ICP</h2>
      <p>
        From the dashboard, go to <em>Discovery → New target</em>. The fields:
      </p>
      <ul>
        <li><strong>Target type</strong> — e.g. "independent restaurants".</li>
        <li><strong>Geography</strong> — e.g. "Bengaluru, India".</li>
        <li><strong>Minimum rating</strong> — typical 4.0+.</li>
        <li><strong>Minimum reviews</strong> — typical 100+ to filter out fake/empty listings.</li>
      </ul>
      <p>
        Cold Scout will run the discovery in the background and stream results into
        the Leads tab.
      </p>

      <h2>Step 7 — Run a qualification pass</h2>
      <p>
        Once leads land, go to <em>Pipeline → Qualification</em> and click Run.
        Behind the scenes the worker:
      </p>
      <ol>
        <li>Fetches each lead's website and extracts metadata.</li>
        <li>Calls Groq with the qualification prompt and the website context.</li>
        <li>Stores an intent score (0–100) and a one-line rationale per lead.</li>
        <li>Auto-tags each lead as hot / warm / cold.</li>
      </ol>

      <h2>Step 8 — Send your first cold email</h2>
      <p>
        Pick a hot lead, click <em>Generate email</em>, and review the draft. The
        first draft is rarely the final draft — your edits become signal that the
        prompt-tuner can use later.
      </p>
      <p>
        When you're happy, click <em>Send</em>. The backend hands the message to
        Brevo over SMTP and stores the message-id for reply tracking.
      </p>

      <h2>Going to production</h2>
      <ul>
        <li>
          Move the database off Docker — point <code>DATABASE_URL</code> at managed
          Postgres (Supabase, Neon, Render, RDS). Backups become someone else's
          problem.
        </li>
        <li>
          Put a real domain in front of the frontend with HTTPS terminated by
          Nginx, Caddy, or a CDN. The repo includes an <code>nginx.conf</code> with
          security headers already set.
        </li>
        <li>
          Pin the Docker image versions in <code>docker-compose.yml</code> instead of
          rebuilding from <code>HEAD</code>. Predictable deploys, predictable bugs.
        </li>
        <li>
          Enable Brevo's domain authentication (DKIM + DMARC) so deliverability
          isn't gated by IP reputation alone.
        </li>
      </ul>

      <h2>Troubleshooting</h2>
      <ul>
        <li>
          <strong>Discovery returns 0 results</strong> — your Places API key is
          probably restricted to a different referrer. Check the Cloud Console.
        </li>
        <li>
          <strong>Qualification stalls</strong> — Groq rate limit. Drop concurrency
          in <code>backend/app/workers/qualification.py</code> or upgrade your Groq tier.
        </li>
        <li>
          <strong>Outbound mail bounces</strong> — Brevo requires SPF for the
          <code>SENDER_EMAIL</code> domain. Add the TXT record they show you and
          wait 10 minutes.
        </li>
      </ul>

      <h2>What you saved by self-hosting</h2>
      <p>
        Apollo at $50/mo per seat, Outreach at $130/mo per seat, Instantly at $30/mo
        plus list-building. Cold Scout self-hosted runs on the free tiers of every
        underlying service — your monthly bill is zero until you exceed the free
        quotas. That is the whole point of an{' '}
        <Link to="/blog/cold-scout-vs-apollo-vs-outreach">open-source alternative</Link>.
      </p>
    </ArticleLayout>
  );
}
