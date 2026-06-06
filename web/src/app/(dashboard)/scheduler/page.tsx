'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

const Scheduler = dynamic(() => import('@front/pages/Scheduler'), { ssr: false });

export default function Page() {
  return (
    <RequireAuth roles={['freelancer']}>
      <Scheduler />
    </RequireAuth>
  );
}
