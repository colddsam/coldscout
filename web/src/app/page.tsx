import { routeMetadata } from '@/lib/seo';
import LandingClient from './landing.client';

export const metadata = routeMetadata('/');
// Static-generate with hourly revalidation (ISR).
export const revalidate = 3600;

export default function HomePage() {
  return <LandingClient />;
}
