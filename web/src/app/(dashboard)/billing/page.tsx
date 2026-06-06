'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

const Billing = dynamic(() => import('@front/pages/Billing'), { ssr: false });

export default function Page() {
  return (
    <RequireAuth roles={['freelancer']}>
      <Billing />
    </RequireAuth>
  );
}
