import { routeMetadata } from '@/lib/seo';
import JsonLd from '@/components/json-ld';
import { pricingLd } from '@/lib/structured-data';
import Client from './client';

export const metadata = routeMetadata('/pricing');
export const revalidate = 3600;

export default function Page() {
  return (
    <>
      <JsonLd blocks={pricingLd()} />
      <Client />
    </>
  );
}
