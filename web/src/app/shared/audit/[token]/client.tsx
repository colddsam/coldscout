'use client';
import { Suspense } from 'react';
import SharedAuditView from '@front/pages/SharedAuditView';

export default function Client() {
  return (
    <Suspense fallback={null}>
      <SharedAuditView />
    </Suspense>
  );
}
