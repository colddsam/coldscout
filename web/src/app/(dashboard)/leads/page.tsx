'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

const Leads = dynamic(() => import('@front/pages/Leads'), { ssr: false });

export default function Page() {
  return (
    <RequireAuth roles={['freelancer']}>
      <Leads />
    </RequireAuth>
  );
}
