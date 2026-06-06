import { routeMetadata } from '@/lib/seo';
import JsonLd from '@/components/json-ld';
import { homeLd } from '@/lib/structured-data';
import LandingClient from './landing.client';

export const metadata = routeMetadata('/');
// Static-generate with hourly revalidation (ISR).
export const revalidate = 3600;

export default function HomePage() {
  return (
    <>
      <JsonLd blocks={homeLd()} />
      <LandingClient />
    </>
  );
}
