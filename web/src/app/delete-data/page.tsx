import { routeMetadata } from '@/lib/seo';
import JsonLd from '@/components/json-ld';
import { simplePageLd } from '@/lib/structured-data';
import Client from './client';

export const metadata = routeMetadata('/delete-data');
export const revalidate = 86400;

export default function Page() {
  return (
    <>
      <JsonLd
        blocks={simplePageLd({
          path: '/delete-data',
          name: 'Data Deletion Request — Cold Scout',
          description:
            'Submit a GDPR/CCPA data deletion request for your Cold Scout account. We honor right-to-erasure within 30 days.',
          crumbName: 'Data Deletion',
        })}
      />
      <Client />
    </>
  );
}
