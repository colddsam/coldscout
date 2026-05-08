/**
 * DirectoryIndex — Public lead directory landing page.
 *
 * Displays a searchable grid of locations with public lead counts.
 * Each location card links to the industry+city listing page.
 * Premium glassmorphic design matching the existing black/white theme.
 *
 * SEO: BreadcrumbList + ItemList JSON-LD, useSEO meta tags, noscript fallback.
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Search, Globe, TrendingUp, Loader2, Building2, Tag } from 'lucide-react';
import { useDirectoryLocations, useDirectoryIndustries } from '../../hooks/useDirectory';
import { useSEO } from '../../hooks/useSEO';
import JsonLd from '../../components/seo/JsonLd';
import { buildOgImage } from '../../lib/seo/og';
import PublicNavbar from '../../components/layout/PublicNavbar';
import PublicFooter from '../../components/layout/PublicFooter';
import {
  fadeInUp, staggerContainer, staggerItem, scaleIn, defaultViewport,
} from '../../lib/motion';

const BASE_URL = 'https://coldscout.colddsam.com';

function slugifyCity(city: string): string {
  return city
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function DirectoryIndex() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useDirectoryLocations();
  const { data: industriesData } = useDirectoryIndustries();

  const locations = useMemo(() => {
    if (!data?.locations) return [];
    if (!search.trim()) return data.locations;
    const q = search.toLowerCase();
    return data.locations.filter(
      (loc) =>
        loc.city.toLowerCase().includes(q) ||
        (loc.region?.toLowerCase().includes(q)) ||
        (loc.country?.toLowerCase().includes(q))
    );
  }, [data, search]);

  const totalLeads = useMemo(
    () => data?.locations.reduce((sum, l) => sum + l.lead_count, 0) ?? 0,
    [data],
  );

  // SEO
  const ogImage = buildOgImage({
    title: 'Business Lead Directory',
    subtitle: `${totalLeads.toLocaleString()} businesses across ${data?.total_locations ?? 0} cities`,
    kind: 'page',
    badge: 'DIRECTORY',
  });

  useSEO({
    title: 'Business Lead Directory — Find Local Service Leads | Cold Scout',
    description: `Browse ${totalLeads.toLocaleString()}+ local business leads across ${data?.total_locations ?? 0} cities. Find plumbers, roofers, contractors, and more businesses that need digital services.`,
    canonical: `${BASE_URL}/directory`,
    ogImage,
    keywords: 'business directory, local business leads, find leads by city, service leads, B2B leads, Cold Scout directory',
  });

  // JSON-LD
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Business Directory', item: `${BASE_URL}/directory` },
    ],
  };

  const itemListLd = data?.locations?.length ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Cold Scout Business Lead Directory — Locations',
    description: 'Browse local business leads by city and region.',
    numberOfItems: data.locations.length,
    itemListElement: data.locations.slice(0, 50).map((loc, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `${loc.city}${loc.region ? `, ${loc.region}` : ''}${loc.country ? ` — ${loc.country}` : ''}`,
      url: `${BASE_URL}/directory/all/${slugifyCity(loc.city)}`,
    })),
  } : null;

  return (
    <>
      <PublicNavbar />
      <JsonLd data={breadcrumbLd} id="directory-breadcrumb" />
      {itemListLd && <JsonLd data={itemListLd} id="directory-locations" />}

      <main className="min-h-screen bg-surface-2 pt-20 pb-16">
        {/* Hero */}
        <motion.section
          className="max-w-5xl mx-auto px-4 sm:px-6 text-center mb-12"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={scaleIn} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white/70 mb-6">
            <Globe className="w-3.5 h-3.5" />
            SEO Growth Engine
          </motion.div>
          <motion.h1
            variants={staggerItem}
            className="text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight"
          >
            Business Lead
            <span className="block text-white/60">Directory</span>
          </motion.h1>
          <motion.p
            variants={staggerItem}
            className="text-base sm:text-lg text-white/60 mt-4 max-w-2xl mx-auto"
          >
            Discover local businesses across {data?.total_locations ?? '…'} cities that need
            digital services. Each listing includes a free digital presence audit.
          </motion.p>

          {/* Stats row */}
          <motion.div variants={staggerItem} className="flex justify-center gap-8 mt-8">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{totalLeads.toLocaleString()}</p>
              <p className="text-xs text-white/50 mt-0.5">Total Leads</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{data?.total_locations ?? '—'}</p>
              <p className="text-xs text-white/50 mt-0.5">Cities</p>
            </div>
          </motion.div>

          {/* Search */}
          <motion.div variants={staggerItem} className="mt-8 max-w-md mx-auto">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                id="directory-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cities, regions…"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-black/60 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors backdrop-blur-xl"
              />
            </div>
          </motion.div>
        </motion.section>

        {/* Industry Chips */}
        {industriesData && industriesData.industries.length > 0 && !isLoading && (
          <motion.section
            className="max-w-5xl mx-auto px-4 sm:px-6 mb-8"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={defaultViewport}
          >
            <motion.h2 variants={staggerItem} className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">
              Browse by Industry
            </motion.h2>
            <motion.div variants={staggerItem} className="flex flex-wrap gap-2">
              {industriesData.industries.slice(0, 20).map((ind) => (
                <Link
                  key={ind.slug}
                  to={`/directory/${ind.slug}/all`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-white/60 hover:text-white hover:bg-white/[0.08] hover:border-white/15 transition-all"
                >
                  <Tag className="w-3 h-3" />
                  {ind.category}
                  <span className="text-white/30 ml-0.5">({ind.lead_count})</span>
                </Link>
              ))}
            </motion.div>
          </motion.section>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20" role="status" aria-label="Loading directory">
            <Loader2 className="w-6 h-6 animate-spin text-white/50" />
          </div>
        )}

        {/* Location Grid */}
        {!isLoading && (
          <motion.section
            className="max-w-6xl mx-auto px-4 sm:px-6"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={defaultViewport}
          >
            {locations.length === 0 && (
              <motion.div variants={fadeInUp} className="text-center py-20">
                <Building2 className="w-10 h-10 text-white/15 mx-auto mb-3" />
                <p className="text-sm text-white/50">
                  {search ? 'No locations match your search.' : 'No public leads in the directory yet.'}
                </p>
              </motion.div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {locations.map((loc) => (
                <motion.div key={`${loc.city}-${loc.region}-${loc.country_code}`} variants={staggerItem}>
                  <Link
                    to={`/directory/all/${slugifyCity(loc.city)}`}
                    className="block group"
                  >
                    <div className="p-5 rounded-xl bg-black border border-white/10 hover:border-white/20 transition-all duration-300 hover:shadow-[0_0_30px_rgba(255,255,255,0.03)]">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-white/10 transition-colors">
                            <MapPin className="w-4.5 h-4.5 text-white/60" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-white truncate group-hover:text-white/90">
                              {loc.city}
                            </h3>
                            <p className="text-xs text-white/40 truncate mt-0.5">
                              {[loc.region, loc.state, loc.country].filter(Boolean).join(', ')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 text-xs font-medium text-white/70 flex-shrink-0">
                          <TrendingUp className="w-3 h-3" />
                          {loc.lead_count}
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {/* CTA */}
        <motion.section
          className="max-w-2xl mx-auto px-4 sm:px-6 mt-16 text-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={defaultViewport}
        >
          <div className="p-8 rounded-2xl bg-black border border-white/10">
            <h2 className="text-lg font-bold text-white mb-2">Need a custom audit?</h2>
            <p className="text-sm text-white/60 mb-5">
              Use our free Lead Scanner to audit any business website in real-time.
            </p>
            <Link
              to="/scanner"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
            >
              Try Lead Scanner
            </Link>
          </div>
        </motion.section>
      </main>

      {/* Noscript fallback */}
      {data?.locations && (
        <noscript>
          <div style={{ maxWidth: 800, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
            <h1>Business Lead Directory — Cold Scout</h1>
            <p>Browse {totalLeads.toLocaleString()} local business leads across {data.total_locations} cities.</p>
            <ul>
              {data.locations.map((loc) => (
                <li key={`${loc.city}-${loc.region}`}>
                  <a href={`/directory/all/${slugifyCity(loc.city)}`}>
                    {loc.city}{loc.region ? `, ${loc.region}` : ''}{loc.country ? ` — ${loc.country}` : ''} ({loc.lead_count} leads)
                  </a>
                </li>
              ))}
            </ul>
            <p><a href="/">Cold Scout — AI Lead Generation Platform</a></p>
          </div>
        </noscript>
      )}

      <PublicFooter />
    </>
  );
}
