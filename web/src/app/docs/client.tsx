'use client';
import { Suspense } from 'react';
import Documentation from '@front/pages/Documentation';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <Documentation />
    </Suspense>
  );
}
