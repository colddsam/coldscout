'use client';
import { Suspense } from 'react';
import DirectoryIndex from '@front/pages/directory/DirectoryIndex';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <DirectoryIndex />
    </Suspense>
  );
}
