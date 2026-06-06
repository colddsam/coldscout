'use client';
import { Suspense } from 'react';
import Compare from '@front/pages/Compare';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <Compare />
    </Suspense>
  );
}
