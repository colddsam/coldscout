'use client';
import { Suspense } from 'react';
import RefundPolicy from '@front/pages/RefundPolicy';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <RefundPolicy />
    </Suspense>
  );
}
