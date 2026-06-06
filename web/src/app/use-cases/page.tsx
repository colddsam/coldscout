import { routeMetadata } from '@/lib/seo';
import JsonLd from '@/components/json-ld';
import { useCasesLd } from '@/lib/structured-data';
import Client from './client';

export const metadata = routeMetadata('/use-cases');
export const revalidate = 3600;

export default function Page() {
  return (
    <>
      <JsonLd blocks={useCasesLd()} />
      <Client />
    </>
  );
}
