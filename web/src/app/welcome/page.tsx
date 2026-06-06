import type { Metadata } from 'next';
import Client from './client';

export const metadata: Metadata = {
  title: 'Welcome — Cold Scout',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <Client />;
}
