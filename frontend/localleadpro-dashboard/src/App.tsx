/**
 * Root Application Component.
 * 
 * Orchestrates the global providers (QueryClient, React Router, AuthContext)
 * and defines the primary routing architecture for the Local Lead Pro dashboard.
 * Includes both public-facing pages and protected dashboard routes.
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

import Shell from './components/layout/Shell';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Pipeline from './pages/Pipeline';
import Scheduler from './pages/Scheduler';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Campaigns from './pages/Campaigns';
import Inbox from './pages/Inbox';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';
import { AuthProvider } from './hooks/useAuth';
import ProtectedRoute from './components/auth/ProtectedRoute';
import SessionExpiredModal from './components/auth/SessionExpiredModal';

/**
 * Shared QueryClient instance with optimized development defaults.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <SessionExpiredModal />
          <Routes>

            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />

            {/* Dashboard (inside ProtectedRoute + Shell layout) */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Shell />}>
                <Route path="/overview" element={<Overview />} />
                <Route path="/pipeline" element={<Pipeline />} />
                <Route path="/scheduler" element={<Scheduler />} />
                <Route path="/leads" element={<Leads />} />
                <Route path="/leads/:id" element={<LeadDetail />} />
                <Route path="/campaigns" element={<Campaigns />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#ffffff',
            color: '#000000',
            border: '1px solid #eaeaea',
            borderRadius: '8px',
            fontSize: '13px',
            fontFamily: '"Inter", system-ui, sans-serif',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          },
          success: {
            iconTheme: { primary: '#2dde98', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#ff3b5c', secondary: '#fff' },
          },
        }}
      />
    </QueryClientProvider>
  );
}
