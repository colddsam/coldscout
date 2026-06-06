import { routeMetadata } from '@/lib/seo';
import JsonLd from '@/components/json-ld';
import { faqLd } from '@/lib/structured-data';
import Client from './client';

export const metadata = routeMetadata('/faq');
export const revalidate = 3600;

export default function Page() {
  return (
    <>
      <JsonLd blocks={faqLd()} />
      <Client />
    </>
  );
}
