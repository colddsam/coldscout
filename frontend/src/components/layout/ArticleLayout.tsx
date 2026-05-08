/**
 * Shared layout for blog posts and guides.
 *
 * Wraps the body with the public navbar/footer, applies prose typography,
 * emits the article + breadcrumb + speakable JSON-LD blocks, and wires the
 * useSEO hook with sane article-flavored defaults.
 *
 * Posts (`src/content/posts/*.tsx`) export a `<Post />` component that this
 * layout receives via `children`. The body should be plain JSX inside a
 * `prose` container — no per-post boilerplate.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, ArrowLeft, Tag } from 'lucide-react';
import PublicNavbar from './PublicNavbar';
import PublicFooter from './PublicFooter';
import JsonLd from '../seo/JsonLd';
import { useSEO } from '../../hooks/useSEO';
import { SITE } from '../../lib/seo/site';
import { articleSchema, breadcrumbSchema } from '../../lib/seo/schemas';
import { buildOgImage } from '../../lib/seo/og';
import type { PostMeta } from '../../content/types';

interface ArticleLayoutProps {
  meta: PostMeta;
  children: ReactNode;
}

const KIND_LABELS = {
  blog: { label: 'Blog', listingPath: '/blog' },
  guide: { label: 'Guide', listingPath: '/guides' },
} as const;

export default function ArticleLayout({ meta, children }: ArticleLayoutProps) {
  const kind = KIND_LABELS[meta.kind];
  const url = `${SITE.url}${kind.listingPath}/${meta.slug}`;
  const heroImage =
    meta.heroImage ??
    buildOgImage({
      title: meta.title,
      subtitle: meta.description,
      kind: meta.kind === 'guide' ? 'guide' : 'article',
      badge: meta.category.toUpperCase(),
    });

  useSEO({
    title: `${meta.title} — Cold Scout`,
    description: meta.description,
    canonical: url,
    keywords: meta.keywords.join(', '),
    ogType: 'article',
    ogImage: heroImage,
    publishedTime: meta.publishedAt,
    modifiedTime: meta.updatedAt ?? meta.publishedAt,
    twitterCreator: SITE.twitterCreator,
  });

  const articleLd = articleSchema({
    type: meta.kind === 'guide' ? 'TechArticle' : 'BlogPosting',
    url,
    headline: meta.title,
    description: meta.description,
    image: heroImage,
    datePublished: meta.publishedAt,
    dateModified: meta.updatedAt ?? meta.publishedAt,
    authorName: meta.author,
    keywords: meta.keywords,
    wordCount: meta.wordCount,
  });

  const breadcrumbLd = breadcrumbSchema(
    [
      { name: 'Home', url: `${SITE.url}/` },
      { name: kind.label, url: `${SITE.url}${kind.listingPath}` },
      { name: meta.title, url },
    ],
    url,
  );

  return (
    <div className="bg-black text-white font-sans antialiased">
      <JsonLd data={articleLd} id={`article-${meta.kind}-${meta.slug}`} />
      <JsonLd data={breadcrumbLd} id={`breadcrumb-${meta.kind}-${meta.slug}`} />
      <PublicNavbar />

      <article className="relative pt-32 pb-24 bg-black">
        <div className="absolute inset-0 noise-overlay opacity-[0.12] pointer-events-none" />
        <div className="relative max-w-3xl mx-auto px-6">
          <Link
            to={kind.listingPath}
            className="inline-flex items-center gap-2 text-sm text-[#8A8A8A] hover:text-white transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            All {kind.label === 'Blog' ? 'articles' : 'guides'}
          </Link>

          <header className="mb-12 border-b border-white/[0.08] pb-10">
            <div className="flex items-center gap-3 mb-5 text-xs">
              <span className="inline-flex items-center gap-1.5 border border-white/15 rounded-full px-3 py-1 text-[#B0B0B0]">
                <Tag className="w-3 h-3" />
                {meta.category}
              </span>
              {meta.isOutline && (
                <span className="border border-yellow-300/30 text-yellow-200/80 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.15em]">
                  Outline · expanding soon
                </span>
              )}
            </div>

            <h1 className="text-3xl md:text-5xl font-bold tracking-tighter text-white leading-[1.05] mb-5">
              {meta.title}
            </h1>
            <p className="text-lg text-[#B0B0B0] leading-relaxed">{meta.description}</p>

            <div className="flex flex-wrap items-center gap-5 mt-6 text-xs text-[#8A8A8A]">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <time dateTime={meta.publishedAt}>
                  {new Date(meta.publishedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {meta.readMinutes} min read
              </span>
              {meta.author && <span>By {meta.author}</span>}
            </div>
          </header>

          <div className="prose prose-invert prose-lg max-w-none prose-headings:tracking-tighter prose-headings:font-bold prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3 prose-p:text-[#C0C0C0] prose-p:leading-relaxed prose-li:text-[#C0C0C0] prose-strong:text-white prose-a:text-white prose-a:underline prose-a:underline-offset-4 prose-a:decoration-white/30 hover:prose-a:decoration-white prose-code:text-white prose-code:bg-white/[0.06] prose-code:border prose-code:border-white/10 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal prose-pre:bg-surface-2 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl prose-blockquote:border-l-white/30 prose-blockquote:text-white/80">
            {children}
          </div>

          <footer className="mt-16 pt-10 border-t border-white/[0.08]">
            <p className="text-sm text-[#B0B0B0] mb-4">Tagged:</p>
            <div className="flex flex-wrap gap-2">
              {meta.keywords.map((kw) => (
                <span
                  key={kw}
                  className="text-xs border border-white/10 rounded-full px-3 py-1 text-[#B0B0B0]"
                >
                  {kw}
                </span>
              ))}
            </div>
          </footer>
        </div>
      </article>

      <PublicFooter />
    </div>
  );
}
