'use client';
import { Suspense } from 'react';
import Changelog from '@front/pages/Changelog';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <Changelog />
    </Suspense>
  );
}
