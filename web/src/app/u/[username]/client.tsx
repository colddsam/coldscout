'use client';
import { Suspense } from 'react';
import PublicProfile from '@front/pages/PublicProfile';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <PublicProfile />
    </Suspense>
  );
}
