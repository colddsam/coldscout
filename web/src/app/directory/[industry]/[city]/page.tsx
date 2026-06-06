import type { Metadata } from 'next';
import { QueryClient, dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { SITE } from '@front/lib/seo/site';
import { ogImageUrl } from '@/lib/seo';
import { serverGet } from '@/lib/serverApi';
import Client from './client';

export const revalidate = 3600;

function titleCase(s: string): string {
  return decodeURIComponent(s)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ industry: string; city: string }>;
}): Promise<Metadata> {
  const { industry, city } = await params;
  const ind = titleCase(industry);
  const cty = titleCase(city);
  const title = `${ind} Leads in ${cty} — Business Directory | Cold Scout`;
  const description = `Browse ${ind.toLowerCase()} businesses in ${cty} that may need digital services. Free digital presence audits, contact info, and AI-generated service-need scores.`;
  const canonical = `${SITE.url}/directory/${industry}/${city}`;
  const ogImage = ogImageUrl({
    title: `${ind} in ${cty}`,
    subtitle: `${ind} leads & free digital audits`,
    kind: 'page',
    badge: 'DIRECTORY',
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
  searchParams,
}: {
  params: Promise<{ industry: string; city: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { industry, city } = await params;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp?.page ?? '1', 10) || 1);

  // Prefetch the same query the client uses so the list body server-renders.
  const qc = new QueryClient();
  const data = await serverGet(
    `/api/v1/directory/${industry}/${city}?page=${page}&limit=20`,
    3600,
  );
  if (data) qc.setQueryData(['directory-list', industry, city, page, 20], data);

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <Client />
    </HydrationBoundary>
  );
}
