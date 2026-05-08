/**
 * Guides index — same shape as Blog but filters to `kind: 'guide'`.
 *
 * Guides are technical/how-to content; the blog is editorial. Keeping them
 * on separate URL prefixes lets us hint to search engines what each path
 * holds (TechArticle vs BlogPosting), and lets readers self-select.
 */
import { Link } from 'react-router-dom';
import { Calendar, Clock, ArrowRight, BookOpen } from 'lucide-react';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';
import { SITE } from '../lib/seo/site';
import { breadcrumbSchema, itemListSchema, webPageSchema } from '../lib/seo/schemas';
import { buildOgImage } from '../lib/seo/og';
import { guideEntries } from '../content';

const GUIDES_URL = `${SITE.url}/guides`;

const LD_WEBPAGE = webPageSchema({
  url: GUIDES_URL,
  name: 'Guides — Cold Scout: Self-host, Setup, MCP Server, Deliverability',
  description:
    'Technical guides for the Cold Scout open-source AI lead generation platform — self-hosting with Docker, MCP server setup, deliverability, and engineering deep-dives.',
});

const LD_BREADCRUMB = breadcrumbSchema(
  [
    { name: 'Home', url: `${SITE.url}/` },
    { name: 'Guides', url: GUIDES_URL },
  ],
  GUIDES_URL,
);

const LD_ITEMLIST = itemListSchema(
  guideEntries.map((e) => ({
    url: `${GUIDES_URL}/${e.meta.slug}`,
    name: e.meta.title,
    description: e.meta.description,
    image: e.meta.heroImage,
  })),
  GUIDES_URL,
);

export default function Guides() {
  useSEO({
    title: 'Guides — Cold Scout: Self-host, Setup, MCP Server, Deliverability',
    description:
      'Technical guides for the Cold Scout open-source AI lead generation platform — self-hosting with Docker, MCP server setup, deliverability, and engineering deep-dives.',
    canonical: GUIDES_URL,
    keywords:
      'Cold Scout guides, self-host lead generation, MCP server setup, Docker FastAPI, deliverability guide',
    ogImage: buildOgImage({
      title: 'Build it yourself.',
      subtitle: 'Self-host Cold Scout, set up the MCP server, run in production',
      badge: 'GUIDES',
    }),
  });

  return (
    <div className="bg-black text-white font-sans antialiased">
      <JsonLd data={LD_WEBPAGE} id="webpage-guides" />
      <JsonLd data={LD_BREADCRUMB} id="breadcrumb-guides" />
      <JsonLd data={LD_ITEMLIST} id="itemlist-guides" />
      <PublicNavbar />

      <section className="relative pt-32 pb-12 bg-black">
        <div className="absolute inset-0 noise-overlay opacity-[0.15]" />
        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 border border-white/10 rounded-full px-4 py-1.5 mb-6 bg-white/[0.03]">
            <BookOpen className="w-3.5 h-3.5 text-white" />
            <span className="text-xs font-medium text-[#B0B0B0]">Guides</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-white leading-[0.95] mb-5">
            Build it yourself.
          </h1>
          <p className="text-lg text-[#B0B0B0] max-w-2xl mx-auto">
            Step-by-step guides for self-hosting Cold Scout, wiring it to your AI agents,
            and operating the pipeline in production.
          </p>
        </div>
      </section>

      <section className="py-12 bg-black">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {guideEntries.map((entry) => {
            const { meta } = entry;
            return (
              <Link
                key={meta.slug}
                to={`/guides/${meta.slug}`}
                className="group block border border-white/[0.08] hover:border-white/25 rounded-2xl bg-surface-2 p-7 transition-all duration-300 hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-3 text-xs text-[#8A8A8A] mb-3">
                  <span className="border border-white/10 rounded-full px-2.5 py-0.5">{meta.category}</span>
                  {meta.isOutline && (
                    <span className="border border-yellow-300/30 text-yellow-200/80 rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.15em]">
                      Outline
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold tracking-tight text-white mb-2 group-hover:text-white/90">
                  {meta.title}
                </h2>
                <p className="text-sm text-[#B0B0B0] leading-relaxed mb-5 line-clamp-3">
                  {meta.description}
                </p>
                <div className="flex items-center justify-between text-xs text-[#8A8A8A]">
                  <div className="flex items-center gap-4">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <time dateTime={meta.publishedAt}>
                        {new Date(meta.publishedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </time>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {meta.readMinutes} min
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#8A8A8A] group-hover:text-white transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
