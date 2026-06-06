'use client';
import dynamic from 'next/dynamic';

const NotFound = dynamic(() => import('@front/pages/NotFound'), { ssr: false });

export default function NotFoundPage() {
  return <NotFound />;
}
