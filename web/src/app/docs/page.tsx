import { routeMetadata } from '@/lib/seo';
import JsonLd from '@/components/json-ld';
import { docsLd } from '@/lib/structured-data';
import Client from './client';

export const metadata = routeMetadata('/docs');
export const revalidate = 3600;

export default function Page() {
  return (
    <>
      <JsonLd blocks={docsLd()} />
      <Client />
    </>
  );
}
