import { QueryClient, dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { routeMetadata } from '@/lib/seo';
import { serverGet } from '@/lib/serverApi';
import JsonLd from '@/components/json-ld';
import {
  directoryIndexJsonLd,
  type DirectoryLocation,
} from '@front/lib/seo/directory-schema';
import Client from './client';

export const metadata = routeMetadata('/directory');
export const revalidate = 3600;

export default async function Page() {
  // Prefetch the same query the client uses so the location grid server-renders
  // and the ItemList JSON-LD below reflects real data.
  const qc = new QueryClient();
  const data = await serverGet<{ locations?: DirectoryLocation[] }>(
    '/api/v1/directory/locations',
    3600,
  );
  if (data) qc.setQueryData(['directory-locations', undefined], data);

  const { breadcrumbLd, itemListLd } = directoryIndexJsonLd(data);
  const blocks = [
    { id: 'directory-breadcrumb', data: breadcrumbLd },
    ...(itemListLd ? [{ id: 'directory-locations', data: itemListLd }] : []),
  ];

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <JsonLd blocks={blocks} />
      <Client />
    </HydrationBoundary>
  );
}
