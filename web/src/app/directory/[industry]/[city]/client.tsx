'use client';
import { Suspense } from 'react';
import DirectoryList from '@front/pages/directory/DirectoryList';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <DirectoryList />
    </Suspense>
  );
}
