'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

const Bookings = dynamic(() => import('@front/pages/Bookings'), { ssr: false });

export default function Page() {
  return (
    <RequireAuth roles={['freelancer']}>
      <Bookings />
    </RequireAuth>
  );
}
