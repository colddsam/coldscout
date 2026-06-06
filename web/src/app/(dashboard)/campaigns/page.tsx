'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

const Campaigns = dynamic(() => import('@front/pages/Campaigns'), {
  ssr: false,
});

export default function Page() {
  return (
    <RequireAuth roles={['freelancer']}>
      <Campaigns />
    </RequireAuth>
  );
}
