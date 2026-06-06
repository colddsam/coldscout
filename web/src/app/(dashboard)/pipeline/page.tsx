'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

const Pipeline = dynamic(() => import('@front/pages/Pipeline'), { ssr: false });

export default function Page() {
  return (
    <RequireAuth roles={['freelancer']}>
      <Pipeline />
    </RequireAuth>
  );
}
