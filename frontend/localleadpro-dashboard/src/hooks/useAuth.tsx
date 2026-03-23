import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../lib/api';

interface User {
  id: number;
  email: string;
  is_superuser: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSessionExpired: boolean;
  setIsSessionExpired: (expired: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Global authentication provider.
 * Manages JWT persistence in LocalStorage and implements a dual-sync strategy:
 * 1. Immediate recovery from LocalStorage for UI responsiveness.
 * 2. Proactive server-side verification via `getMe()` to ensure session validity.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const savedToken = localStorage.getItem('llp_token');
        const savedUserData = localStorage.getItem('llp_user');
        
        if (savedToken) {
          setToken(savedToken);
          
          // Try to restore user data if it looks valid
          if (savedUserData && savedUserData !== 'undefined') {
            try {
              setUser(JSON.parse(savedUserData));
            } catch {
              console.warn('Malformed user data in storage, will recover via getMe()');
            }
          }
          
          // Proactive verification: Synchronize frontend state with the backend.
          // This recovers full user metadata if LocalStorage is missing it (e.g., manual login).
          try {
            const freshUser = await getMe();
            setUser(freshUser);
            localStorage.setItem('llp_user', JSON.stringify(freshUser));
          } catch {
            // Error handling is primarily done in api.ts interceptor
            // which clears storage and dispatches 'auth-session-expired'
            console.warn('Session verification failed on startup');
          }
        }
      } catch (err) {
        console.error('Failed to restore session:', err);
        localStorage.removeItem('llp_token');
        localStorage.removeItem('llp_user');
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Listen for global session expiration events (dispatched by api.ts interceptor)
  useEffect(() => {
    const handleExpired = () => setIsSessionExpired(true);
    window.addEventListener('auth-session-expired', handleExpired);
    return () => window.removeEventListener('auth-session-expired', handleExpired);
  }, []);

  /**
   * Commits new session credentials to state and persistence.
   */
  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    setIsSessionExpired(false);
    localStorage.setItem('llp_token', newToken);
    localStorage.setItem('llp_user', JSON.stringify(newUser));
  };

  /**
   * Destroys the current session and redirects to the login route.
   */
  const logout = () => {
    setToken(null);
    setUser(null);
    setIsSessionExpired(false);
    localStorage.removeItem('llp_token');
    localStorage.removeItem('llp_user');
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ 
      user, token, login, logout, isAuthenticated: !!token, isLoading, 
      isSessionExpired, setIsSessionExpired 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Custom hook to access the current authentication state and actions.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

