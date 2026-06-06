'use client';
import { Suspense } from 'react';
import LandingPage from '@front/pages/LandingPage';

export default function LandingClient() {
  return (
    <Suspense fallback={null}>
      <LandingPage />
    </Suspense>
  );
}
