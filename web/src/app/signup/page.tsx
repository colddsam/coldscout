import { routeMetadata } from '@/lib/seo';
import Client from './client';

export const metadata = routeMetadata('/signup');

export default function Page() {
  return <Client />;
}
