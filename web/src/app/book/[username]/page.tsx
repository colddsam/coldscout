import type { Metadata } from 'next';
import { SITE } from '@front/lib/seo/site';
import { ogImageUrl } from '@/lib/seo';
import Client from './client';

export const revalidate = 1800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const canonical = `${SITE.url}/book/${username}`;
  const title = `Book a meeting with @${username} — Cold Scout`;
  const description = `Schedule a meeting with @${username}. Pick a time that works and get an instant confirmation.`;
  const ogImage = ogImageUrl({ title: `Book with @${username}`, subtitle: 'Pick a time — instant confirmation', kind: 'page', badge: 'BOOKING' });
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
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

export default function Page() {
  return <Client />;
}
