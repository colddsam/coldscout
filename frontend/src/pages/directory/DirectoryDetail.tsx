/**
 * DirectoryDetail — Full public-safe detail page for a single lead.
 *
 * Route: /directory/lead/:slug
 *
 * Displays business info, website quality signals, Google Maps link,
 * and CTAs for Lead Scanner and sign-up. No email/phone ever shown.
 *
 * SEO: LocalBusiness + BreadcrumbList JSON-LD, useSEO meta, noscript.
 */

import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChevronLeft, MapPin, Star, Globe,
  ExternalLink, Loader2, AlertTriangle,
  Building2, ArrowRight, CheckCircle2, XCircle, TrendingUp,
} from 'lucide-react';
import { useDirectoryLead } from '../../hooks/useDirectory';
import { useSEO } from '../../hooks/useSEO';
import JsonLd from '../../components/seo/JsonLd';
import { buildOgImage } from '../../lib/seo/og';
import PublicNavbar from '../../components/layout/PublicNavbar';
import PublicFooter from '../../components/layout/PublicFooter';
import {
  fadeInUp, staggerContainer, staggerItem,
} from '../../lib/motion';

const BASE_URL = 'https://coldscout.colddsam.com';

const TIER_INFO: Record<string, { label: string; description: string; color: string }> = {
  A: { label: 'High Need', description: 'This business has significant gaps in their digital presence and would greatly benefit from professional services.', color: 'text-white' },
  B: { label: 'Moderate Need', description: 'This business has some digital presence gaps that could be improved with targeted services.', color: 'text-white/70' },
  C: { label: 'Low Need', description: 'This business has a relatively established digital presence with minimal gaps.', color: 'text-white/50' },
};

function Signal({ positive, label }: { positive: boolean | null | undefined; label: string }) {
  if (positive == null) return null;
  return (
    <div className="flex items-center gap-2.5 py-2 px-3 rounded-lg bg-white/[0.02]">
      {positive ? (
        <CheckCircle2 className="w-4 h-4 text-white/50 flex-shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-white/30 flex-shrink-0" />
      )}
      <span className={`text-sm ${positive ? 'text-white/70' : 'text-white/40'}`}>{label}</span>
    </div>
  );
}

export default function DirectoryDetail() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { data: lead, isLoading, isError } = useDirectoryLead(slug);

  const tier = TIER_INFO[lead?.ai_score_tier ?? 'C'] ?? TIER_INFO.C;
  const displayTitle = lead
    ? `${lead.business_name} — Digital Presence Audit | Cold Scout`
    : 'Lead Detail — Cold Scout Directory';
  const displayDesc = lead
    ? `Free digital presence audit for ${lead.business_name} in ${lead.city ?? 'Unknown City'}. See website quality, mobile responsiveness, social media presence, and AI-generated service need score.`
    : 'View a detailed digital presence audit for a local business.';

  const ogImage = buildOgImage({
    title: lead?.business_name ?? 'Lead Detail',
    subtitle: lead ? `${lead.category ?? 'Business'} in ${lead.city ?? '?'}` : 'Cold Scout Directory',
    kind: 'page',
    badge: lead?.ai_score_tier ?? 'LEAD',
  });

  useSEO({
    title: displayTitle,
    description: displayDesc,
    canonical: `${BASE_URL}/directory/lead/${slug}`,
    ogImage,
    keywords: lead
      ? `${lead.business_name}, ${lead.category ?? ''}, ${lead.city ?? ''} ${lead.state ?? ''}, digital presence audit, lead directory`
      : 'digital presence audit, lead directory, Cold Scout',
  });

  // JSON-LD
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Directory', item: `${BASE_URL}/directory` },
      ...(lead ? [
        { '@type': 'ListItem', position: 3, name: lead.business_name, item: `${BASE_URL}/directory/lead/${slug}` },
      ] : []),
    ],
  };

  const localBusinessLd = lead ? {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: lead.business_name,
    url: lead.website_url ?? `${BASE_URL}/directory/lead/${slug}`,
    ...(lead.category && { '@additionalType': lead.category }),
    ...(lead.address || lead.city ? {
      address: {
        '@type': 'PostalAddress',
        ...(lead.address && { streetAddress: lead.address }),
        ...(lead.city && { addressLocality: lead.city }),
        ...(lead.state && { addressRegion: lead.state }),
        ...(lead.country && { addressCountry: lead.country }),
        ...(lead.postal_code && { postalCode: lead.postal_code }),
      },
    } : {}),
    ...(lead.latitude && lead.longitude ? {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: lead.latitude,
        longitude: lead.longitude,
      },
    } : {}),
    ...(lead.rating ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: lead.rating,
        reviewCount: lead.review_count ?? 0,
      },
    } : {}),
  } : null;

  return (
    <>
      <PublicNavbar />
      <JsonLd data={breadcrumbLd} id="directory-detail-breadcrumb" />
      {localBusinessLd && <JsonLd data={localBusinessLd} id="directory-detail-business" />}

      <main className="min-h-screen bg-surface-2 pt-20 pb-16">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-32" role="status">
            <Loader2 className="w-6 h-6 animate-spin text-white/50" />
          </div>
        )}

        {/* Error / Not found */}
        {isError && (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center py-32">
            <AlertTriangle className="w-10 h-10 text-white/15 mx-auto mb-3" />
            <h1 className="text-lg font-bold text-white mb-2">Lead Not Found</h1>
            <p className="text-sm text-white/50 mb-5">This lead may not exist or isn't publicly listed.</p>
            <Link to="/directory" className="text-sm text-white hover:underline">← Back to Directory</Link>
          </div>
        )}

        {/* Lead Detail */}
        {lead && !isLoading && (
          <>
            <motion.section
              className="max-w-4xl mx-auto px-4 sm:px-6"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {/* Back link */}
              <motion.div variants={staggerItem}>
                <Link to="/directory" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/70 transition-colors mb-6">
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Back to Directory
                </Link>
              </motion.div>

              {/* Header card */}
              <motion.div
                variants={staggerItem}
                className="p-6 sm:p-8 rounded-2xl bg-black border border-white/10 mb-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-6 h-6 text-white/50" />
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                        {lead.business_name}
                      </h1>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-white/50">
                        {lead.category && <span>{lead.category}</span>}
                        {lead.city && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {[lead.city, lead.state, lead.country].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </div>
                      {lead.address && (
                        <p className="text-xs text-white/30 mt-1">{lead.address}</p>
                      )}
                    </div>
                  </div>

                  {/* AI Score Tier */}
                  <div className="flex flex-col items-center sm:items-end gap-1.5 flex-shrink-0">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
                      <TrendingUp className="w-4 h-4 text-white/60" />
                      <span className={`text-sm font-bold ${tier.color}`}>{tier.label}</span>
                    </div>
                    <p className="text-[10px] text-white/30 text-center sm:text-right max-w-[200px]">
                      AI Service Need Score
                    </p>
                  </div>
                </div>

                {/* Rating */}
                {lead.rating && (
                  <div className="flex items-center gap-2 mt-5 pt-5 border-t border-white/5">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < Math.round(lead.rating!) ? 'text-white/70 fill-current' : 'text-white/15'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-sm text-white/60 font-medium">{lead.rating.toFixed(1)}</span>
                    {lead.review_count != null && (
                      <span className="text-xs text-white/30">({lead.review_count} reviews)</span>
                    )}
                  </div>
                )}
              </motion.div>

              {/* Two-column grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Digital Presence Signals */}
                <motion.div
                  variants={staggerItem}
                  className="p-6 rounded-xl bg-black border border-white/10"
                >
                  <h2 className="text-sm font-semibold text-white/80 mb-4">Digital Presence Signals</h2>
                  <div className="space-y-2">
                    <Signal positive={lead.has_website} label="Has a website" />
                    <Signal positive={lead.is_mobile_responsive} label="Mobile responsive" />
                    <Signal positive={lead.has_social_media} label="Social media presence" />
                    <Signal positive={lead.has_online_booking} label="Online booking" />
                    <Signal positive={lead.has_ecommerce} label="E-commerce enabled" />
                  </div>
                </motion.div>

                {/* Actions */}
                <motion.div
                  variants={staggerItem}
                  className="p-6 rounded-xl bg-black border border-white/10"
                >
                  <h2 className="text-sm font-semibold text-white/80 mb-4">Quick Actions</h2>
                  <div className="space-y-3">
                    {lead.website_url && (
                      <a
                        href={lead.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] hover:bg-white/5 transition-colors group"
                      >
                        <Globe className="w-4 h-4 text-white/50" />
                        <span className="text-sm text-white/60 group-hover:text-white/80 truncate">{lead.website_url}</span>
                        <ExternalLink className="w-3 h-3 text-white/30 ml-auto flex-shrink-0" />
                      </a>
                    )}
                    {lead.google_maps_url && (
                      <a
                        href={lead.google_maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] hover:bg-white/5 transition-colors group"
                      >
                        <MapPin className="w-4 h-4 text-white/50" />
                        <span className="text-sm text-white/60 group-hover:text-white/80">View on Google Maps</span>
                        <ExternalLink className="w-3 h-3 text-white/30 ml-auto flex-shrink-0" />
                      </a>
                    )}
                  </div>

                  {/* AI Score explanation */}
                  <div className="mt-5 pt-4 border-t border-white/5">
                    <p className="text-xs text-white/40 leading-relaxed">{tier.description}</p>
                  </div>
                </motion.div>
              </div>

              {/* CTAs */}
              <motion.div
                variants={fadeInUp}
                className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4"
              >
                <Link
                  to="/scanner"
                  className="flex items-center justify-between p-5 rounded-xl bg-black border border-white/10 hover:border-white/20 transition-all group"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">Run Full Audit</p>
                    <p className="text-xs text-white/40 mt-0.5">Free website scanner with detailed report</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />
                </Link>

                <Link
                  to="/signup"
                  className="flex items-center justify-between p-5 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all group"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">Claim This Business</p>
                    <p className="text-xs text-white/40 mt-0.5">Sign up to manage your listing</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />
                </Link>
              </motion.div>

              {/* Discovered date */}
              {lead.discovered_at && (
                <motion.p variants={staggerItem} className="text-[11px] text-white/20 mt-6 text-center">
                  Added to directory on {new Date(lead.discovered_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </motion.p>
              )}
            </motion.section>
          </>
        )}
      </main>

      {/* Noscript fallback */}
      {lead && (
        <noscript>
          <div style={{ maxWidth: 800, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
            <h1>{lead.business_name}</h1>
            {lead.category && <p><strong>Category:</strong> {lead.category}</p>}
            {lead.address && <p><strong>Address:</strong> {lead.address}</p>}
            {lead.city && <p><strong>Location:</strong> {[lead.city, lead.state, lead.country].filter(Boolean).join(', ')}</p>}
            {lead.rating && <p><strong>Rating:</strong> {lead.rating.toFixed(1)} ({lead.review_count} reviews)</p>}
            {lead.website_url && <p><strong>Website:</strong> <a href={lead.website_url}>{lead.website_url}</a></p>}
            {lead.google_maps_url && <p><a href={lead.google_maps_url}>View on Google Maps</a></p>}
            <p><strong>Service Need:</strong> {tier.label}</p>
            <p><a href="/directory">← Back to Directory</a> · <a href="/scanner">Run Full Audit</a></p>
          </div>
        </noscript>
      )}

      <PublicFooter />
    </>
  );
}
