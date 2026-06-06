import { routeMetadata } from '@/lib/seo';
import Client from './client';

export const metadata = routeMetadata('/terms');
export const revalidate = 86400;

export default function Page() {
  return <Client />;
}
