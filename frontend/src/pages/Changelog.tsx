/**
 * Changelog — release notes by date.
 *
 * Each entry is a NewsArticle in JSON-LD; the index page is an ItemList.
 * Changelog pages are a quiet AEO win — they signal active development to
 * search engines and give answer engines a clean source for "latest version
 * of X" queries.
 */
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';
import { SITE } from '../lib/seo/site';
import { breadcrumbSchema, webPageSchema, articleSchema } from '../lib/seo/schemas';
import { buildOgImage } from '../lib/seo/og';

const CHANGELOG_URL = `${SITE.url}/changelog`;

interface Release {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

const RELEASES: Release[] = [
  {
    version: '1.6.0',
    date: '2026-05-08',
    title: 'AEO and SEO platform pass',
    highlights: [
      'Added /faq, /compare, /use-cases, /integrations, /changelog, /blog, /guides public routes.',
      'Centralized pricing and SEO constants — single source of truth for JSX, JSON-LD, llms.txt, and the OSS README.',
      'SoftwareApplication, AggregateOffer, and HowTo schemas added across public pages.',
      'Bot prerender layer for /u/{username} and /demo/{leadId}.',
      'Dynamic OG image generation via the edge.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-04-22',
    title: 'Lead Scanner',
    highlights: [
      'Bulk lead classification — paste or upload a list, get an AI-scored qualification table.',
      'New /scanner public route.',
      'CSV export with intent score and one-line rationale per lead.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-03-29',
    title: 'Public profiles',
    highlights: [
      'Public freelancer/agency profiles at /u/{username} with ProfilePage JSON-LD.',
      'Booking page at /book/{username}.',
      'Profiles are indexed via /api/v1/seo/sitemap-profiles.xml.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-03-15',
    title: 'Demo builder',
    highlights: [
      'AI-generated single-page websites for leads with no current site.',
      'Demo viewer at /demo/{leadId} (noindex, follow).',
      'Tailwind+Alpine HTML output, sandboxed iframe rendering.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-02-28',
    title: 'MCP server',
    highlights: [
      'Cold Scout exposes itself as an MCP (Model Context Protocol) server.',
      'Tools: search_places, qualify_lead, generate_email, send_email, run_discovery.',
      'Pro plan includes hosted MCP access; OSS exposes a local MCP server.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-01-30',
    title: 'Threads engagement pipeline',
    highlights: [
      'Discover and engage prospects on Meta Threads via the official API.',
      'New /threads dashboard route.',
      'Reply tracking and intent classification on Threads conversations.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-01-01',
    title: 'Cold Scout 1.0',
    highlights: [
      'Public release of the open-source AI lead generation pipeline.',
      'Five-stage pipeline: discovery, qualification, personalization, outreach, reporting.',
      'Free self-host or managed Pro plan.',
    ],
  },
];

const LD_BREADCRUMB = breadcrumbSchema(
  [
    { name: 'Home', url: `${SITE.url}/` },
    { name: 'Changelog', url: CHANGELOG_URL },
  ],
  CHANGELOG_URL,
);

const LD_WEBPAGE = webPageSchema({
  url: CHANGELOG_URL,
  name: 'Changelog — Cold Scout AI Lead Generation Platform',
  description: 'Release notes and product updates for Cold Scout — what shipped, when, and what is in flight.',
});

const LD_RELEASES = RELEASES.map((r) =>
  articleSchema({
    type: 'Article',
    url: `${CHANGELOG_URL}#${r.version}`,
    headline: `Cold Scout ${r.version} — ${r.title}`,
    description: r.highlights.join(' '),
    datePublished: r.date,
    keywords: ['Cold Scout changelog', 'release notes', `Cold Scout ${r.version}`],
  }),
);

export default function Changelog() {
  useSEO({
    title: 'Changelog — Cold Scout AI Lead Generation Platform',
    description:
      'Release notes and product updates for Cold Scout — what shipped, when, and what is in flight.',
    canonical: CHANGELOG_URL,
    keywords:
      'Cold Scout changelog, release notes, AI lead generation updates, product updates',
    ogImage: buildOgImage({
      title: 'Cold Scout Changelog',
      subtitle: `Latest: ${RELEASES[0].version} — ${RELEASES[0].title}`,
      badge: 'CHANGELOG',
    }),
  });

  return (
    <div className="bg-black text-white font-sans antialiased">
      <JsonLd data={LD_WEBPAGE} id="webpage-changelog" />
      <JsonLd data={LD_BREADCRUMB} id="breadcrumb-changelog" />
      {LD_RELEASES.map((data, i) => (
        <JsonLd key={RELEASES[i].version} data={data} id={`release-${RELEASES[i].version}`} />
      ))}
      <PublicNavbar />

      <section className="relative pt-32 pb-12 bg-black">
        <div className="absolute inset-0 noise-overlay opacity-[0.15]" />
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#8A8A8A] font-semibold mb-3">Changelog</p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-white leading-[0.95] mb-5">
            What's new.
          </h1>
          <p className="text-lg text-[#B0B0B0]">
            Release notes, in reverse chronological order. Major versions get their own write-up.
          </p>
        </div>
      </section>

      <section className="py-12 bg-black">
        <div className="max-w-3xl mx-auto px-6">
          <div className="space-y-12">
            {RELEASES.map((r) => (
              <article
                key={r.version}
                id={r.version}
                className="border border-white/[0.08] rounded-2xl bg-surface-2 p-7 scroll-mt-32"
              >
                <div className="flex items-baseline justify-between mb-4">
                  <h2 className="text-xl font-bold tracking-tight text-white">
                    {r.version} — {r.title}
                  </h2>
                  <time
                    dateTime={r.date}
                    className="text-xs text-[#8A8A8A] uppercase tracking-[0.12em]"
                  >
                    {new Date(r.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </time>
                </div>
                <ul className="space-y-2">
                  {r.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2.5 text-sm text-[#C0C0C0]">
                      <span className="mt-2 w-1 h-1 bg-white/40 rounded-full flex-shrink-0" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
