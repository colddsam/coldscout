'use client';
import { Suspense } from 'react';
import Privacy from '@front/pages/Privacy';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <Privacy />
    </Suspense>
  );
}
