'use client';
/**
 * Client provider tree for the Next.js app — the equivalent of the old
 * App.tsx wrappers (minus BrowserRouter, which Next owns).
 *
 * Order mirrors the Vite app: QueryClientProvider -> AuthProvider -> app.
 * The QueryClient is created lazily per browser session (useState) so SSR/SSG
 * never shares a client across requests.
 */
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@front/hooks/useAuth';
import SessionExpiredModal from '@front/components/auth/SessionExpiredModal';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionExpiredModal />
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#1C1C1C',
              color: '#F0F0F0',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px',
              fontSize: '13px',
              fontFamily: '"Almarai", -apple-system, BlinkMacSystemFont, sans-serif',
              boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
              padding: '10px 14px',
            },
            success: {
              style: {
                background: '#0F1A14',
                border: '1px solid rgba(52, 211, 153, 0.35)',
                borderLeft: '3px solid #34D399',
                color: '#E6F7EE',
              },
              iconTheme: { primary: '#34D399', secondary: '#0F1A14' },
            },
            error: {
              style: {
                background: '#1A0F0F',
                border: '1px solid rgba(248, 113, 113, 0.35)',
                borderLeft: '3px solid #F87171',
                color: '#FBE6E6',
              },
              iconTheme: { primary: '#F87171', secondary: '#1A0F0F' },
            },
            loading: {
              iconTheme: { primary: '#60A5FA', secondary: '#0F1722' },
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
