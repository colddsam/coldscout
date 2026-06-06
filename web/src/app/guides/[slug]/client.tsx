'use client';
import { Suspense } from 'react';
import Post from '@front/pages/Post';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <Post kind="guide" />
    </Suspense>
  );
}
