/**
 * Tab-aware auth storage.
 *
 * Solves two conflicting requirements for multi-tab auth:
 *
 *  1. Two tabs logged in as different users must stay isolated — one tab's
 *     login must NOT clobber the other tab's session. (localStorage fails
 *     here because it's shared across every tab of the same origin.)
 *
 *  2. When the browser is closed, the *most recently active* tab's user
 *     should persist and auto-restore on the next launch — regardless of
 *     how many other tabs were open as other users.
 *
 * Design:
 *   - Primary read/write goes to sessionStorage → per-tab isolation.
 *   - Each tab gets a unique ``tabId`` (stored in sessionStorage). Every
 *     auth-key write is mirrored to localStorage under
 *     ``llp_persist:<tabId>:<key>`` so tabs never overwrite each other's
 *     persisted snapshots.
 *   - A single ``llp_persist:last_active_tab`` pointer records which tab
 *     was most recently visible/focused. It is updated on visibilitychange,
 *     focus, and pagehide — but ONLY when the tab is actually visible, so
 *     background tabs cannot steal the pointer when the browser closes.
 *   - On cold start, a tab with empty sessionStorage reads the pointer and
 *     hydrates itself from that tab's namespace, then adopts the tabId so
 *     subsequent activity stays tied to the restored session.
 */
const PERSIST_PREFIX = 'llp_persist:';
const LAST_ACTIVE_KEY = `${PERSIST_PREFIX}last_active_tab`;
const TAB_ID_KEY = 'llp_tab_id';

/** Keys we consider auth-related and worth mirroring. */
const AUTH_KEY_PATTERNS = [/^sb-/, /^llp_token$/, /^llp_user$/, /^llp_pending_role$/];

function isAuthKey(key: string): boolean {
  return AUTH_KEY_PATTERNS.some((re) => re.test(key));
}

function generateTabId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getTabId(): string {
  if (typeof window === 'undefined') return '';
  let id = window.sessionStorage.getItem(TAB_ID_KEY);
  if (!id) {
    id = generateTabId();
    window.sessionStorage.setItem(TAB_ID_KEY, id);
  }
  return id;
}

function persistedKey(tabId: string, key: string): string {
  return `${PERSIST_PREFIX}${tabId}:${key}`;
}

function readLastActiveTabId(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(LAST_ACTIVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { tabId?: string };
    return parsed.tabId || null;
  } catch {
    return null;
  }
}

function writeLastActiveTabId(tabId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      LAST_ACTIVE_KEY,
      JSON.stringify({ tabId, ts: Date.now() }),
    );
  } catch {
    // quota / private mode — non-fatal
  }
}

/**
 * Hydrate sessionStorage for a fresh tab from the most-recently-active tab's
 * persisted snapshot. Runs once per tab; subsequent calls are no-ops.
 */
let _hydrated = false;
function hydrateFromLastActive(): void {
  if (_hydrated || typeof window === 'undefined') return;
  _hydrated = true;

  // Only hydrate when the current tab has no existing auth state. This keeps
  // a long-lived tab's own session intact even if another tab became the
  // "last active" one in the meantime.
  const alreadyHasSession = (() => {
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k && isAuthKey(k)) return true;
    }
    return false;
  })();
  if (alreadyHasSession) return;

  const lastTabId = readLastActiveTabId();
  if (!lastTabId) return;

  const prefix = `${PERSIST_PREFIX}${lastTabId}:`;
  const restored: Array<[string, string]> = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k || !k.startsWith(prefix)) continue;
    const bareKey = k.slice(prefix.length);
    if (!isAuthKey(bareKey)) continue;
    const v = window.localStorage.getItem(k);
    if (v !== null) restored.push([bareKey, v]);
  }
  if (restored.length === 0) return;

  // Fork into a fresh tabId and copy the restored keys. Keeping this tab's
  // namespace distinct prevents a sign-in-as-different-user in the new tab
  // from overwriting the original tab's persisted snapshot (which may still
  // be actively held by the original tab, if it is still running).
  const freshId = generateTabId();
  window.sessionStorage.setItem(TAB_ID_KEY, freshId);
  for (const [k, v] of restored) {
    window.sessionStorage.setItem(k, v);
    window.localStorage.setItem(persistedKey(freshId, k), v);
  }
  writeLastActiveTabId(freshId);
}

export function getAuthItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  hydrateFromLastActive();
  return window.sessionStorage.getItem(key);
}

export function setAuthItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(key, value);
  if (isAuthKey(key)) {
    const tabId = getTabId();
    window.localStorage.setItem(persistedKey(tabId, key), value);
    // Claim the last-active pointer at write time. We cannot rely on
    // visibilitychange/focus/pagehide firing before the browser closes — if
    // the pointer is never written, a cold start has nothing to hydrate from
    // and the user appears signed out on next launch.
    writeLastActiveTabId(tabId);
  }
}

export function removeAuthItem(key: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(key);
  if (isAuthKey(key)) {
    window.localStorage.removeItem(persistedKey(getTabId(), key));
  }
}

/**
 * Storage adapter shape accepted by Supabase's ``auth.storage`` option.
 */
export const authStorage = {
  getItem: (key: string): string | null => getAuthItem(key),
  setItem: (key: string, value: string): void => setAuthItem(key, value),
  removeItem: (key: string): void => removeAuthItem(key),
};

/**
 * Re-mirror this tab's auth keys under its own namespace and claim the
 * "last active" pointer. Only called when the tab is actually visible, so
 * background tabs cannot overwrite the pointer on browser close.
 */
function claimLastActive(): void {
  if (typeof window === 'undefined') return;
  if (document.visibilityState !== 'visible') return;
  try {
    const tabId = getTabId();
    let wroteAny = false;
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (!k || !isAuthKey(k)) continue;
      const v = window.sessionStorage.getItem(k);
      if (v !== null) {
        window.localStorage.setItem(persistedKey(tabId, k), v);
        wroteAny = true;
      }
    }
    if (wroteAny) writeLastActiveTabId(tabId);
  } catch {
    // storage quota / access denied in private-mode — non-fatal.
  }
}

let _installed = false;
export function installAuthStorageListeners(): void {
  if (_installed || typeof window === 'undefined') return;
  _installed = true;

  const onVisibility = () => {
    if (document.visibilityState === 'visible') claimLastActive();
  };
  window.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', claimLastActive);
  // pagehide fires on tab close / navigation / bfcache. We gate on visibility
  // inside claimLastActive so only the foreground tab wins the pointer when
  // the whole browser is closed.
  window.addEventListener('pagehide', claimLastActive);
}

// Install immediately on module load so any tab that imports the auth
// plumbing automatically participates in the mirror contract.
installAuthStorageListeners();

// Eagerly hydrate so the first Supabase read sees a populated sessionStorage.
hydrateFromLastActive();
