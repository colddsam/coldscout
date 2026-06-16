import type { Metadata } from 'next';
import Client from './client';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  return <Client />;
}
