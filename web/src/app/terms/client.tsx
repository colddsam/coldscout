'use client';
import { Suspense } from 'react';
import Terms from '@front/pages/Terms';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <Terms />
    </Suspense>
  );
}
