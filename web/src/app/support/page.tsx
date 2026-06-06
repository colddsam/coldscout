import { routeMetadata } from '@/lib/seo';
import JsonLd from '@/components/json-ld';
import { supportLd } from '@/lib/structured-data';
import Client from './client';

export const metadata = routeMetadata('/support');
export const revalidate = 86400;

export default function Page() {
  return (
    <>
      <JsonLd blocks={supportLd()} />
      <Client />
    </>
  );
}
