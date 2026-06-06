'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

const Settings = dynamic(() => import('@front/pages/Settings'), { ssr: false });

export default function Page() {
  return (
    <RequireAuth roles={['freelancer']}>
      <Settings />
    </RequireAuth>
  );
}
