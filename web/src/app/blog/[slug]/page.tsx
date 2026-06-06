import type { Metadata } from 'next';
import { postMetadata, postSlugs } from '@/lib/seo';
import JsonLd from '@/components/json-ld';
import { postLd } from '@/lib/structured-data';
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

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <>
      <JsonLd blocks={postLd('blog', slug)} />
      <Client />
    </>
  );
}
