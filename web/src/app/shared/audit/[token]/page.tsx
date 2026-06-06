import type { Metadata } from 'next';
import Client from './client';

// Shared audit reports are private, tokenized links — never indexed.
export const metadata: Metadata = {
  title: 'Shared Audit Report — Cold Scout',
  description: 'A shared website/business audit report from Cold Scout.',
  robots: { index: false, follow: false },
};

export const revalidate = 0;

export default function Page() {
  return <Client />;
}
