/**
 * DirectoryList — Paginated public leads for a given industry + city.
 *
 * Route: /directory/:industry/:city
 *
 * Displays a list of public leads with rating, AI score tier badges,
 * and website status. Each card links to the individual lead detail page.
 *
 * SEO: BreadcrumbList + ItemList + LocalBusiness JSON-LD per lead,
 * useSEO meta tags, noscript fallback.
 */

import { useParams, Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, MapPin, Star, Globe, Loader2,
  ChevronLeft, Building2, Search,
} from 'lucide-react';
import { useDirectoryList } from '../../hooks/useDirectory';
import { useSEO } from '../../hooks/useSEO';
import JsonLd from '../../components/seo/JsonLd';
import { buildOgImage } from '../../lib/seo/og';
import { directoryListJsonLd } from '../../lib/seo/directory-schema';
import PublicNavbar from '../../components/layout/PublicNavbar';
import PublicFooter from '../../components/layout/PublicFooter';
import {
  fadeInUp, staggerContainer, staggerItem, defaultViewport,
} from '../../lib/motion';

const BASE_URL = 'https://coldscout.colddsam.com';

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  A: { bg: 'bg-white/10', text: 'text-white', label: 'High Need' },
  B: { bg: 'bg-white/5', text: 'text-white/70', label: 'Moderate' },
  C: { bg: 'bg-white/[0.03]', text: 'text-white/50', label: 'Low Need' },
};

function prettify(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DirectoryList() {
  const { industry = '', city = '' } = useParams<{ industry: string; city: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get('page') ?? '1', 10);

  const { data, isLoading, isError } = useDirectoryList(industry, city, page, 20);

  const displayIndustry = prettify(industry);
  const displayCity = prettify(city);
  const seoTitle = `${displayIndustry} Leads in ${displayCity} — Cold Scout Directory`;
  const seoDesc = data
    ? `Browse ${data.total} ${displayIndustry.toLowerCase()} businesses in ${displayCity} that need digital services. Free digital presence audits and lead intelligence.`
    : `Find ${displayIndustry.toLowerCase()} leads in ${displayCity}. Browse our directory of local businesses that need digital services.`;

  const ogImage = buildOgImage({
    title: `${displayIndustry} in ${displayCity}`,
    subtitle: data ? `${data.total} leads available` : 'Lead Directory',
    kind: 'page',
    badge: 'DIRECTORY',
  });

  useSEO({
    title: seoTitle,
    description: seoDesc,
    canonical: `${BASE_URL}/directory/${industry}/${city}`,
    ogImage,
    keywords: `${displayIndustry.toLowerCase()} leads, ${displayCity.toLowerCase()} leads, ${displayIndustry.toLowerCase()} ${displayCity.toLowerCase()}, local business leads, Cold Scout directory`,
  });

  // JSON-LD (shared builder → identical schema server-renders in web/)
  const { breadcrumbLd, itemListLd } = directoryListJsonLd({ industry, city, page, data });

  const goToPage = (p: number) => {
    setSearchParams({ page: String(p) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <PublicNavbar />
      <JsonLd data={breadcrumbLd} id="directory-list-breadcrumb" />
      {itemListLd && <JsonLd data={itemListLd} id="directory-list-items" />}

      <main className="min-h-screen bg-surface-2 pt-20 pb-16">
        {/* Header */}
        <motion.section
          className="max-w-5xl mx-auto px-4 sm:px-6 mb-8"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={staggerItem}>
            <Link to="/directory" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/70 transition-colors mb-4">
              <ChevronLeft className="w-3.5 h-3.5" />
              Back to Directory
            </Link>
          </motion.div>

          <motion.h1 variants={staggerItem} className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
            {displayIndustry} Leads
            <span className="text-white/50"> in {displayCity}</span>
          </motion.h1>

          {data && (
            <motion.p variants={staggerItem} className="text-sm text-white/50 mt-2">
              {data.total} {data.total === 1 ? 'business' : 'businesses'} found · Page {page} of {data.pages}
            </motion.p>
          )}
        </motion.section>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20" role="status">
            <Loader2 className="w-6 h-6 animate-spin text-white/50" />
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center py-20">
            <Search className="w-10 h-10 text-white/15 mx-auto mb-3" />
            <p className="text-sm text-white/50 mb-4">Could not load directory listings.</p>
            <Link to="/directory" className="text-sm text-white hover:underline">← Back to Directory</Link>
          </div>
        )}

        {/* Lead Cards */}
        {data && !isLoading && (
          <motion.section
            className="max-w-5xl mx-auto px-4 sm:px-6"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={defaultViewport}
          >
            {data.leads.length === 0 && (
              <motion.div variants={fadeInUp} className="text-center py-20">
                <Building2 className="w-10 h-10 text-white/15 mx-auto mb-3" />
                <p className="text-sm text-white/50">No public leads found for this industry and city.</p>
                <Link to="/directory" className="text-sm text-white hover:underline mt-3 inline-block">← Browse other locations</Link>
              </motion.div>
            )}

            <div className="space-y-3">
              {data.leads.map((lead) => {
                const tier = TIER_STYLES[lead.ai_score_tier] ?? TIER_STYLES.C;
                return (
                  <motion.div key={lead.slug} variants={staggerItem}>
                    <Link
                      to={`/directory/lead/${lead.slug}`}
                      className="block group"
                    >
                      <div className="p-5 rounded-xl bg-black border border-white/10 hover:border-white/20 transition-all duration-300 hover:shadow-[0_0_30px_rgba(255,255,255,0.03)]">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          {/* Lead info */}
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-white/10 transition-colors">
                              <Building2 className="w-4.5 h-4.5 text-white/50" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-white truncate group-hover:text-white/90">
                                {lead.business_name}
                              </h3>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-white/40">
                                {lead.category && <span>{lead.category}</span>}
                                {lead.city && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {lead.city}{lead.state ? `, ${lead.state}` : ''}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Badges */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {/* Rating */}
                            {lead.rating && (
                              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/5 text-xs font-medium text-white/70">
                                <Star className="w-3 h-3 fill-current" />
                                {lead.rating.toFixed(1)}
                                {lead.review_count != null && (
                                  <span className="text-white/40">({lead.review_count})</span>
                                )}
                              </div>
                            )}

                            {/* Website status */}
                            {lead.has_website ? (
                              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/5 text-xs font-medium text-white/60">
                                <Globe className="w-3 h-3" />
                                Has Website
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.03] text-xs font-medium text-white/30">
                                No Website
                              </div>
                            )}

                            {/* AI Score tier */}
                            <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${tier.bg} ${tier.text}`}>
                              {tier.label}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>

            {/* Pagination */}
            {data.pages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-8">
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/5 text-sm font-medium text-white/70 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Prev
                </button>
                <span className="text-xs text-white/40">
                  {page} / {data.pages}
                </span>
                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= data.pages}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/5 text-sm font-medium text-white/70 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </motion.section>
        )}
      </main>

      {/* Noscript fallback */}
      {data?.leads && (
        <noscript>
          <div style={{ maxWidth: 800, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
            <h1>{displayIndustry} Leads in {displayCity}</h1>
            <p>{data.total} businesses found.</p>
            <ul>
              {data.leads.map((lead) => (
                <li key={lead.slug}>
                  <a href={`/directory/lead/${lead.slug}`}>
                    <strong>{lead.business_name}</strong>
                    {lead.category && ` — ${lead.category}`}
                    {lead.rating && ` (${lead.rating.toFixed(1)}★)`}
                  </a>
                </li>
              ))}
            </ul>
            <p><a href="/directory">← Back to Directory</a></p>
          </div>
        </noscript>
      )}

      <PublicFooter />
    </>
  );
}
