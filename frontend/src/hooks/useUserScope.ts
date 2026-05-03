/**
 * Per-user React Query cache scope.
 *
 * Every user-scoped query key in the app must include this scope as one of
 * its first segments so cache entries from one signed-in user can never be
 * read back by a different user on the same device. The auth-transition cache
 * wipe in ``useAuth`` is the safety net; this is the structural fix that
 * makes a leak impossible by construction.
 *
 * Why a string and not the raw id?
 * --------------------------------
 * Falling back to ``"anon"`` keeps the key stable while we're still loading
 * the auth state, so the query doesn't re-mount the moment the user id
 * arrives. Anything fetched under ``"anon"`` is wiped at login by the auth
 * hook's ``purgeUserCaches``.
 *
 * Usage
 * -----
 * ::
 *
 *   const scope = useUserScope();
 *   useQuery({ queryKey: ['leads', scope, params], ... });
 *   // and on the matching invalidate:
 *   qc.invalidateQueries({ queryKey: ['leads', scope] });
 *
 * The scope segment must be placed at a stable position (typically index 1,
 * right after the resource name) so partial-key invalidation patterns still
 * work.
 */
import { useAuth } from './useAuth';

export type UserScope = string;

export function useUserScope(): UserScope {
  const { user } = useAuth();
  return user?.id ? `u:${user.id}` : 'anon';
}
