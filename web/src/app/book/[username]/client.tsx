'use client';
import { Suspense } from 'react';
import BookingPage from '@front/pages/BookingPage';

// Shared by /book/[username] and /book/[username]/[eventSlug]; BookingPage reads
// both params via the react-router-dom compat shim.
export default function Client() {
  return (
    <Suspense fallback={null}>
      <BookingPage />
    </Suspense>
  );
}
