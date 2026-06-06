'use client';
import { Suspense } from 'react';
import Download from '@front/pages/Download';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <Download />
    </Suspense>
  );
}
