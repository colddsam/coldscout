'use client';
import { Suspense } from 'react';
import Support from '@front/pages/Support';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <Support />
    </Suspense>
  );
}
