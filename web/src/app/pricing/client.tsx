'use client';
import { Suspense } from 'react';
import Pricing from '@front/pages/Pricing';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <Pricing />
    </Suspense>
  );
}
