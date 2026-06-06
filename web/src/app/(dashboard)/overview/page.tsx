'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

const Overview = dynamic(() => import('@front/pages/Overview'), { ssr: false });

export default function Page() {
  return (
    <RequireAuth roles={['freelancer']}>
      <Overview />
    </RequireAuth>
  );
}
