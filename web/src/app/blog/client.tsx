'use client';
import { Suspense } from 'react';
import Blog from '@front/pages/Blog';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <Blog />
    </Suspense>
  );
}
