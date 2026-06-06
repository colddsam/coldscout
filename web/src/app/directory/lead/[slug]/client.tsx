'use client';
import { Suspense } from 'react';
import DirectoryDetail from '@front/pages/directory/DirectoryDetail';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <DirectoryDetail />
    </Suspense>
  );
}
