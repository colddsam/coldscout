'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

const APIKeys = dynamic(() => import('@front/pages/APIKeys'), { ssr: false });

export default function Page() {
  return (
    <RequireAuth roles={['freelancer']}>
      <APIKeys />
    </RequireAuth>
  );
}
