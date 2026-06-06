'use client';
import { Suspense } from 'react';
import Guides from '@front/pages/Guides';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <Guides />
    </Suspense>
  );
}
