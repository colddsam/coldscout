'use client';
import { Suspense } from 'react';
import UseCases from '@front/pages/UseCases';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <UseCases />
    </Suspense>
  );
}
