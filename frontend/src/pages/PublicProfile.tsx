/**
 * Public Profile Page — LinkedIn-style layout.
 *
 * Card-based sections: Hero card (banner + avatar + info),
 * About, Professional/Business details, Skills, Portfolio.
 * Monochrome black & white theme with Framer Motion animations.
 */
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  User, MapPin, Globe, Mail, Phone, Calendar, Briefcase, Building2,
  ExternalLink, ArrowLeft, Lock, Loader2, Award, GraduationCap,
  Languages, Clock, DollarSign, Users, Hash,
} from 'lucide-react';
import { getPublicProfile } from '../lib/api';
import type { PublicProfile } from '../lib/api';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import {
  fadeInUp, staggerContainer, staggerItem, scaleIn, defaultViewport,
} from '../lib/motion';

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const AVAILABILITY_MAP: Record<string, { label: string; dot: string; cls: string }> = {
  available: { label: 'Open to work', dot: 'bg-green-500', cls: 'bg-green-50 text-green-700 border-green-200' },
  busy: { label: 'Busy', dot: 'bg-amber-500', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  not_available: { label: 'Not Available', dot: 'bg-red-500', cls: 'bg-red-50 text-red-600 border-red-200' },
  open_to_offers: { label: 'Open to offers', dot: 'bg-blue-500', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
};

// ── Section Card wrapper ────────────────────────────────────────────────────

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${className}`}
      variants={fadeInUp}
      initial="hidden"
      whileInView="visible"
      viewport={defaultViewport}
    >
      {children}
    </motion.div>
  );
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

  // Dynamic SEO — uses profile data when available, falls back to generic
  const displayName = profile?.full_name || username || 'User';
  const headline = profile?.freelancer?.professional_title
    || (profile?.business?.company_name
      ? `${profile.business.company_name}${profile.business.industry ? ` · ${profile.business.industry}` : ''}`
      : null);
  const seoTitle = `${displayName}${headline ? ` — ${headline}` : ''} | Cold Scout`;
  const seoDesc = profile?.bio
    ? `${profile.bio.slice(0, 140)}${profile.bio.length > 140 ? '…' : ''}`
    : `View ${displayName}'s professional profile on Cold Scout — AI-powered lead generation platform.`;

  useSEO({
    title: seoTitle,
    description: seoDesc,
    canonical: username ? `https://coldscout.colddsam.com/u/${username}` : undefined,
    ogImage: profile?.profile_photo_url || profile?.avatar_url || undefined,
    ogType: 'profile',
    ogImageAlt: `${displayName}'s profile photo`,
    index: !!profile, // only index if profile is public and loaded
    keywords: [
      displayName,
      profile?.freelancer?.professional_title,
      profile?.business?.company_name,
      profile?.business?.industry,
      'Cold Scout',
      'freelancer profile',
      'lead generation',
    ].filter(Boolean).join(', '),
  });

  // Build JSON-LD schemas when profile is available
  const profileLd = profile ? buildProfileJsonLd(profile, username!) : null;
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://coldscout.colddsam.com/' },
      { '@type': 'ListItem', position: 2, name: displayName, item: `https://coldscout.colddsam.com/u/${username}` },
    ],
  };

  return (
    <>
      <PublicNavbar />
      <JsonLd data={breadcrumbLd} id="profile-breadcrumb" />
      {profileLd && <JsonLd data={profileLd} id="profile-person" />}
      <main className="min-h-screen bg-gray-50 pt-16 pb-12">
        {isLoading && (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {isError && (
          <motion.div
            className="max-w-2xl mx-auto px-6 py-24 text-center"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={scaleIn}>
              <Lock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            </motion.div>
            <motion.h2 variants={staggerItem} className="text-xl font-bold text-black mb-2">
              {(error as Error)?.message?.includes('private') ? 'Private Profile' : 'Profile Not Found'}
            </motion.h2>
            <motion.p variants={staggerItem} className="text-sm text-secondary mb-6">
              {(error as Error)?.message?.includes('private')
                ? 'This profile is set to private by the user.'
                : 'The profile you are looking for does not exist.'}
            </motion.p>
            <motion.div variants={staggerItem}>
              <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-black hover:underline">
                <ArrowLeft className="w-4 h-4" /> Back to Home
              </Link>
            </motion.div>
          </motion.div>
        )}

        {profile && <ProfileView profile={profile} />}
      </main>
      <PublicFooter />
    </>
  );
}

/** Build Person or Organization JSON-LD from profile data. */
function buildProfileJsonLd(profile: PublicProfile, username: string) {
  const isFreelancer = !!profile.freelancer;
  const photoUrl = profile.profile_photo_url || profile.avatar_url;

  if (isFreelancer) {
    const f = profile.freelancer!;
    const sameAs = [f.linkedin_url, f.github_url, f.twitter_url, f.dribbble_url, f.behance_url, f.personal_website].filter(Boolean);
    return {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: profile.full_name || username,
      url: `https://coldscout.colddsam.com/u/${username}`,
      ...(photoUrl && { image: photoUrl }),
      ...(profile.bio && { description: profile.bio }),
      ...(f.professional_title && { jobTitle: f.professional_title }),
      ...(profile.location && { address: { '@type': 'PostalAddress', addressLocality: profile.location } }),
      ...(profile.email && { email: profile.email }),
      ...(f.skills?.length && { knowsAbout: f.skills }),
      ...(f.languages?.length && { knowsLanguage: f.languages }),
      ...(sameAs.length && { sameAs }),
    };
  }

  if (profile.business) {
    const b = profile.business;
    const sameAs = [b.linkedin_url, b.twitter_url, b.facebook_url, b.instagram_url, b.company_website].filter(Boolean);
    return {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: b.company_name || profile.full_name || username,
      url: `https://coldscout.colddsam.com/u/${username}`,
      ...(b.company_logo_url && { logo: b.company_logo_url }),
      ...(photoUrl && { image: photoUrl }),
      ...(b.company_description && { description: b.company_description }),
      ...(b.industry && { industry: b.industry }),
      ...(b.founded_year && { foundingDate: String(b.founded_year) }),
      ...((b.city || b.state || b.country) && {
        address: {
          '@type': 'PostalAddress',
          ...(b.city && { addressLocality: b.city }),
          ...(b.state && { addressRegion: b.state }),
          ...(b.country && { addressCountry: b.country }),
        },
      }),
      ...(sameAs.length && { sameAs }),
    };
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      name: profile.full_name || username,
      url: `https://coldscout.colddsam.com/u/${username}`,
      ...(photoUrl && { image: photoUrl }),
      ...(profile.bio && { description: profile.bio }),
    },
  };
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

  const contactLinks = [
    profile.email ? { href: `mailto:${profile.email}`, icon: Mail, label: profile.email } : null,
    profile.phone ? { href: `tel:${profile.phone}`, icon: Phone, label: profile.phone } : null,
    profile.website ? { href: profile.website, icon: Globe, label: 'Website', external: true } : null,
  ].filter(Boolean) as { href: string; icon: React.ElementType; label: string; external?: boolean }[];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-4">

      {/* ── Hero Card: Banner + Avatar + Info ── */}
      <SectionCard>
        {/* Banner */}
        <motion.div
          className="h-44 sm:h-56 bg-gradient-to-br from-gray-900 via-gray-800 to-black relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {profile.banner_url ? (
            <img src={profile.banner_url} alt="Banner" className="w-full h-full object-cover" />
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
              <div className="w-full h-full rounded-full border-4 border-white bg-white shadow-md overflow-hidden">
                {photoUrl ? (
                  <img src={photoUrl} alt={profile.full_name || profile.username} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-300">
                    <User className="w-16 h-16" />
                  </div>
                )}
              </div>

              {/* Availability badge — anchored to avatar bottom-center like LinkedIn */}
              {hasFreelancer && profile.freelancer?.availability && (
                <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1 rounded-full text-[11px] font-semibold border shadow-sm ${AVAILABILITY_MAP[profile.freelancer.availability]?.cls || 'bg-gray-100 text-gray-600'}`}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${profile.freelancer.availability === 'available' ? 'animate-pulse' : ''} ${AVAILABILITY_MAP[profile.freelancer.availability]?.dot || 'bg-gray-400'}`} />
                  {AVAILABILITY_MAP[profile.freelancer.availability]?.label || profile.freelancer.availability}
                </div>
              )}
            </div>
          </motion.div>

          {/* Name + headline + meta */}
          <motion.div variants={staggerContainer} initial="hidden" animate="visible">
            <motion.div variants={staggerItem}>
              <h1 className="text-2xl sm:text-3xl font-bold text-black tracking-tight">
                {profile.full_name || profile.username}
              </h1>
              {headline && (
                <p className="text-base text-gray-700 mt-0.5">{headline}</p>
              )}
              <p className="text-sm text-secondary mt-0.5">@{profile.username}</p>
            </motion.div>

            {/* Location + Joined + Role badge row */}
            <motion.div variants={staggerItem} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-sm text-secondary">
              {profile.location && (
                <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{profile.location}</span>
              )}
              {profile.member_since && (
                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Joined {formatDate(profile.member_since)}</span>
              )}
              {profile.role && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                  {profile.role === 'freelancer' ? <Briefcase className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                  {profile.role === 'freelancer' ? 'Freelancer' : 'Business'}
                </span>
              )}
            </motion.div>

            {/* Action buttons — LinkedIn style */}
            {contactLinks.length > 0 && (
              <motion.div variants={staggerItem} className="flex flex-wrap gap-2 mt-5">
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
                          : 'border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {i === 0 && link.icon === Mail ? 'Contact' : link.label}
                    </motion.a>
                  );
                })}
              </motion.div>
            )}
          </motion.div>
        </div>
      </SectionCard>

      {/* ── About Card ── */}
      {profile.bio && (
        <SectionCard>
          <div className="p-6">
            <h2 className="text-lg font-bold text-black mb-3">About</h2>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{profile.bio}</p>
          </div>
        </SectionCard>
      )}

      {/* ── Freelancer Details Card ── */}
      {hasFreelancer && <FreelancerCard data={profile.freelancer!} />}

      {/* ── Business Details Card ── */}
      {hasBusiness && <BusinessCard data={profile.business!} />}

      {/* ── Portfolio Card ── */}
      {profile.portfolio && profile.portfolio.length > 0 && (
        <PortfolioCard items={profile.portfolio} />
      )}
    </div>
  );
}

// ── Freelancer Card ─────────────────────────────────────────────────────────

function FreelancerCard({ data }: { data: NonNullable<PublicProfile['freelancer']> }) {
  const stats = [
    data.experience_years != null ? { icon: Clock, label: 'Experience', value: `${data.experience_years} years` } : null,
    data.hourly_rate ? { icon: DollarSign, label: 'Rate', value: data.hourly_rate } : null,
  ].filter(Boolean) as { icon: React.ElementType; label: string; value: string }[];

  const socialLinks = [
    { url: data.linkedin_url, label: 'LinkedIn' },
    { url: data.github_url, label: 'GitHub' },
    { url: data.twitter_url, label: 'Twitter' },
    { url: data.dribbble_url, label: 'Dribbble' },
    { url: data.behance_url, label: 'Behance' },
    { url: data.personal_website, label: 'Website' },
  ].filter((l) => l.url) as { url: string; label: string }[];

  return (
    <>
      {/* Stats + Details */}
      {(stats.length > 0 || data.education || data.languages?.length) && (
        <SectionCard>
          <div className="p-6">
            <h2 className="text-lg font-bold text-black mb-4">Professional Details</h2>

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
                      className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100"
                    >
                      <div className="w-9 h-9 rounded-lg bg-black flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-secondary">{stat.label}</p>
                        <p className="text-sm font-semibold text-black">{stat.value}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* Education */}
            {data.education && (
              <div className="flex items-start gap-3 py-3 border-t border-gray-100">
                <GraduationCap className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-secondary font-medium uppercase tracking-wider">Education</p>
                  <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{data.education}</p>
                </div>
              </div>
            )}

            {/* Languages */}
            {data.languages && data.languages.length > 0 && (
              <div className="flex items-start gap-3 py-3 border-t border-gray-100">
                <Languages className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-secondary font-medium uppercase tracking-wider">Languages</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {data.languages.map((l) => (
                      <span key={l} className="px-2.5 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-700">{l}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Certifications */}
            {data.certifications && data.certifications.length > 0 && (
              <div className="flex items-start gap-3 py-3 border-t border-gray-100">
                <Award className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-secondary font-medium uppercase tracking-wider">Certifications</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {data.certifications.map((c) => (
                      <span key={c} className="px-2.5 py-1 rounded-full bg-gray-100 text-xs font-medium text-black">{c}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* Skills */}
      {data.skills && data.skills.length > 0 && (
        <SectionCard>
          <div className="p-6">
            <h2 className="text-lg font-bold text-black mb-4">Skills</h2>
            <motion.div
              className="flex flex-wrap gap-2"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={defaultViewport}
            >
              {data.skills.map((s) => (
                <motion.span
                  key={s}
                  variants={staggerItem}
                  whileHover={{ scale: 1.05, backgroundColor: '#000', color: '#fff' }}
                  className="px-3 py-1.5 rounded-full bg-gray-100 text-sm font-medium text-black cursor-default transition-colors border border-transparent hover:border-black"
                >
                  {s}
                </motion.span>
              ))}
            </motion.div>
          </div>
        </SectionCard>
      )}

      {/* Social / Links */}
      {socialLinks.length > 0 && (
        <SectionCard>
          <div className="p-6">
            <h2 className="text-lg font-bold text-black mb-4">Links</h2>
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
                  className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-colors group"
                >
                  <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-black transition-colors" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-black">{l.label}</p>
                    <p className="text-xs text-secondary truncate">{l.url}</p>
                  </div>
                </motion.a>
              ))}
            </motion.div>
          </div>
        </SectionCard>
      )}
    </>
  );
}

// ── Business Card ───────────────────────────────────────────────────────────

function BusinessCard({ data }: { data: NonNullable<PublicProfile['business']> }) {
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
    { url: data.linkedin_url, label: 'LinkedIn' },
    { url: data.twitter_url, label: 'Twitter' },
    { url: data.facebook_url, label: 'Facebook' },
    { url: data.instagram_url, label: 'Instagram' },
    { url: data.company_website, label: 'Website' },
  ].filter((l) => l.url) as { url: string; label: string }[];

  return (
    <SectionCard>
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-black">
              {data.company_name || 'Business Details'}
            </h2>
            {data.brand_name && data.brand_name !== data.company_name && (
              <p className="text-sm text-secondary mt-0.5">{data.brand_name}</p>
            )}
          </div>
          {data.company_logo_url && (
            <img src={data.company_logo_url} alt="Logo" className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
          )}
        </div>

        {data.company_description && (
          <p className="text-sm text-gray-700 leading-relaxed mb-5 whitespace-pre-line">{data.company_description}</p>
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
                  className="p-3 rounded-lg bg-gray-50 border border-gray-100 text-center"
                >
                  <Icon className="w-4 h-4 text-gray-400 mx-auto mb-1.5" />
                  <p className="text-xs text-secondary">{item.label}</p>
                  <p className="text-sm font-semibold text-black mt-0.5">{item.value}</p>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Social */}
        {socialLinks.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
            {socialLinks.map((l) => (
              <motion.a
                key={l.label}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 text-xs font-medium text-secondary hover:text-black hover:border-black transition-colors"
              >
                <ExternalLink className="w-3 h-3" /> {l.label}
              </motion.a>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ── Portfolio Card ──────────────────────────────────────────────────────────

function PortfolioCard({ items }: { items: NonNullable<PublicProfile['portfolio']> }) {
  return (
    <SectionCard>
      <div className="p-6">
        <h2 className="text-lg font-bold text-black mb-4">Portfolio</h2>
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
              className="rounded-lg border border-gray-200 overflow-hidden group hover:shadow-md transition-shadow"
            >
              {item.image_url && (
                <div className="overflow-hidden h-40">
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-black">{item.title}</h3>
                    {item.client_name && <p className="text-xs text-secondary mt-0.5">for {item.client_name}</p>}
                  </div>
                  {item.project_url && (
                    <a href={item.project_url} target="_blank" rel="noopener noreferrer"
                      className="flex-shrink-0 p-1.5 rounded-md text-gray-400 hover:text-black hover:bg-gray-100 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                {item.description && <p className="text-xs text-gray-600 mt-2 line-clamp-2">{item.description}</p>}
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {item.tags.map((t) => (
                      <span key={t} className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-medium text-gray-600">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </SectionCard>
  );
}
