/**
 * Directory JSON-LD builders — pure, shared by the client directory pages
 * (frontend/src/pages/directory/*) and the Next server routes
 * (web/src/app/directory/*).
 *
 * The directory is Cold Scout's programmatic-SEO surface (thousands of
 * city × industry and per-lead pages), so emitting LocalBusiness / ItemList /
 * BreadcrumbList in the *server* HTML — where AI answer engines and crawlers
 * read it without running JS — is where most of the GEO value lives.
 */
import { SITE } from './site';

const BASE_URL = SITE.url;

export function prettify(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function slugifyCity(city: string): string {
  return city
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* ── Directory index (/directory) ──────────────────────────────────────── */

export interface DirectoryLocation {
  city: string;
  region?: string | null;
  country?: string | null;
  lead_count?: number;
}

export function directoryIndexJsonLd(data?: {
  locations?: DirectoryLocation[] | null;
} | null) {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Business Directory', item: `${BASE_URL}/directory` },
    ],
  };

  const itemListLd = data?.locations?.length
    ? {
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
      }
    : null;

  return { breadcrumbLd, itemListLd };
}

/* ── Directory list (/directory/:industry/:city) ───────────────────────── */

export interface DirectoryLeadCard {
  slug: string;
  business_name: string;
  category?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  rating?: number | null;
  review_count?: number | null;
  website_url?: string | null;
}

export function directoryListJsonLd(args: {
  industry: string;
  city: string;
  page: number;
  data?: { total?: number; leads?: DirectoryLeadCard[] | null } | null;
}) {
  const { industry, city, page, data } = args;
  const displayIndustry = prettify(industry);
  const displayCity = prettify(city);
  const pageUrl = `${BASE_URL}/directory/${industry}/${city}`;
  const seoDesc = data
    ? `Browse ${data.total ?? 0} ${displayIndustry.toLowerCase()} businesses in ${displayCity} that need digital services. Free digital presence audits and lead intelligence.`
    : `Find ${displayIndustry.toLowerCase()} leads in ${displayCity}. Browse our directory of local businesses that need digital services.`;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Directory', item: `${BASE_URL}/directory` },
      { '@type': 'ListItem', position: 3, name: `${displayIndustry} in ${displayCity}`, item: pageUrl },
    ],
  };

  const itemListLd = data?.leads?.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `${displayIndustry} Leads in ${displayCity}`,
        description: seoDesc,
        numberOfItems: data.total ?? data.leads.length,
        itemListElement: data.leads.map((lead, i) => ({
          '@type': 'ListItem',
          position: (page - 1) * 20 + i + 1,
          item: {
            '@type': 'LocalBusiness',
            name: lead.business_name,
            url: `${BASE_URL}/directory/lead/${lead.slug}`,
            ...(lead.category && { '@additionalType': lead.category }),
            ...(lead.city && {
              address: {
                '@type': 'PostalAddress',
                addressLocality: lead.city,
                ...(lead.state && { addressRegion: lead.state }),
                ...(lead.country && { addressCountry: lead.country }),
              },
            }),
            ...(lead.rating && { aggregateRating: { '@type': 'AggregateRating', ratingValue: lead.rating, reviewCount: lead.review_count ?? 0 } }),
            ...(lead.website_url && { url: lead.website_url }),
          },
        })),
      }
    : null;

  return { breadcrumbLd, itemListLd };
}

/* ── Directory detail (/directory/lead/:slug) ──────────────────────────── */

export interface DirectoryLeadDetail extends DirectoryLeadCard {
  address?: string | null;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export function directoryDetailJsonLd(slug: string, lead?: DirectoryLeadDetail | null) {
  const detailUrl = `${BASE_URL}/directory/lead/${slug}`;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Directory', item: `${BASE_URL}/directory` },
      ...(lead ? [{ '@type': 'ListItem', position: 3, name: lead.business_name, item: detailUrl }] : []),
    ],
  };

  const localBusinessLd = lead
    ? {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: lead.business_name,
        url: lead.website_url ?? detailUrl,
        ...(lead.category && { '@additionalType': lead.category }),
        ...(lead.address || lead.city
          ? {
              address: {
                '@type': 'PostalAddress',
                ...(lead.address && { streetAddress: lead.address }),
                ...(lead.city && { addressLocality: lead.city }),
                ...(lead.state && { addressRegion: lead.state }),
                ...(lead.country && { addressCountry: lead.country }),
                ...(lead.postal_code && { postalCode: lead.postal_code }),
              },
            }
          : {}),
        ...(lead.latitude && lead.longitude
          ? { geo: { '@type': 'GeoCoordinates', latitude: lead.latitude, longitude: lead.longitude } }
          : {}),
        ...(lead.rating
          ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: lead.rating, reviewCount: lead.review_count ?? 0 } }
          : {}),
      }
    : null;

  return { breadcrumbLd, localBusinessLd };
}
