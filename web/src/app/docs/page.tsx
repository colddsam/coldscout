import { routeMetadata } from '@/lib/seo';
import Client from './client';

export const metadata = routeMetadata('/docs');
export const revalidate = 3600;

export default function Page() {
  return <Client />;
}
