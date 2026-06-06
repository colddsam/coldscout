import { routeMetadata } from '@/lib/seo';
import JsonLd from '@/components/json-ld';
import { simplePageLd } from '@/lib/structured-data';
import Client from './client';

export const metadata = routeMetadata('/changelog');
export const revalidate = 3600;

export default function Page() {
  return (
    <>
      <JsonLd
        blocks={simplePageLd({
          path: '/changelog',
          name: 'Changelog — Cold Scout',
          description:
            'Release notes and product updates for Cold Scout — what shipped, when, and what is in flight.',
          crumbName: 'Changelog',
        })}
      />
      <Client />
    </>
  );
}
