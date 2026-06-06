import type { Metadata } from 'next';
import { QueryClient, dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { SITE } from '@front/lib/seo/site';
import { ogImageUrl } from '@/lib/seo';
import { serverGet } from '@/lib/serverApi';
import JsonLd from '@/components/json-ld';
import {
  directoryDetailJsonLd,
  type DirectoryLeadDetail,
} from '@front/lib/seo/directory-schema';
import Client from './client';

export const revalidate = 3600;

interface LeadLite {
  business_name?: string | null;
  category?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

function leadEndpoint(slug: string) {
  return `/api/v1/directory/lead/${slug}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const canonical = `${SITE.url}/directory/lead/${slug}`;
  const lead = await serverGet<LeadLite>(leadEndpoint(slug), 3600);

  const name = lead?.business_name?.trim();
  const loc = [lead?.city, lead?.state].filter(Boolean).join(', ');
  const title = name
    ? `${name}${loc ? ` — ${loc}` : ''} | Digital Presence Audit`
    : 'Business Directory | Cold Scout';
  const description = name
    ? `Free digital presence audit for ${name}${loc ? ` in ${loc}` : ''}. Website quality, mobile responsiveness, social presence, and an AI-generated service-need score.`
    : 'Browse local business leads and run free digital presence audits with Cold Scout.';
  const ogImage = ogImageUrl({
    title: name || 'Business Directory',
    subtitle: name ? `${lead?.category ?? 'Local business'}${loc ? ` · ${loc}` : ''}` : 'Free digital presence audits',
    kind: 'page',
    badge: 'AUDIT',
  });

  return {
    title,
    description,
    alternates: { canonical, languages: { en: canonical, 'x-default': canonical } },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
    },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: SITE.name,
      title,
      description,
      locale: 'en_US',
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', site: SITE.twitterSite, title, description, images: [ogImage] },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const qc = new QueryClient();
  const lead = await serverGet<DirectoryLeadDetail>(leadEndpoint(slug), 3600);
  if (lead) qc.setQueryData(['directory-lead', slug], lead);

  // Server-render LocalBusiness + BreadcrumbList for this lead — the rich
  // local-business signal AI engines and Google rich results consume.
  const { breadcrumbLd, localBusinessLd } = directoryDetailJsonLd(slug, lead);
  const blocks = [
    { id: 'directory-detail-breadcrumb', data: breadcrumbLd },
    ...(localBusinessLd ? [{ id: 'directory-detail-business', data: localBusinessLd }] : []),
  ];

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <JsonLd blocks={blocks} />
      <Client />
    </HydrationBoundary>
  );
}
