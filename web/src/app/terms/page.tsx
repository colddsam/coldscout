import { routeMetadata } from '@/lib/seo';
import JsonLd from '@/components/json-ld';
import { simplePageLd } from '@/lib/structured-data';
import Client from './client';

export const metadata = routeMetadata('/terms');
export const revalidate = 86400;

export default function Page() {
  return (
    <>
      <JsonLd
        blocks={simplePageLd({
          path: '/terms',
          name: 'Terms of Service — Cold Scout',
          description:
            'Terms of service for the Cold Scout AI lead generation platform — acceptable use, payments, refunds, IP, and dispute resolution.',
          crumbName: 'Terms of Service',
        })}
      />
      <Client />
    </>
  );
}
