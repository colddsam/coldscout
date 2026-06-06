'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

const DiscoveryTargets = dynamic(
  () => import('@front/pages/DiscoveryTargets'),
  { ssr: false },
);

export default function Page() {
  return (
    <RequireAuth roles={['freelancer']}>
      <DiscoveryTargets />
    </RequireAuth>
  );
}
