'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

// Shared by both clients and freelancers — base auth only.
const Profile = dynamic(() => import('@front/pages/Profile'), { ssr: false });

export default function Page() {
  return (
    <RequireAuth>
      <Profile />
    </RequireAuth>
  );
}
