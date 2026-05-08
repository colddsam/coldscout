/**
 * Integrations directory.
 *
 * Each integration card is a Service node in JSON-LD; the page itself is an
 * ItemList. Search engines and answer engines treat /integrations URLs as a
 * canonical "what does this product connect to" answer surface, so we make
 * each entry rich with role, status, and a one-line summary.
 */
import { Link } from 'react-router-dom';
import {
  Map, Brain, Mail, CreditCard, Database, AtSign, Cpu, ShieldCheck,
} from 'lucide-react';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';
import { SITE } from '../lib/seo/site';
import { breadcrumbSchema, webPageSchema, itemListSchema } from '../lib/seo/schemas';
import { buildOgImage } from '../lib/seo/og';

const INTEGRATIONS_URL = `${SITE.url}/integrations`;

interface Integration {
  slug: string;
  name: string;
  role: string;
  description: string;
  icon: typeof Map;
  status: 'live' | 'beta' | 'roadmap';
  url?: string;
}

const INTEGRATIONS: Integration[] = [
  {
    slug: 'google-places-api',
    name: 'Google Places API',
    role: 'Lead discovery',
    description:
      'Source local-business prospects from Google Maps with rating, review count, hours, website, and contact data.',
    icon: Map,
    status: 'live',
    url: 'https://developers.google.com/maps/documentation/places/web-service',
  },
  {
    slug: 'groq-llama',
    name: 'Groq (Llama 3.3 70B / Llama 3.1 8B)',
    role: 'AI qualification + email generation',
    description:
      'Llama-family models hosted on Groq power lead scoring, ICP rubric application, and personalized email drafting.',
    icon: Brain,
    status: 'live',
    url: 'https://groq.com',
  },
  {
    slug: 'brevo-smtp',
    name: 'Brevo (Sendinblue) SMTP',
    role: 'Outreach delivery',
    description:
      'Managed SMTP with DKIM/SPF/DMARC alignment, automatic unsubscribe handling, and reputation monitoring.',
    icon: Mail,
    status: 'live',
    url: 'https://brevo.com',
  },
  {
    slug: 'supabase',
    name: 'Supabase',
    role: 'Auth + Postgres',
    description:
      'Supabase Auth (Google, GitHub, Facebook, LinkedIn OAuth) and a managed Postgres instance back the platform.',
    icon: Database,
    status: 'live',
    url: 'https://supabase.com',
  },
  {
    slug: 'razorpay',
    name: 'Razorpay',
    role: 'Payments',
    description:
      'Razorpay Checkout handles all subscription billing in INR, with regional pricing display in 8 currencies.',
    icon: CreditCard,
    status: 'live',
    url: 'https://razorpay.com',
  },
  {
    slug: 'meta-threads-api',
    name: 'Meta Threads API',
    role: 'Social outreach',
    description:
      'Discover and engage prospects on Meta Threads via the official Threads API. Live in the Threads pipeline.',
    icon: AtSign,
    status: 'beta',
    url: 'https://developers.facebook.com/docs/threads',
  },
  {
    slug: 'mcp-server',
    name: 'Model Context Protocol (MCP)',
    role: 'AI agents',
    description:
      'Cold Scout exposes itself as an MCP server so Claude Desktop, Claude Code, Cursor, and other agents can call its tools.',
    icon: Cpu,
    status: 'live',
    url: 'https://modelcontextprotocol.io',
  },
  {
    slug: 'hubspot-pipedrive',
    name: 'HubSpot / Pipedrive / Salesforce',
    role: 'CRM sync',
    description:
      'Native bi-directional sync — push qualified leads, pull contact updates. Coming next quarter.',
    icon: ShieldCheck,
    status: 'roadmap',
  },
];

const STATUS_LABEL = {
  live: 'Live',
  beta: 'Beta',
  roadmap: 'Coming soon',
};

const STATUS_CLASS = {
  live: 'border-white/15 text-white bg-white/[0.04]',
  beta: 'border-yellow-300/30 text-yellow-200/80',
  roadmap: 'border-white/10 text-[#8A8A8A]',
};

const LD_BREADCRUMB = breadcrumbSchema(
  [
    { name: 'Home', url: `${SITE.url}/` },
    { name: 'Integrations', url: INTEGRATIONS_URL },
  ],
  INTEGRATIONS_URL,
);

const LD_WEBPAGE = webPageSchema({
  url: INTEGRATIONS_URL,
  name: 'Integrations — Cold Scout AI Lead Generation Platform',
  description:
    'Cold Scout integrates with Google Places, Groq, Brevo, Supabase, Razorpay, Meta Threads, and the Model Context Protocol — see the full directory.',
});

const LD_ITEMLIST = itemListSchema(
  INTEGRATIONS.map((i) => ({
    url: i.url ?? `${INTEGRATIONS_URL}#${i.slug}`,
    name: i.name,
    description: i.description,
  })),
  INTEGRATIONS_URL,
);

export default function Integrations() {
  useSEO({
    title: 'Integrations — Cold Scout AI Lead Generation Platform',
    description:
      'Cold Scout integrates with Google Places, Groq, Brevo, Supabase, Razorpay, Meta Threads, and the Model Context Protocol. Live, beta, and roadmap connectors.',
    canonical: INTEGRATIONS_URL,
    keywords:
      'Cold Scout integrations, Google Places integration, Groq Llama integration, Brevo SMTP, Supabase auth, MCP server, Threads API',
    ogImage: buildOgImage({
      title: 'Cold Scout Integrations',
      subtitle: 'Google Places · Groq · Brevo · Supabase · Razorpay · MCP',
      badge: 'INTEGRATIONS',
    }),
  });

  return (
    <div className="bg-black text-white font-sans antialiased">
      <JsonLd data={LD_WEBPAGE} id="webpage-integrations" />
      <JsonLd data={LD_BREADCRUMB} id="breadcrumb-integrations" />
      <JsonLd data={LD_ITEMLIST} id="itemlist-integrations" />
      <PublicNavbar />

      <section className="relative pt-32 pb-12 bg-black">
        <div className="absolute inset-0 noise-overlay opacity-[0.15]" />
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#8A8A8A] font-semibold mb-3">Integrations</p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-white leading-[0.95] mb-5">
            Connected to<br />
            <span className="text-gradient">the right things.</span>
          </h1>
          <p className="text-lg text-[#B0B0B0] max-w-2xl mx-auto">
            Cold Scout's pipeline is built on best-in-class third-party services. Live, beta, and roadmap connectors below.
          </p>
        </div>
      </section>

      <section className="py-12 bg-black">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {INTEGRATIONS.map((i) => (
            <article
              key={i.slug}
              id={i.slug}
              className="border border-white/[0.08] hover:border-white/15 rounded-2xl bg-surface-2 p-6 scroll-mt-32"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                    <i.icon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white leading-tight">{i.name}</h2>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-[#8A8A8A] mt-0.5">{i.role}</p>
                  </div>
                </div>
                <span className={`text-[10px] uppercase tracking-[0.12em] border rounded-full px-2.5 py-0.5 ${STATUS_CLASS[i.status]}`}>
                  {STATUS_LABEL[i.status]}
                </span>
              </div>
              <p className="text-sm text-[#B0B0B0] leading-relaxed mb-4">{i.description}</p>
              {i.url && (
                <a
                  href={i.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-white underline underline-offset-4 decoration-white/30 hover:decoration-white"
                >
                  Visit provider
                </a>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="py-16 bg-surface-1">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tighter text-white mb-4">
            Want a new integration?
          </h2>
          <p className="text-[#B0B0B0] mb-8">
            Open an issue on GitHub or email us. Most integrations land in days, not months.
          </p>
          <Link
            to="/support"
            className="inline-flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full text-sm font-medium hover:bg-gray-200"
          >
            Request integration
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
