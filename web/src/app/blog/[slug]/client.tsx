'use client';
import { Suspense } from 'react';
import Post from '@front/pages/Post';

export default function Client() {
  // Post reads the :slug param via the react-router-dom compat shim
  // (next/navigation useParams under the hood).
  return (
    <Suspense fallback={null}>
      <Post kind="blog" />
    </Suspense>
  );
}
