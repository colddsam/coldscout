import { routeMetadata } from '@/lib/seo';
import JsonLd from '@/components/json-ld';
import { guidesIndexLd } from '@/lib/structured-data';
import Client from './client';

export const metadata = routeMetadata('/guides');
export const revalidate = 3600;

export default function Page() {
  return (
    <>
      <JsonLd blocks={guidesIndexLd()} />
      <Client />
    </>
  );
}
