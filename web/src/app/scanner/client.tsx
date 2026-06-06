'use client';
import { Suspense } from 'react';
import LeadScanner from '@front/pages/LeadScanner';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <LeadScanner />
    </Suspense>
  );
}
