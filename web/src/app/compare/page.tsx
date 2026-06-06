import { routeMetadata } from '@/lib/seo';
import Client from './client';

export const metadata = routeMetadata('/compare');
export const revalidate = 3600;

export default function Page() {
  return <Client />;
}
