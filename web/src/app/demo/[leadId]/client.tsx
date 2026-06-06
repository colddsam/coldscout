'use client';
import { Suspense } from 'react';
import LeadDemoViewer from '@front/pages/LeadDemoViewer';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <LeadDemoViewer />
    </Suspense>
  );
}
