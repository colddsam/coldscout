import { routeMetadata } from '@/lib/seo';
import JsonLd from '@/components/json-ld';
import { simplePageLd } from '@/lib/structured-data';
import Client from './client';

export const metadata = routeMetadata('/refund-policy');
export const revalidate = 86400;

export default function Page() {
  return (
    <>
      <JsonLd
        blocks={simplePageLd({
          path: '/refund-policy',
          name: 'Refund Policy — Cold Scout',
          description:
            'Refund and cancellation policy for Cold Scout subscriptions — eligibility window, process, and exceptions.',
          crumbName: 'Refund Policy',
        })}
      />
      <Client />
    </>
  );
}
