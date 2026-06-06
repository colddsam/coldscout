import { routeMetadata } from '@/lib/seo';
import JsonLd from '@/components/json-ld';
import { simplePageLd } from '@/lib/structured-data';
import Client from './client';

export const metadata = routeMetadata('/privacy');
export const revalidate = 86400;

export default function Page() {
  return (
    <>
      <JsonLd
        blocks={simplePageLd({
          path: '/privacy',
          name: 'Privacy Policy — Cold Scout',
          description:
            'Privacy policy for Cold Scout — data handling, GDPR/CCPA rights, third-party services, retention, and contact for privacy requests.',
          crumbName: 'Privacy Policy',
        })}
      />
      <Client />
    </>
  );
}
