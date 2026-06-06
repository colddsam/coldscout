'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

const Inbox = dynamic(() => import('@front/pages/Inbox'), { ssr: false });

export default function Page() {
  return (
    <RequireAuth roles={['freelancer']}>
      <Inbox />
    </RequireAuth>
  );
}
