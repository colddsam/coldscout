'use client';
/**
 * Persistent dashboard chrome: the Shell (sidebar + topbar + page transitions)
 * mounts once and stays mounted across dashboard navigations; the active page
 * flows into Shell's <Outlet/> via the react-router-dom compat shim's
 * OutletProvider.
 *
 * - Base RequireAuth gates the whole shell (so Shell's data hooks never fire
 *   while logged out). Per-page role guards refine access inside each page.
 * - Shell is loaded with ssr:false: it uses realtime sockets, the push service
 *   worker, framer-motion and window listeners — all client-only.
 */
import dynamic from 'next/dynamic';
import { OutletProvider } from 'react-router-dom';
import { RequireAuth } from '@/components/auth-guard';

const Shell = dynamic(() => import('@front/components/layout/Shell'), {
  ssr: false,
});

export default function Chrome({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <OutletProvider outlet={children}>
        <Shell />
      </OutletProvider>
    </RequireAuth>
  );
}
