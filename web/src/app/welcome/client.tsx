'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

// Clients-only landing (freelancers get redirected to /overview by the guard).
const Welcome = dynamic(() => import('@front/pages/Welcome'), { ssr: false });

export default function Client() {
  return (
    <RequireAuth roles={['client']}>
      <Welcome />
    </RequireAuth>
  );
}
