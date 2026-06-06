'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

const Threads = dynamic(() => import('@front/pages/Threads'), { ssr: false });

export default function Page() {
  return (
    <RequireAuth roles={['freelancer']}>
      <Threads />
    </RequireAuth>
  );
}
