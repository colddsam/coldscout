/**
 * Supabase Client Configuration.
 *
 * Initializes and exports the Supabase client for authentication
 * and database operations. This is the single source of truth for
 * Supabase configuration in the frontend.
 *
 * Environment Variables Required:
 * - VITE_SUPABASE_URL:   Your Supabase project URL
 * - VITE_SUPABASE_ANON_KEY: Your Supabase anonymous/public key
 * - VITE_APP_URL:        Explicit base URL for OAuth / email redirect callbacks.
 *                        Set to the URL your browser uses to access the app:
 *                          Development:  http://localhost:5173
 *                          Production:   https://your-production-domain.com
 *                        Falls back to window.location.origin when not set,
 *                        but an explicit value avoids mismatches when the proxy
 *                        and the Vite dev server run on different ports.
 *
 * IMPORTANT — Supabase Dashboard settings must match VITE_APP_URL:
 *   Authentication → URL Configuration
 *     Site URL:      http://localhost:5173          (or production URL)
 *     Redirect URLs: http://localhost:5173/**       (wildcard covers all paths)
 *                    https://your-production-domain.com/**
 */
import { createClient } from '@supabase/supabase-js';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Explicit base URL for OAuth and email redirect callbacks.
 *
 * Using window.location.origin alone is unreliable in local development
 * because the proxy server (port 3000/3001) and the Vite dev server (port 5173)
 * share the same hostname but listen on different ports.  If Supabase redirects
 * back to the proxy port, the Supabase JS client is never loaded and the PKCE
 * code exchange cannot complete.
 *
 * VITE_APP_URL pins the callback to the correct origin at build time.
 */
const APP_URL = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '')
  ?? window.location.origin;

if (!supabaseUrl || !supabaseAnonKey) {
  // Supabase environment variables not configured.
}

/**
 * Supabase client instance.
 *
 * Configured with:
 * - Automatic session persistence (localStorage)
 * - Automatic token refresh
 * - PKCE auth flow for enhanced security
 */
export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  }
);

/**
 * OAuth provider types supported by the application.
 */
export type OAuthProvider = 'google' | 'github' | 'facebook' | 'linkedin_oidc';

/**
 * User role types.
 */
export type UserRole = 'client' | 'freelancer';

/**
 * Signs in a user with OAuth provider.
 *
 * @param provider - The OAuth provider to use
 * @param role - The user's intended role (stored in user metadata)
 * @returns Promise with auth data or error
 */
export const signInWithOAuth = async (provider: OAuthProvider, role: UserRole = 'freelancer') => {
  // Store the role in localStorage for retrieval after OAuth callback
  // This is necessary because OAuth redirects don't allow passing custom data
  localStorage.setItem('llp_pending_role', role);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${APP_URL}/auth/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  return { data, error };
};

/**
 * Signs in a user with email and password.
 *
 * @param email - User's email address
 * @param password - User's password
 * @returns Promise with auth data or error
 */
export const signInWithPassword = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  return { data, error };
};

/**
 * Signs up a new user with email and password.
 *
 * @param email - User's email address
 * @param password - User's password
 * @param role - User's role ('client' or 'freelancer')
 * @param fullName - Optional full name
 * @returns Promise with auth data or error
 */
export const signUp = async (
  email: string,
  password: string,
  role: UserRole = 'freelancer',
  fullName?: string
) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role,
        full_name: fullName,
      },
      emailRedirectTo: `${APP_URL}/auth/callback`,
    },
  });

  return { data, error };
};

/**
 * Signs out the current user.
 *
 * @returns Promise with error if any
 */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

/**
 * Gets the current session.
 *
 * @returns Promise with session data or null
 */
export const getSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  return { session, error };
};

/**
 * Gets the current user.
 *
 * @returns Promise with user data or null
 */
export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
};

/**
 * Subscribes to auth state changes.
 *
 * @param callback - Function to call when auth state changes
 * @returns Unsubscribe function
 */
export const onAuthStateChange = (
  callback: (event: AuthChangeEvent, session: Session | null) => void
) => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
  return subscription;
};

/**
 * Extracts user role from Supabase user metadata.
 *
 * @param user - Supabase user object
 * @returns User role or 'freelancer' as default
 */
export const getUserRole = (user: { user_metadata?: { role?: string } } | null): UserRole => {
  return (user?.user_metadata?.role as UserRole) || 'freelancer';
};

/**
 * Extracts auth provider from Supabase user app metadata.
 *
 * @param user - Supabase user object
 * @returns Auth provider name
 */
export const getAuthProvider = (user: { app_metadata?: { provider?: string } } | null): string => {
  return user?.app_metadata?.provider || 'email';
};

export default supabase;
