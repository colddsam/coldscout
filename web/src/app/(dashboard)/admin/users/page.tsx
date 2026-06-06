'use client';
import dynamic from 'next/dynamic';
import { RequireAuth } from '@/components/auth-guard';

const AdminUsers = dynamic(() => import('@front/pages/AdminUsers'), {
  ssr: false,
});

export default function Page() {
  return (
    <RequireAuth superuser>
      <AdminUsers />
    </RequireAuth>
  );
}
