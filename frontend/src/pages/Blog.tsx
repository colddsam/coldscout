/**
 * Blog index — lists every blog-kind post in the content registry.
 *
 * Listing pages get heavy AEO benefit when each item carries enough metadata:
 * we expose date, read time, category badge, and a clear hierarchy. The page
 * itself emits ItemList JSON-LD so answer engines see a structured catalog.
 */
import { Link } from 'react-router-dom';
import { Calendar, Clock, ArrowRight } from 'lucide-react';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';
import { SITE } from '../lib/seo/site';
import { breadcrumbSchema, itemListSchema, webPageSchema } from '../lib/seo/schemas';
import { buildOgImage } from '../lib/seo/og';
import { blogEntries } from '../content';

const BLOG_URL = `${SITE.url}/blog`;

const LD_WEBPAGE = webPageSchema({
  url: BLOG_URL,
  name: 'Cold Scout Blog — Lead Generation, AI Outreach & Sales Engineering',
  description:
    'Articles, comparisons, and how-tos on AI lead generation, B2B outreach automation, and the engineering of modern sales pipelines.',
});

const LD_BREADCRUMB = breadcrumbSchema(
  [
    { name: 'Home', url: `${SITE.url}/` },
    { name: 'Blog', url: BLOG_URL },
  ],
  BLOG_URL,
);

const LD_ITEMLIST = itemListSchema(
  blogEntries.map((e) => ({
    url: `${BLOG_URL}/${e.meta.slug}`,
    name: e.meta.title,
    description: e.meta.description,
    image: e.meta.heroImage,
  })),
  BLOG_URL,
);

export default function Blog() {
  useSEO({
    title: 'Blog — Cold Scout: AI Lead Generation, Outreach, Sales Engineering',
    description:
      'Articles, comparisons, and how-tos on AI lead generation, B2B outreach automation, and the engineering of modern sales pipelines.',
    canonical: BLOG_URL,
    keywords:
      'AI lead generation blog, B2B outreach automation, cold email AI generator, open source lead generation, Cold Scout blog',
    ogImage: buildOgImage({
      title: 'Lead generation, engineered.',
      subtitle: 'Articles, comparisons, and how-tos on AI outreach',
      badge: 'BLOG',
    }),
  });

  return (
    <div className="bg-black text-white font-sans antialiased">
      <JsonLd data={LD_WEBPAGE} id="webpage-blog" />
      <JsonLd data={LD_BREADCRUMB} id="breadcrumb-blog" />
      <JsonLd data={LD_ITEMLIST} id="itemlist-blog" />
      <PublicNavbar />

      <section className="relative pt-32 pb-12 bg-black">
        <div className="absolute inset-0 noise-overlay opacity-[0.15]" />
        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#8A8A8A] font-semibold mb-3">Blog</p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-white leading-[0.95] mb-5">
            Lead generation, <br />engineered.
          </h1>
          <p className="text-lg text-[#B0B0B0] max-w-2xl mx-auto">
            Articles, comparisons, and how-tos on AI lead generation, B2B outreach automation, and the
            engineering of modern sales pipelines.
          </p>
        </div>
      </section>

      <section className="py-12 bg-black">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {blogEntries.map((entry) => {
            const { meta } = entry;
            return (
              <Link
                key={meta.slug}
                to={`/blog/${meta.slug}`}
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
