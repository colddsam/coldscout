import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Session, User as SupabaseUser, AuthChangeEvent } from '@supabase/supabase-js';
import {
  signInWithOAuth as supabaseSignInWithOAuth,
  signInWithPassword as supabaseSignInWithPassword,
  signUp as supabaseSignUp,
  signOut as supabaseSignOut,
  getSession,
  onAuthStateChange,
  getUserRole,
  getAuthProvider,
} from '../lib/supabase';
import type { OAuthProvider, UserRole } from '../lib/supabase';
import { client } from '../lib/api';
import { getAuthItem, setAuthItem, removeAuthItem } from '../lib/authStorage';

/**
 * User interface for the application.
 * Extended to support both legacy users and Supabase Auth users.
 */
interface User {
  id: number;
  email: string;
  is_superuser: boolean;
  role?: UserRole;
  plan?: 'free' | 'pro' | 'enterprise';
  plan_expires_at?: string | null;
  full_name?: string;
  avatar_url?: string;
  supabase_uid?: string;
  auth_provider?: string;
}

interface AuthContextType {
  user: User | null;
  supabaseUser: SupabaseUser | null;
  session: Session | null;
  token: string | null;
  userRole: UserRole;
  hasPaidPlan: boolean;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  signInWithOAuth: (provider: OAuthProvider, role?: UserRole) => Promise<{ error: Error | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, role?: UserRole, fullName?: string) => Promise<{ error: Error | null }>;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSessionExpired: boolean;
  setIsSessionExpired: (expired: boolean) => void;
  syncUserToBackend: (role?: UserRole) => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Global authentication provider.
 *
 * Manages authentication state using Supabase Auth with fallback support
 * for legacy JWT-based authentication. Implements:
 *
 * 1. Supabase Auth state management via onAuthStateChange listener
 * 2. Session recovery from Supabase on app load
 * 3. Backend user sync after successful authentication
 * 4. Role-based access control (client vs freelancer)
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('freelancer');
  const [isLoading, setIsLoading] = useState(true);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  // Tracks the last access_token we synced against so we re-sync once per
  // session (including after a token refresh) but never on every re-render.
  const lastSyncedTokenRef = useRef<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Syncs the Supabase user to the backend database.
   * Creates or updates the user record in our PostgreSQL database.
   */
  const syncUserToBackend = useCallback(async (role?: UserRole): Promise<User | null> => {
    if (!supabaseUser || !session) {
      return null;
    }

    try {
      const syncData = {
        supabase_uid: supabaseUser.id,
        email: supabaseUser.email || '',
        role: role || getUserRole(supabaseUser),
        auth_provider: getAuthProvider(supabaseUser),
        full_name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || null,
        avatar_url: supabaseUser.user_metadata?.avatar_url || supabaseUser.user_metadata?.picture || null,
      };

      const { data } = await client.post('/api/v1/auth/sync', syncData);
      const backendUser: User = {
        id: data.id,
        email: data.email,
        is_superuser: data.is_superuser,
        role: data.role,
        plan: data.plan ?? 'free',
        plan_expires_at: data.plan_expires_at ?? null,
        full_name: data.full_name,
        avatar_url: data.avatar_url,
        supabase_uid: data.supabase_uid,
        auth_provider: data.auth_provider,
      };

      setUser(backendUser);
      setUserRole(backendUser.role || 'freelancer');

      // Store in localStorage for quick recovery
      setAuthItem('llp_user', JSON.stringify(backendUser));

      return backendUser;
    } catch {
      // Sync failed
      return null;
    }
  }, [supabaseUser, session]);

  /**
   * Initialize authentication state from Supabase.
   */
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Try to recover Supabase session
        const { session: existingSession } = await getSession();

        if (existingSession) {
          setSession(existingSession);
          setSupabaseUser(existingSession.user);
          setToken(existingSession.access_token);
          setUserRole(getUserRole(existingSession.user));

          // Try to restore user from localStorage first for quick UI
          const savedUserData = getAuthItem('llp_user');
          if (savedUserData && savedUserData !== 'undefined') {
            try {
              const savedUser = JSON.parse(savedUserData);
              if (savedUser && typeof savedUser === 'object' && savedUser.id && savedUser.email) {
                setUser(savedUser);
                setUserRole(savedUser.role || 'freelancer');
              } else {
                console.warn('Invalid user data in localStorage, discarding');
                removeAuthItem('llp_user');
              }
            } catch {
              removeAuthItem('llp_user');
            }
          }
        } else {
          // Check for legacy token
          const savedToken = getAuthItem('llp_token');
          const savedUserData = getAuthItem('llp_user');

          if (savedToken && savedUserData) {
            try {
              setToken(savedToken);
              const savedUser = JSON.parse(savedUserData);
              setUser(savedUser);
              setUserRole(savedUser.role || 'freelancer');
            } catch {
              // Legacy restore failed
              removeAuthItem('llp_token');
              removeAuthItem('llp_user');
            }
          }
        }
      } catch {
        removeAuthItem('llp_token');
        removeAuthItem('llp_user');
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  /**
   * Listen for Supabase auth state changes.
   */
  useEffect(() => {
    const subscription = onAuthStateChange(
      async (event: AuthChangeEvent, newSession: Session | null) => {

        if (event === 'SIGNED_IN' && newSession) {
          setSession(newSession);
          setSupabaseUser(newSession.user);
          setToken(newSession.access_token);
          setIsSessionExpired(false);

          // Restore backend user from localStorage if the uid matches.
          // This preserves the authoritative role from the last backend sync,
          // preventing incorrect role assignment from Supabase metadata alone.
          const savedUserData = getAuthItem('llp_user');
          if (savedUserData && savedUserData !== 'undefined') {
            try {
              const savedUser = JSON.parse(savedUserData);
              if (savedUser.supabase_uid === newSession.user.id) {
                setUser(savedUser);
                setUserRole(savedUser.role || getUserRole(newSession.user));
              } else {
                // Stale data from a different user — discard it
                removeAuthItem('llp_user');
                setUserRole(getUserRole(newSession.user));
              }
            } catch {
              setUserRole(getUserRole(newSession.user));
            }
          } else {
            setUserRole(getUserRole(newSession.user));
          }
        } else if (event === 'SIGNED_OUT') {
          setSession(null);
          setSupabaseUser(null);
          setUser(null);
          setToken(null);
          setUserRole('freelancer');
          removeAuthItem('llp_token');
          removeAuthItem('llp_user');
        } else if (event === 'TOKEN_REFRESHED' && newSession) {
          setSession(newSession);
          setToken(newSession.access_token);
        } else if (event === 'USER_UPDATED' && newSession) {
          setSupabaseUser(newSession.user);
          setUserRole(getUserRole(newSession.user));
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Listen for global session expiration events (from api.ts interceptor)
  useEffect(() => {
    const handleExpired = () => setIsSessionExpired(true);
    window.addEventListener('auth-session-expired', handleExpired);
    return () => window.removeEventListener('auth-session-expired', handleExpired);
  }, []);

  /**
   * Auto-sync user to backend once per session token.
   *
   * Runs whenever a Supabase session is active, including:
   *   - Email/password login (never goes through AuthCallback)
   *   - Sessions restored from localStorage on app load
   *   - Token refreshes (Supabase refreshes ~hourly) — keeps plan status fresh
   *
   * Using lastSyncedTokenRef prevents repeated calls on re-renders while still
   * running on every genuinely new or refreshed token, so an expired plan is
   * caught within at most one token refresh cycle (~1 hour) without a re-login.
   *
   * Skips the /auth/callback page because AuthCallback manages its own sync.
   */
  useEffect(() => {
    if (location.pathname === '/auth/callback') return;
    if (!session || !supabaseUser || isLoading) return;
    if (lastSyncedTokenRef.current === session.access_token) return;

    lastSyncedTokenRef.current = session.access_token;
    const pendingRole = (getAuthItem('llp_pending_role') || undefined) as UserRole | undefined;
    syncUserToBackend(pendingRole).then((backendUser) => {
      if (backendUser && pendingRole) {
        removeAuthItem('llp_pending_role');
      }
    });
  }, [session, supabaseUser, isLoading, syncUserToBackend, location.pathname]);

  /**
   * Legacy login function for email/password authentication.
   * Kept for backward compatibility.
   */
  const login = useCallback((newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    setUserRole(newUser.role || 'freelancer');
    setIsSessionExpired(false);
    setAuthItem('llp_token', newToken);
    setAuthItem('llp_user', JSON.stringify(newUser));
  }, []);

  /**
   * Signs out the user from both Supabase and local session.
   */
  const logout = useCallback(async () => {
    // Sign out from Supabase
    await supabaseSignOut();

    // Clear local state
    setToken(null);
    setUser(null);
    setSupabaseUser(null);
    setSession(null);
    setUserRole('freelancer');
    setIsSessionExpired(false);
    removeAuthItem('llp_token');
    removeAuthItem('llp_user');

    navigate('/login');
  }, [navigate]);

  /**
   * Signs in with OAuth provider (Google, GitHub, Facebook, LinkedIn).
   */
  const signInWithOAuth = useCallback(async (
    provider: OAuthProvider,
    role: UserRole = 'freelancer'
  ): Promise<{ error: Error | null }> => {
    // Store the selected role for use after callback
    setAuthItem('llp_pending_role', role);

    const { error } = await supabaseSignInWithOAuth(provider, role);
    return { error: error as Error | null };
  }, []);

  /**
   * Signs in with email and password using Supabase Auth.
   */
  const signInWithPassword = useCallback(async (
    email: string,
    password: string
  ): Promise<{ error: Error | null }> => {
    const { data, error } = await supabaseSignInWithPassword(email, password);

    if (error) {
      return { error: error as Error };
    }

    if (data.session) {
      setSession(data.session);
      setSupabaseUser(data.user);
      setToken(data.session.access_token);
      setUserRole(getUserRole(data.user));
    }

    return { error: null };
  }, []);

  /**
   * Signs up a new user with email and password.
   */
  const signUp = useCallback(async (
    email: string,
    password: string,
    role: UserRole = 'freelancer',
    fullName?: string
  ): Promise<{ error: Error | null }> => {
    // Store the selected role for use after email confirmation
    setAuthItem('llp_pending_role', role);

    const { error } = await supabaseSignUp(email, password, role, fullName);
    return { error: error as Error | null };
  }, []);

  const isAuthenticated = !!token || !!session;

  // Plan gating only applies to freelancers.
  // Clients are always treated as having "access" — they are never shown the upgrade
  // dialog or skeleton, regardless of what plan value is stored on their account.
  //
  // For freelancers we also check plan_expires_at so that an expired plan is
  // treated as free immediately on the frontend, even if stale localStorage data
  // still shows plan='pro'. The daily backend scheduler is the authoritative
  // source, but this client-side check closes the gap between expiry and the
  // next scheduler run (up to 24 h) or the next syncUserToBackend call.
  const hasPaidPlan =
    user?.role === 'client' ||
    !!(
      user?.plan &&
      user.plan !== 'free' &&
      (!user.plan_expires_at || new Date(user.plan_expires_at) > new Date())
    );

  return (
    <AuthContext.Provider
      value={{
        user,
        supabaseUser,
        session,
        token,
        userRole,
        hasPaidPlan,
        login,
        logout,
        signInWithOAuth,
        signInWithPassword,
        signUp,
        isAuthenticated,
        isLoading,
        isSessionExpired,
        setIsSessionExpired,
        syncUserToBackend,
      }}
    >
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

export type { User, UserRole, OAuthProvider };
