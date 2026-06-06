'use client';
import { Suspense } from 'react';
import Integrations from '@front/pages/Integrations';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <Integrations />
    </Suspense>
  );
}
