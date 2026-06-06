'use client';
import { Suspense } from 'react';
import Faq from '@front/pages/Faq';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <Faq />
    </Suspense>
  );
}
