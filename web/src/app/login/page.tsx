import { routeMetadata } from '@/lib/seo';
import Client from './client';

export const metadata = routeMetadata('/login');

export default function Page() {
  return <Client />;
}
