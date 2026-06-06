'use client';
import { Suspense } from 'react';
import DataDeletion from '@front/pages/DataDeletion';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <DataDeletion />
    </Suspense>
  );
}
