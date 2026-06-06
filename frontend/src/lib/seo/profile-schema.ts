/**
 * Public-profile JSON-LD builder — pure, shared by the client page
 * (frontend/src/pages/PublicProfile.tsx) and the Next server route
 * (web/src/app/u/[username]/page.tsx).
 *
 * Profiles are a high-value AEO/GEO surface (Person / Organization / Occupation
 * / Offer / ProfilePage). Building the graph here — not inline in the client
 * page — means the Next server route can emit the exact same schema in the
 * server HTML, where AI answer engines and social scrapers actually read it.
 */
import type { PublicProfile } from '../api';
import { SITE } from './site';

const BASE_URL = SITE.url;

function isoDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toISOString().split('T')[0];
}

export interface ProfileJsonLd {
  profilePageLd: Record<string, unknown>;
  breadcrumbLd: Record<string, unknown>;
  portfolioLd: Record<string, unknown> | null;
}

export function buildProfileJsonLd(
  profile: PublicProfile,
  username: string,
): ProfileJsonLd {
  const profileUrl = `${BASE_URL}/u/${username}`;
  const photoUrl = profile.profile_photo_url || profile.avatar_url;
  const isFreelancer = !!profile.freelancer;
  const isBusiness = !!profile.business;

  // --- Main entity (Person or Organization) ---
  let mainEntity: Record<string, unknown>;

  if (isFreelancer) {
    const f = profile.freelancer!;
    const sameAs = [
      f.linkedin_url, f.github_url, f.twitter_url,
      f.dribbble_url, f.behance_url, f.personal_website,
    ].filter(Boolean);

    mainEntity = {
      '@type': 'Person',
      '@id': `${profileUrl}#person`,
      name: profile.full_name || username,
      url: profileUrl,
      ...(photoUrl && { image: { '@type': 'ImageObject', url: photoUrl, caption: `${profile.full_name || username} profile photo` } }),
      ...(profile.bio && { description: profile.bio }),
      ...(f.professional_title && { jobTitle: f.professional_title }),
      ...(profile.location && {
        address: { '@type': 'PostalAddress', addressLocality: profile.location },
        homeLocation: { '@type': 'Place', name: profile.location },
      }),
      ...(profile.email && { email: `mailto:${profile.email}` }),
      ...(profile.phone && { telephone: profile.phone }),
      ...(f.skills?.length && { knowsAbout: f.skills }),
      ...(f.languages?.length && { knowsLanguage: f.languages }),
      ...(sameAs.length && { sameAs }),
      // Occupation
      ...(f.professional_title && {
        hasOccupation: {
          '@type': 'Occupation',
          name: f.professional_title,
          ...(profile.location && {
            occupationLocation: { '@type': 'City', name: profile.location },
          }),
          ...(f.hourly_rate && {
            estimatedSalary: {
              '@type': 'MonetaryAmountDistribution',
              name: 'Hourly Rate',
              median: f.hourly_rate,
            },
          }),
          ...(f.skills?.length && { skills: f.skills.join(', ') }),
          ...(f.experience_years != null && {
            experienceRequirements: `${f.experience_years} years of professional experience`,
          }),
        },
      }),
      // Certifications
      ...(f.certifications?.length && {
        hasCredential: f.certifications.map((c) => ({
          '@type': 'EducationalOccupationalCredential',
          credentialCategory: 'certification',
          name: c,
        })),
      }),
      // Education
      ...(f.education && {
        alumniOf: { '@type': 'EducationalOrganization', name: f.education },
      }),
      // Service offer
      ...(f.professional_title && {
        makesOffer: {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: `${f.professional_title} Services`,
            ...(profile.bio && { description: profile.bio }),
            provider: { '@id': `${profileUrl}#person` },
            ...(profile.location && { areaServed: profile.location }),
          },
          ...(f.hourly_rate && { price: f.hourly_rate, priceCurrency: 'USD' }),
          ...(f.availability === 'available' && { availability: 'https://schema.org/InStock' }),
          ...(f.availability === 'not_available' && { availability: 'https://schema.org/OutOfStock' }),
        },
      }),
      // Booking action
      ...(f.booking_url && {
        potentialAction: {
          '@type': 'ReserveAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${BASE_URL}/book/${username}`,
            actionPlatform: ['http://schema.org/DesktopWebPlatform', 'http://schema.org/MobileWebPlatform'],
          },
          name: 'Book a Meeting',
          description: `Schedule a meeting with ${profile.full_name || username}`,
        },
      }),
    };
  } else if (isBusiness) {
    const b = profile.business!;
    const sameAs = [
      b.linkedin_url, b.twitter_url, b.facebook_url,
      b.instagram_url, b.company_website,
    ].filter(Boolean);

    mainEntity = {
      '@type': 'Organization',
      '@id': `${profileUrl}#organization`,
      name: b.company_name || profile.full_name || username,
      url: profileUrl,
      ...(b.company_logo_url && { logo: { '@type': 'ImageObject', url: b.company_logo_url } }),
      ...(photoUrl && { image: photoUrl }),
      ...(b.company_description && { description: b.company_description }),
      ...(b.industry && { industry: b.industry }),
      ...(b.founded_year && { foundingDate: String(b.founded_year) }),
      ...(b.company_size && {
        numberOfEmployees: { '@type': 'QuantitativeValue', value: b.company_size },
      }),
      ...((b.city || b.state || b.country) && {
        address: {
          '@type': 'PostalAddress',
          ...(b.address && { streetAddress: b.address }),
          ...(b.city && { addressLocality: b.city }),
          ...(b.state && { addressRegion: b.state }),
          ...(b.country && { addressCountry: b.country }),
          ...(b.postal_code && { postalCode: b.postal_code }),
        },
      }),
      ...(b.brand_name && { brand: { '@type': 'Brand', name: b.brand_name } }),
      ...(profile.email && { email: `mailto:${profile.email}` }),
      ...(profile.phone && { telephone: profile.phone }),
      ...(sameAs.length && { sameAs }),
      ...(b.company_website && { mainEntityOfPage: b.company_website }),
    };
  } else {
    mainEntity = {
      '@type': 'Person',
      '@id': `${profileUrl}#person`,
      name: profile.full_name || username,
      url: profileUrl,
      ...(photoUrl && { image: photoUrl }),
      ...(profile.bio && { description: profile.bio }),
      ...(profile.location && {
        address: { '@type': 'PostalAddress', addressLocality: profile.location },
      }),
    };
  }

  // --- ProfilePage wrapper ---
  const profilePageLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': profileUrl,
    url: profileUrl,
    name: `${profile.full_name || username}'s Profile`,
    ...(profile.bio && { description: profile.bio }),
    mainEntity,
    ...(profile.member_since && { dateCreated: isoDate(profile.member_since) }),
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${BASE_URL}/#website`,
      name: 'Cold Scout',
      url: BASE_URL,
    },
    // Speakable — tells AI assistants which content to read aloud
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: [
        '[data-speakable="name"]',
        '[data-speakable="headline"]',
        '[data-speakable="bio"]',
        '[data-speakable="skills"]',
      ],
    },
  };

  // --- BreadcrumbList ---
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Profiles', item: `${BASE_URL}/u/` },
      { '@type': 'ListItem', position: 3, name: profile.full_name || username, item: profileUrl },
    ],
  };

  // --- Portfolio as ItemList of CreativeWork ---
  let portfolioLd: Record<string, unknown> | null = null;
  if (profile.portfolio?.length) {
    portfolioLd = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Portfolio by ${profile.full_name || username}`,
      numberOfItems: profile.portfolio.length,
      itemListElement: profile.portfolio.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'CreativeWork',
          name: item.title,
          ...(item.description && { description: item.description }),
          ...(item.image_url && { image: item.image_url }),
          ...(item.project_url && { url: item.project_url }),
          ...(item.tags?.length && { keywords: item.tags.join(', ') }),
          ...(item.client_name && { sourceOrganization: { '@type': 'Organization', name: item.client_name } }),
          creator: { '@id': `${profileUrl}#${isFreelancer ? 'person' : 'organization'}` },
        },
      })),
    };
  }

  return { profilePageLd, breadcrumbLd, portfolioLd };
}
