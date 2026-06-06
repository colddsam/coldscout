import type { Metadata } from 'next';
import Chrome from './chrome';

// Every dashboard route is authenticated + noindex.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Chrome>{children}</Chrome>;
}
