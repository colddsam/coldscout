import type { Metadata } from 'next';
import { postMetadata, postSlugs } from '@/lib/seo';
import Client from './client';

export const revalidate = 3600;
// All blog slugs are known at build time; unknown slugs -> real 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return postSlugs('blog').map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return postMetadata('blog', slug);
}

export default function Page() {
  return <Client />;
}
