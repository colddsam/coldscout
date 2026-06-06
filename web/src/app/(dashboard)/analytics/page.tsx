'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

const Analytics = dynamic(() => import('@front/pages/Analytics'), {
  ssr: false,
});

export default function Page() {
  return (
    <RequireAuth roles={['freelancer']}>
      <Analytics />
    </RequireAuth>
  );
}
