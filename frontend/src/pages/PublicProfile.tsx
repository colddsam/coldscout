/**
 * Public Profile Page — LinkedIn-style layout with comprehensive SEO & AEO.
 *
 * Card-based sections: Hero card (banner + avatar + info),
 * About, Professional/Business details, Skills, Portfolio.
 * Monochrome black & white theme with Framer Motion animations.
 *
 * SEO Features:
 *   - Rich JSON-LD: ProfilePage, Person/Organization, Occupation, CreativeWork, ItemList
 *   - og:profile meta tags (first_name, last_name, username, gender)
 *   - Semantic HTML5 (article, section, header, address, time, nav)
 *   - Proper heading hierarchy (h1 > h2 > h3)
 *   - BreadcrumbList + SpeakableSpecification for AEO
 *   - Noscript fallback with crawlable plain-text content
 *   - aria-labels for accessibility
 */
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  User, MapPin, Globe, Mail, Phone, Calendar, Briefcase, Building2,
  ExternalLink, ArrowLeft, Lock, Loader2, Award, GraduationCap,
  Languages, Clock, DollarSign, Users, Hash, BadgeCheck,
} from 'lucide-react';
import { getPublicProfile } from '../lib/api';
import type { PublicProfile } from '../lib/api';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';
import { buildOgImage } from '../lib/seo/og';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import {
  fadeInUp, staggerContainer, staggerItem, scaleIn, defaultViewport,
} from '../lib/motion';

const BASE_URL = 'https://coldscout.colddsam.com';

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function isoDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toISOString().split('T')[0];
}

const AVAILABILITY_MAP: Record<string, { label: string; dot: string; cls: string }> = {
  available: { label: 'Open to work', dot: 'bg-white', cls: 'bg-white/5 text-white border-white/20' },
  busy: { label: 'Busy', dot: 'bg-white/40', cls: 'bg-white/5 text-white/70 border-white/10' },
  not_available: { label: 'Not Available', dot: 'bg-white/20', cls: 'bg-white/5 text-white/50 border-white/10' },
  open_to_offers: { label: 'Open to offers', dot: 'bg-white/60', cls: 'bg-white/5 text-white/80 border-white/10' },
};

// ── Section Card wrapper ────────────────────────────────────────────────────

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={`bg-black rounded-xl border border-white/10 shadow-sm overflow-hidden ${className}`}
      variants={fadeInUp}
      initial="hidden"
      whileInView="visible"
      viewport={defaultViewport}
    >
      {children}
    </motion.div>
  );
}

// ── SEO Helpers ─────────────────────────────────────────────────────────────

/** Split "First Last" into parts. */
function splitName(name?: string | null): { first?: string; last?: string } {
  if (!name) return {};
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/** Extract twitter handle from a twitter/x URL. */
function twitterHandle(url?: string | null): string | undefined {
  if (!url) return undefined;
  const match = url.match(/(?:twitter\.com|x\.com)\/(@?[\w]+)/i);
  return match ? (match[1].startsWith('@') ? match[1] : `@${match[1]}`) : undefined;
}

/** Build keywords string from profile data. */
function buildKeywords(profile: PublicProfile, username: string): string {
  const kw: string[] = [];
  if (profile.full_name) kw.push(profile.full_name);
  if (profile.freelancer?.professional_title) kw.push(profile.freelancer.professional_title);
  if (profile.freelancer?.skills?.length) kw.push(...profile.freelancer.skills.slice(0, 10));
  if (profile.business?.company_name) kw.push(profile.business.company_name);
  if (profile.business?.industry) kw.push(profile.business.industry);
  if (profile.location) kw.push(profile.location);
  kw.push(username, 'Cold Scout', 'freelancer profile', 'professional profile');
  return [...new Set(kw.filter(Boolean))].join(', ');
}

/** Build a rich meta description (120-160 chars target). */
function buildDescription(profile: PublicProfile, displayName: string): string {
  const parts: string[] = [];

  if (profile.freelancer?.professional_title) {
    parts.push(`${displayName} is a ${profile.freelancer.professional_title}`);
    if (profile.location) parts[0] += ` based in ${profile.location}`;
    parts[0] += '.';
  } else if (profile.business?.company_name) {
    parts.push(`${profile.business.company_name}`);
    if (profile.business.industry) parts[0] += ` — ${profile.business.industry}`;
    parts[0] += '.';
  }

  if (profile.bio) {
    const bioClean = profile.bio.replace(/\n/g, ' ').trim();
    parts.push(bioClean);
  }

  if (profile.freelancer?.skills?.length) {
    parts.push(`Skills: ${profile.freelancer.skills.slice(0, 5).join(', ')}.`);
  }

  let desc = parts.join(' ');
  if (desc.length > 160) desc = desc.slice(0, 157) + '...';
  if (desc.length < 50) desc = `View ${displayName}'s professional profile on Cold Scout — AI-powered lead generation platform.`;
  return desc;
}

// ── JSON-LD Builders ────────────────────────────────────────────────────────

function buildAllJsonLd(profile: PublicProfile, username: string) {
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

// ── Main Component ──────────────────────────────────────────────────────────

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();

  const { data: profile, isLoading, isError, error } = useQuery({
    queryKey: ['public-profile', username],
    queryFn: () => getPublicProfile(username!),
    enabled: !!username,
    retry: false,
  });

  // Dynamic SEO
  const displayName = profile?.full_name || username || 'User';
  const headline = profile?.freelancer?.professional_title
    || (profile?.business?.company_name
      ? `${profile.business.company_name}${profile.business.industry ? ` · ${profile.business.industry}` : ''}`
      : null);
  const seoTitle = `${displayName}${headline ? ` — ${headline}` : ''} | Cold Scout`;
  const seoDesc = profile ? buildDescription(profile, displayName) : `View ${displayName}'s professional profile on Cold Scout — AI-powered lead generation platform.`;
  const { first, last } = splitName(profile?.full_name);
  const twitterUrl = profile?.freelancer?.twitter_url || profile?.business?.twitter_url;

  // OG image priority: actual profile photo (most personal) → dynamic Vercel
  // OG card with the freelancer's name + headline (per-share unique) → site
  // banner fallback. Avatar URLs from Supabase storage are absolute, so they
  // pass through unchanged; the buildOgImage call returns an absolute URL too.
  const dynamicOg = profile
    ? buildOgImage({
        title: displayName,
        subtitle: headline ?? 'Profile on Cold Scout',
        kind: 'profile',
        badge: profile.freelancer ? 'FREELANCER' : profile.business ? 'BUSINESS' : 'PROFILE',
      })
    : undefined;

  useSEO({
    title: seoTitle,
    description: seoDesc,
    canonical: username ? `${BASE_URL}/u/${username}` : undefined,
    ogImage: profile?.profile_photo_url || profile?.avatar_url || dynamicOg,
    ogType: 'profile',
    ogImageAlt: `${displayName}'s profile photo on Cold Scout`,
    index: !!profile,
    keywords: profile && username ? buildKeywords(profile, username) : undefined,
    profileMeta: profile ? {
      firstName: first,
      lastName: last,
      username: profile.username,
      gender: profile.gender || undefined,
    } : undefined,
    twitterCreator: twitterHandle(twitterUrl),
  });

  // Build JSON-LD schemas when profile is available
  const jsonLd = profile && username ? buildAllJsonLd(profile, username) : null;

  return (
    <>
      <PublicNavbar />
      {jsonLd && (
        <>
          <JsonLd data={jsonLd.breadcrumbLd} id="profile-breadcrumb" />
          <JsonLd data={jsonLd.profilePageLd} id="profile-page" />
          {jsonLd.portfolioLd && <JsonLd data={jsonLd.portfolioLd} id="profile-portfolio" />}
        </>
      )}

      <main className="min-h-screen bg-surface-2 pt-16 pb-12">
        {isLoading && (
          <div className="flex items-center justify-center h-96" role="status" aria-label="Loading profile">
            <Loader2 className="w-6 h-6 animate-spin text-white/70" />
          </div>
        )}

        {isError && (
          <motion.div
            className="max-w-2xl mx-auto px-6 py-24 text-center"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            role="alert"
          >
            <motion.div variants={scaleIn}>
              <Lock className="w-12 h-12 text-white/20 mx-auto mb-4" />
            </motion.div>
            <motion.h2 variants={staggerItem} className="text-xl font-bold text-white mb-2">
              {(error as Error)?.message?.includes('private') ? 'Private Profile' : 'Profile Not Found'}
            </motion.h2>
            <motion.p variants={staggerItem} className="text-sm text-white/60 mb-6">
              {(error as Error)?.message?.includes('private')
                ? 'This profile is set to private by the user.'
                : 'The profile you are looking for does not exist.'}
            </motion.p>
            <motion.div variants={staggerItem}>
              <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-white hover:underline">
                <ArrowLeft className="w-4 h-4" /> Back to Home
              </Link>
            </motion.div>
          </motion.div>
        )}

        {profile && <ProfileView profile={profile} />}

        {/* Noscript fallback — crawlable plain-text content for bots that don't execute JS */}
        {profile && (
          <noscript>
            <div style={{ maxWidth: 800, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
              <h1>{profile.full_name || profile.username}</h1>
              {profile.freelancer?.professional_title && <p><strong>{profile.freelancer.professional_title}</strong></p>}
              {profile.business?.company_name && <p><strong>{profile.business.company_name}</strong>{profile.business.industry ? ` — ${profile.business.industry}` : ''}</p>}
              {profile.location && <p>Location: {profile.location}</p>}
              {profile.bio && <p>{profile.bio}</p>}
              {profile.freelancer?.skills?.length ? <p>Skills: {profile.freelancer.skills.join(', ')}</p> : null}
              {profile.freelancer?.experience_years != null && <p>Experience: {profile.freelancer.experience_years} years</p>}
              {profile.freelancer?.languages?.length ? <p>Languages: {profile.freelancer.languages.join(', ')}</p> : null}
              {profile.freelancer?.certifications?.length ? <p>Certifications: {profile.freelancer.certifications.join(', ')}</p> : null}
              {profile.freelancer?.education && <p>Education: {profile.freelancer.education}</p>}
              {profile.email && <p>Email: <a href={`mailto:${profile.email}`}>{profile.email}</a></p>}
              {profile.phone && <p>Phone: {profile.phone}</p>}
              {profile.website && <p>Website: <a href={profile.website}>{profile.website}</a></p>}
              {profile.business?.company_description && <p>{profile.business.company_description}</p>}
              {profile.portfolio?.length ? (
                <>
                  <h2>Portfolio</h2>
                  <ul>
                    {profile.portfolio.map((item) => (
                      <li key={item.id}>
                        <strong>{item.title}</strong>
                        {item.description && <span> — {item.description}</span>}
                        {item.project_url && <span> (<a href={item.project_url}>View</a>)</span>}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <p><a href={`${BASE_URL}/`}>Cold Scout — AI Lead Generation Platform</a></p>
            </div>
          </noscript>
        )}
      </main>
      <PublicFooter />
    </>
  );
}

// ── Profile View ────────────────────────────────────────────────────────────

function ProfileView({ profile }: { profile: PublicProfile }) {
  const photoUrl = profile.profile_photo_url || profile.avatar_url;
  const hasFreelancer = !!profile.freelancer;
  const hasBusiness = !!profile.business;
  const headline = hasFreelancer
    ? profile.freelancer?.professional_title
    : hasBusiness
    ? `${profile.business?.company_name || ''}${profile.business?.industry ? ` · ${profile.business.industry}` : ''}`
    : null;

  const bookingUrl = profile.freelancer?.booking_url;

  // Build a set of verified field names for quick lookup
  const verifiedFields = new Set(
    (profile.verifications || [])
      .filter((v) => v.status === 'verified')
      .map((v) => v.field_name)
  );

  const contactLinks = [
    bookingUrl ? { href: `/book/${profile.username}`, icon: Calendar, label: 'Book a Meeting', field: 'booking_url' } : null,
    profile.email ? { href: `mailto:${profile.email}`, icon: Mail, label: profile.email, field: 'email' } : null,
    profile.phone ? { href: `tel:${profile.phone}`, icon: Phone, label: profile.phone, field: 'phone' } : null,
    profile.website ? { href: profile.website, icon: Globe, label: 'Website', external: true, field: 'website' } : null,
  ].filter(Boolean) as { href: string; icon: React.ElementType; label: string; external?: boolean; field?: string }[];

  return (
    <article
      className="max-w-4xl mx-auto px-4 sm:px-6 space-y-4"
      itemScope
      itemType={hasFreelancer ? 'https://schema.org/Person' : hasBusiness ? 'https://schema.org/Organization' : 'https://schema.org/Person'}
      aria-label={`Profile of ${profile.full_name || profile.username}`}
    >

      {/* ── Hero Card: Banner + Avatar + Info ── */}
      <SectionCard>
        <header>
          {/* Banner */}
          <motion.div
            className="h-44 sm:h-56 bg-gradient-to-br from-gray-900 via-gray-800 to-black relative"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {profile.banner_url ? (
              <img
                src={profile.banner_url}
                alt={`${profile.full_name || profile.username}'s cover photo`}
                className="w-full h-full object-cover"
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.05),transparent_70%)]" />
            )}
          </motion.div>

          {/* Profile info area */}
          <div className="px-6 pb-6">
            {/* Avatar — overlapping banner */}
            <motion.div
              className="-mt-16 sm:-mt-20 mb-4"
              variants={scaleIn}
              initial="hidden"
              animate="visible"
            >
              <div className="relative w-32 h-32 sm:w-40 sm:h-40">
                <div className="w-full h-full rounded-full border-4 border-white bg-black shadow-md overflow-hidden">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={`${profile.full_name || profile.username} — profile photo`}
                      className="w-full h-full object-cover"
                      itemProp="image"
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-white/5 text-white/20">
                      <User className="w-16 h-16" />
                    </div>
                  )}
                </div>

                {/* Availability badge — anchored to avatar bottom-center like LinkedIn */}
                {hasFreelancer && profile.freelancer?.availability && (
                  <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1 rounded-full text-[11px] font-semibold border shadow-sm ${AVAILABILITY_MAP[profile.freelancer.availability]?.cls || 'bg-white/5 text-white/70'}`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${profile.freelancer.availability === 'available' ? 'animate-pulse' : ''} ${AVAILABILITY_MAP[profile.freelancer.availability]?.dot || 'bg-gray-400'}`} />
                    {AVAILABILITY_MAP[profile.freelancer.availability]?.label || profile.freelancer.availability}
                  </div>
                )}
              </div>
            </motion.div>

            {/* Name + headline + meta */}
            <motion.div variants={staggerContainer} initial="hidden" animate="visible">
              <motion.div variants={staggerItem}>
                <h1
                  className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-2"
                  data-speakable="name"
                  itemProp="name"
                >
                  {profile.full_name || profile.username}
                  {profile.verifications && profile.verifications.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-white" title={`${profile.verifications.length} verified field${profile.verifications.length > 1 ? 's' : ''}`}>
                      <BadgeCheck className="w-6 h-6" />
                    </span>
                  )}
                </h1>
                {headline && (
                  <p
                    className="text-base text-white/80 mt-0.5"
                    data-speakable="headline"
                    itemProp="jobTitle"
                  >
                    {headline}
                  </p>
                )}
                <p className="text-sm text-white/60 mt-0.5">@{profile.username}</p>
              </motion.div>

              {/* Location + Joined + Role + Verification badge row */}
              <motion.div variants={staggerItem} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-sm text-white/60">
                {profile.location && (
                  <span className="flex items-center gap-1" itemProp="address" itemScope itemType="https://schema.org/PostalAddress">
                    <MapPin className="w-3.5 h-3.5" /><span itemProp="addressLocality">{profile.location}</span>
                  </span>
                )}
                {profile.member_since && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Joined <time dateTime={isoDate(profile.member_since)}>{formatDate(profile.member_since)}</time>
                  </span>
                )}
                {profile.role && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/5 text-xs font-medium text-white/80">
                    {profile.role === 'freelancer' ? <Briefcase className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                    {profile.role === 'freelancer' ? 'Freelancer' : 'Business'}
                  </span>
                )}
                {profile.verifications && profile.verifications.length >= 3 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/5 text-xs font-medium text-white border border-white/20">
                    <BadgeCheck className="w-3 h-3" /> Verified Profile
                  </span>
                )}
              </motion.div>

              {/* Action buttons — LinkedIn style */}
              {contactLinks.length > 0 && (
                <motion.nav variants={staggerItem} className="flex flex-wrap gap-2 mt-5" aria-label="Contact actions">
                  {contactLinks.map((link, i) => {
                    const Icon = link.icon;
                    return (
                      <motion.a
                        key={link.label}
                        href={link.href}
                        {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                          i === 0
                            ? 'bg-black text-white hover:bg-gray-800'
                            : 'border border-white/20 text-white/80 hover:bg-surface-2 hover:border-gray-400'
                        }`}
                        {...(link.field === 'email' ? { itemProp: 'email' } : {})}
                        {...(link.field === 'phone' ? { itemProp: 'telephone' } : {})}
                        {...(link.field === 'website' ? { itemProp: 'url' } : {})}
                      >
                        <Icon className="w-4 h-4" />
                        {i === 0 && link.icon === Mail ? 'Contact' : link.label}
                        {link.field && verifiedFields.has(link.field) && (
                          <BadgeCheck className="w-3.5 h-3.5 text-white shrink-0" />
                        )}
                      </motion.a>
                    );
                  })}
                </motion.nav>
              )}
            </motion.div>
          </div>
        </header>
      </SectionCard>

      {/* ── About Card ── */}
      {profile.bio && (
        <SectionCard>
          <section className="p-6" aria-labelledby="about-heading">
            <h2 id="about-heading" className="text-lg font-bold text-white mb-3">About</h2>
            <p
              className="text-sm text-white/80 leading-relaxed whitespace-pre-line"
              data-speakable="bio"
              itemProp="description"
            >
              {profile.bio}
            </p>
          </section>
        </SectionCard>
      )}

      {/* ── Freelancer Details Card ── */}
      {hasFreelancer && <FreelancerCard data={profile.freelancer!} verifiedFields={verifiedFields} />}

      {/* ── Business Details Card ── */}
      {hasBusiness && <BusinessCard data={profile.business!} verifiedFields={verifiedFields} />}

      {/* ── Portfolio Card ── */}
      {profile.portfolio && profile.portfolio.length > 0 && (
        <PortfolioCard items={profile.portfolio} />
      )}
    </article>
  );
}

// ── Freelancer Card ─────────────────────────────────────────────────────────

function FreelancerCard({ data, verifiedFields }: { data: NonNullable<PublicProfile['freelancer']>; verifiedFields: Set<string> }) {
  const stats = [
    data.experience_years != null ? { icon: Clock, label: 'Experience', value: `${data.experience_years} years` } : null,
    data.hourly_rate ? { icon: DollarSign, label: 'Rate', value: data.hourly_rate } : null,
  ].filter(Boolean) as { icon: React.ElementType; label: string; value: string }[];

  const socialLinks = [
    { url: data.linkedin_url, label: 'LinkedIn', field: 'linkedin_url' },
    { url: data.github_url, label: 'GitHub', field: 'github_url' },
    { url: data.twitter_url, label: 'Twitter', field: 'twitter_url' },
    { url: data.dribbble_url, label: 'Dribbble', field: 'dribbble_url' },
    { url: data.behance_url, label: 'Behance', field: 'behance_url' },
    { url: data.personal_website, label: 'Website', field: 'personal_website' },
  ].filter((l) => l.url) as { url: string; label: string; field: string }[];

  return (
    <>
      {/* Stats + Details */}
      {(stats.length > 0 || data.education || data.languages?.length) && (
        <SectionCard>
          <section className="p-6" aria-labelledby="professional-heading">
            <h2 id="professional-heading" className="text-lg font-bold text-white mb-4">Professional Details</h2>

            {/* Quick stats row */}
            {stats.length > 0 && (
              <motion.div
                className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5"
                variants={staggerContainer}
                initial="hidden"
                whileInView="visible"
                viewport={defaultViewport}
              >
                {stats.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <motion.div
                      key={stat.label}
                      variants={staggerItem}
                      className="flex items-center gap-3 p-3 rounded-lg bg-surface-2 border border-white/[0.08]"
                    >
                      <div className="w-9 h-9 rounded-lg bg-black flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-white/60">{stat.label}</p>
                        <p className="text-sm font-semibold text-white">{stat.value}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* Education */}
            {data.education && (
              <div className="flex items-start gap-3 py-3 border-t border-white/[0.08]">
                <GraduationCap className="w-5 h-5 text-white/70 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-xs text-white/60 font-medium uppercase tracking-wider">Education</h3>
                  <p className="text-sm text-white/80 mt-1 whitespace-pre-line">{data.education}</p>
                </div>
              </div>
            )}

            {/* Languages */}
            {data.languages && data.languages.length > 0 && (
              <div className="flex items-start gap-3 py-3 border-t border-white/[0.08]">
                <Languages className="w-5 h-5 text-white/70 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-xs text-white/60 font-medium uppercase tracking-wider">Languages</h3>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {data.languages.map((l) => (
                      <span key={l} className="px-2.5 py-1 rounded-full bg-white/5 text-xs font-medium text-white/80">{l}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Certifications */}
            {data.certifications && data.certifications.length > 0 && (
              <div className="flex items-start gap-3 py-3 border-t border-white/[0.08]">
                <Award className="w-5 h-5 text-white/70 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-xs text-white/60 font-medium uppercase tracking-wider">Certifications</h3>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {data.certifications.map((c) => (
                      <span key={c} className="px-2.5 py-1 rounded-full bg-white/5 text-xs font-medium text-white">{c}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        </SectionCard>
      )}

      {/* Skills */}
      {data.skills && data.skills.length > 0 && (
        <SectionCard>
          <section className="p-6" aria-labelledby="skills-heading">
            <h2 id="skills-heading" className="text-lg font-bold text-white mb-4">Skills</h2>
            <motion.ul
              className="flex flex-wrap gap-2 list-none p-0 m-0"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={defaultViewport}
              data-speakable="skills"
              aria-label="Professional skills"
            >
              {data.skills.map((s) => (
                <motion.li
                  key={s}
                  variants={staggerItem}
                  whileHover={{ scale: 1.05, backgroundColor: '#000', color: '#fff' }}
                  className="px-3 py-1.5 rounded-full bg-white/5 text-sm font-medium text-white cursor-default transition-colors border border-transparent hover:border-white/30"
                  itemProp="knowsAbout"
                >
                  {s}
                </motion.li>
              ))}
            </motion.ul>
          </section>
        </SectionCard>
      )}

      {/* Social / Links */}
      {socialLinks.length > 0 && (
        <SectionCard>
          <section className="p-6" aria-labelledby="links-heading">
            <h2 id="links-heading" className="text-lg font-bold text-white mb-4">Links</h2>
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={defaultViewport}
            >
              {socialLinks.map((l) => (
                <motion.a
                  key={l.label}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  variants={staggerItem}
                  whileHover={{ x: 2 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg border border-white/[0.08] hover:border-white/20 hover:bg-surface-2 transition-colors group"
                  itemProp="sameAs"
                >
                  <ExternalLink className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white flex items-center gap-1.5">
                      {l.label}
                      {verifiedFields.has(l.field) && <BadgeCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                    </p>
                    <p className="text-xs text-white/60 truncate">{l.url}</p>
                  </div>
                </motion.a>
              ))}
            </motion.div>
          </section>
        </SectionCard>
      )}
    </>
  );
}

// ── Business Card ───────────────────────────────────────────────────────────

function BusinessCard({ data, verifiedFields }: { data: NonNullable<PublicProfile['business']>; verifiedFields: Set<string> }) {
  const infoItems = [
    data.industry ? { icon: Hash, label: 'Industry', value: data.industry } : null,
    data.company_size ? { icon: Users, label: 'Company Size', value: `${data.company_size} employees` } : null,
    data.founded_year ? { icon: Calendar, label: 'Founded', value: String(data.founded_year) } : null,
    (data.city || data.state || data.country) ? {
      icon: MapPin,
      label: 'Location',
      value: [data.city, data.state, data.country].filter(Boolean).join(', '),
    } : null,
  ].filter(Boolean) as { icon: React.ElementType; label: string; value: string }[];

  const socialLinks = [
    { url: data.linkedin_url, label: 'LinkedIn', field: 'biz_linkedin_url' },
    { url: data.twitter_url, label: 'Twitter', field: 'biz_twitter_url' },
    { url: data.facebook_url, label: 'Facebook', field: 'biz_facebook_url' },
    { url: data.instagram_url, label: 'Instagram', field: 'biz_instagram_url' },
    { url: data.company_website, label: 'Website', field: 'company_website' },
  ].filter((l) => l.url) as { url: string; label: string; field: string }[];

  return (
    <SectionCard>
      <section className="p-6" aria-labelledby="business-heading">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 id="business-heading" className="text-lg font-bold text-white">
              {data.company_name || 'Business Details'}
            </h2>
            {data.brand_name && data.brand_name !== data.company_name && (
              <p className="text-sm text-white/60 mt-0.5">{data.brand_name}</p>
            )}
          </div>
          {data.company_logo_url && (
            <img
              src={data.company_logo_url}
              alt={`${data.company_name || 'Company'} logo`}
              className="w-12 h-12 rounded-lg object-cover border border-white/10"
              loading="lazy"
              decoding="async"
            />
          )}
        </div>

        {data.company_description && (
          <p className="text-sm text-white/80 leading-relaxed mb-5 whitespace-pre-line">{data.company_description}</p>
        )}

        {/* Info grid */}
        {infoItems.length > 0 && (
          <motion.div
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={defaultViewport}
          >
            {infoItems.map((item) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.label}
                  variants={staggerItem}
                  className="p-3 rounded-lg bg-surface-2 border border-white/[0.08] text-center"
                >
                  <Icon className="w-4 h-4 text-white/70 mx-auto mb-1.5" />
                  <p className="text-xs text-white/60">{item.label}</p>
                  <p className="text-sm font-semibold text-white mt-0.5">{item.value}</p>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Social */}
        {socialLinks.length > 0 && (
          <nav className="flex flex-wrap gap-2 pt-4 border-t border-white/[0.08]" aria-label="Business social links">
            {socialLinks.map((l) => (
              <motion.a
                key={l.label}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 text-xs font-medium text-white/60 hover:text-white hover:border-white/30 transition-colors"
                itemProp="sameAs"
              >
                <ExternalLink className="w-3 h-3" /> {l.label}
                {verifiedFields.has(l.field) && <BadgeCheck className="w-3 h-3 text-blue-500" />}
              </motion.a>
            ))}
          </nav>
        )}
      </section>
    </SectionCard>
  );
}

// ── Portfolio Card ──────────────────────────────────────────────────────────

function PortfolioCard({ items }: { items: NonNullable<PublicProfile['portfolio']> }) {
  return (
    <SectionCard>
      <section className="p-6" aria-labelledby="portfolio-heading">
        <h2 id="portfolio-heading" className="text-lg font-bold text-white mb-4">Portfolio</h2>
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={defaultViewport}
        >
          {items.map((item) => (
            <motion.div
              key={item.id}
              variants={staggerItem}
              whileHover={{ y: -3 }}
              className="rounded-lg border border-white/10 overflow-hidden group hover:shadow-md transition-shadow"
              itemScope
              itemType="https://schema.org/CreativeWork"
            >
              {item.image_url && (
                <div className="overflow-hidden h-40">
                  <img
                    src={item.image_url}
                    alt={`${item.title} — portfolio project`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    itemProp="image"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white" itemProp="name">{item.title}</h3>
                    {item.client_name && <p className="text-xs text-white/60 mt-0.5">for <span itemProp="sourceOrganization">{item.client_name}</span></p>}
                  </div>
                  {item.project_url && (
                    <a href={item.project_url} target="_blank" rel="noopener noreferrer"
                      className="flex-shrink-0 p-1.5 rounded-md text-white/70 hover:text-white hover:bg-white/10/5 transition-colors"
                      itemProp="url"
                      aria-label={`View ${item.title} project`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                {item.description && <p className="text-xs text-white/70 mt-2 line-clamp-2" itemProp="description">{item.description}</p>}
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {item.tags.map((t) => (
                      <span key={t} className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] font-medium text-white/70" itemProp="keywords">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </SectionCard>
  );
}
