'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

const LeadDetail = dynamic(() => import('@front/pages/LeadDetail'), {
  ssr: false,
});

export default function Page() {
  return (
    <RequireAuth roles={['freelancer']}>
      <LeadDetail />
    </RequireAuth>
  );
}
