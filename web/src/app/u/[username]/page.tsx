import type { Metadata } from 'next';
import { QueryClient, dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { SITE } from '@front/lib/seo/site';
import { ogImageUrl } from '@/lib/seo';
import { serverGet } from '@/lib/serverApi';
import Client from './client';

export const revalidate = 1800;

interface ProfileLite {
  username?: string | null;
  full_name?: string | null;
  bio?: string | null;
  role?: string | null;
  profile_photo_url?: string | null;
  avatar_url?: string | null;
}

function profileEndpoint(username: string) {
  return `/api/v1/profile/u/${encodeURIComponent(username)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const canonical = `${SITE.url}/u/${username}`;
  const profile = await serverGet<ProfileLite>(profileEndpoint(username), 1800);

  const name = profile?.full_name?.trim() || `@${username}`;
  const title = `${name} (@${username}) — Cold Scout`;
  const description =
    profile?.bio?.trim() ||
    `${name}'s professional profile on Cold Scout — services, portfolio, and how to get in touch.`;
  // Prefer the real profile photo for the social card; otherwise a dynamic card.
  const image =
    profile?.profile_photo_url ||
    profile?.avatar_url ||
    ogImageUrl({ title: name, subtitle: profile?.role ?? 'Cold Scout profile', kind: 'profile' });

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
      type: 'profile',
      url: canonical,
      siteName: SITE.name,
      title,
      description,
      locale: 'en_US',
      images: [{ url: image, alt: name }],
    },
    twitter: { card: 'summary_large_image', site: SITE.twitterSite, title, description, images: [image] },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const qc = new QueryClient();
  const profile = await serverGet(profileEndpoint(username), 1800);
  if (profile) qc.setQueryData(['public-profile', username], profile);

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <Client />
    </HydrationBoundary>
  );
}
