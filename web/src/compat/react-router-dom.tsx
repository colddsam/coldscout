'use client';
/**
 * react-router-dom compatibility shim.
 *
 * The shared app source (../../frontend/src) was written against
 * react-router-dom v7. Under Next.js, routing is owned by the App Router, so we
 * alias `react-router-dom` to this module (see next.config.mjs + tsconfig paths)
 * and re-implement the surface the codebase actually uses on top of
 * next/navigation. This lets the 44 router-coupled files run unmodified.
 *
 * Implemented: Link, NavLink, useNavigate, useLocation, useParams,
 * useSearchParams (react-router tuple API), Navigate, Outlet (+ OutletProvider /
 * useOutletContext), and inert stubs for BrowserRouter/Routes/Route/MemoryRouter
 * so stray imports resolve.
 *
 * IMPORTANT (Next quirk): components that use useSearchParams must be wrapped in
 * a <Suspense> boundary by their route, or Next bails out of static rendering.
 * Our route wrappers add that boundary. useLocation deliberately reads
 * window.location for search/hash (not useSearchParams) so it can sit high in
 * the tree (AuthProvider) without forcing every page dynamic.
 */
import * as React from 'react';
import NextLink from 'next/link';
import {
  useRouter,
  usePathname,
  useParams as useNextParams,
  useSearchParams as useNextSearchParams,
} from 'next/navigation';

export type To = string | { pathname?: string; search?: string; hash?: string };

export interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
  preventScrollReset?: boolean;
  scroll?: boolean;
}

function toHref(to: To): string {
  if (typeof to === 'string') return to;
  const { pathname = '', search = '', hash = '' } = to;
  return `${pathname}${search}${hash}`;
}

/* ── Link ──────────────────────────────────────────────────────────────── */

export interface LinkProps
  extends Omit<React.ComponentPropsWithoutRef<'a'>, 'href'> {
  to: To;
  replace?: boolean;
  state?: unknown;
  reloadDocument?: boolean;
  prefetch?: boolean;
  scroll?: boolean;
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  function Link({ to, replace, state, reloadDocument, prefetch, ...rest }, ref) {
    void state;
    if (reloadDocument) {
      return <a ref={ref} href={toHref(to)} {...rest} />;
    }
    return (
      <NextLink
        ref={ref}
        href={toHref(to)}
        replace={replace}
        prefetch={prefetch}
        {...rest}
      />
    );
  },
);

/* ── NavLink ───────────────────────────────────────────────────────────── */

interface NavRenderState {
  isActive: boolean;
  isPending: boolean;
  isTransitioning: boolean;
}

export interface NavLinkProps
  extends Omit<LinkProps, 'className' | 'style' | 'children'> {
  end?: boolean;
  caseSensitive?: boolean;
  className?: string | ((s: NavRenderState) => string | undefined);
  style?: React.CSSProperties | ((s: NavRenderState) => React.CSSProperties | undefined);
  children?: React.ReactNode | ((s: NavRenderState) => React.ReactNode);
}

export const NavLink = React.forwardRef<HTMLAnchorElement, NavLinkProps>(
  function NavLink({ to, end, caseSensitive, className, style, children, ...rest }, ref) {
    const pathname = usePathname() || '/';
    const href = toHref(to);
    const a = caseSensitive ? pathname : pathname.toLowerCase();
    const b = caseSensitive ? href : href.toLowerCase();
    const isActive = end ? a === b : a === b || a.startsWith(b.endsWith('/') ? b : `${b}/`);
    const s: NavRenderState = { isActive, isPending: false, isTransitioning: false };
    const cls = typeof className === 'function' ? className(s) : className;
    const sty = typeof style === 'function' ? style(s) : style;
    const kids = typeof children === 'function' ? children(s) : children;
    return (
      <NextLink
        ref={ref}
        href={href}
        className={cls}
        style={sty}
        aria-current={isActive ? 'page' : undefined}
        {...rest}
      >
        {kids}
      </NextLink>
    );
  },
);

/* ── useNavigate ───────────────────────────────────────────────────────── */

export type NavigateFunction = {
  (to: To, options?: NavigateOptions): void;
  (delta: number): void;
};

export function useNavigate(): NavigateFunction {
  const router = useRouter();
  return React.useCallback(
    (to: To | number, options: NavigateOptions = {}) => {
      if (typeof to === 'number') {
        if (to < 0) router.back();
        else if (to > 0) router.forward();
        return;
      }
      const href = toHref(to);
      const scroll = options.scroll ?? !options.preventScrollReset;
      if (options.replace) router.replace(href, { scroll });
      else router.push(href, { scroll });
    },
    [router],
  ) as NavigateFunction;
}

/* ── useLocation ───────────────────────────────────────────────────────── */

export interface Location<S = unknown> {
  pathname: string;
  search: string;
  hash: string;
  state: S | null;
  key: string;
}

export function useLocation<S = unknown>(): Location<S> {
  const pathname = usePathname() || '/';
  // Read search/hash from the browser to avoid forcing a Suspense boundary on
  // every consumer (useSearchParams would). Reactive query params should use
  // the useSearchParams() tuple below.
  const [loc, setLoc] = React.useState(() => ({
    search: typeof window !== 'undefined' ? window.location.search : '',
    hash: typeof window !== 'undefined' ? window.location.hash : '',
  }));
  React.useEffect(() => {
    setLoc({
      search: typeof window !== 'undefined' ? window.location.search : '',
      hash: typeof window !== 'undefined' ? window.location.hash : '',
    });
  }, [pathname]);
  const state =
    typeof window !== 'undefined'
      ? ((window.history.state?.usr as S | undefined) ?? null)
      : null;
  return { pathname, search: loc.search, hash: loc.hash, state, key: 'default' };
}

/* ── useParams ─────────────────────────────────────────────────────────── */

export function useParams<
  T extends Record<string, string | undefined> = Record<string, string | undefined>,
>(): T {
  return (useNextParams() ?? {}) as T;
}

/* ── useSearchParams (react-router tuple API) ──────────────────────────── */

type SetURLSearchParams = (
  next:
    | URLSearchParams
    | Record<string, string | string[]>
    | string
    | ((prev: URLSearchParams) => URLSearchParams),
  options?: { replace?: boolean },
) => void;

export function useSearchParams(): [URLSearchParams, SetURLSearchParams] {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const nsp = useNextSearchParams();
  const current = React.useMemo(
    () => new URLSearchParams(nsp?.toString() ?? ''),
    [nsp],
  );

  const setSearchParams = React.useCallback<SetURLSearchParams>(
    (next, options = {}) => {
      const resolved =
        typeof next === 'function'
          ? next(new URLSearchParams(current))
          : next;
      const usp =
        resolved instanceof URLSearchParams
          ? resolved
          : new URLSearchParams(resolved as Record<string, string>);
      const qs = usp.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      if (options.replace) router.replace(href);
      else router.push(href);
    },
    [router, pathname, current],
  );

  return [current, setSearchParams];
}

/* ── Navigate (declarative redirect) ───────────────────────────────────── */

export function Navigate({
  to,
  replace,
  state,
}: {
  to: To;
  replace?: boolean;
  state?: unknown;
}): null {
  const router = useRouter();
  void state;
  React.useEffect(() => {
    const href = toHref(to);
    if (replace) router.replace(href);
    else router.push(href);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/* ── Outlet ────────────────────────────────────────────────────────────── */

const OutletContext = React.createContext<React.ReactNode>(null);
const OutletDataContext = React.createContext<unknown>(null);

/** Provided by Next layouts to feed nested route content into <Outlet/>. */
export function OutletProvider({
  outlet,
  context,
  children,
}: {
  outlet: React.ReactNode;
  context?: unknown;
  children: React.ReactNode;
}) {
  return (
    <OutletContext.Provider value={outlet}>
      <OutletDataContext.Provider value={context ?? null}>
        {children}
      </OutletDataContext.Provider>
    </OutletContext.Provider>
  );
}

export function Outlet({ context }: { context?: unknown } = {}): React.ReactElement {
  const node = React.useContext(OutletContext);
  if (context !== undefined) {
    return (
      <OutletDataContext.Provider value={context}>
        {node}
      </OutletDataContext.Provider>
    ) as React.ReactElement;
  }
  return <>{node}</> as React.ReactElement;
}

export function useOutletContext<T = unknown>(): T {
  return React.useContext(OutletDataContext) as T;
}

/* ── Inert router stubs (only App.tsx used these; Next owns routing) ────── */

export function BrowserRouter({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
export const HashRouter = BrowserRouter;
export const MemoryRouter = BrowserRouter;
export function Routes({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
export function Route(_: unknown): null {
  void _;
  return null;
}

/* ── Misc helpers occasionally imported ────────────────────────────────── */

export function generatePath(path: string, params: Record<string, string> = {}): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_, k) => encodeURIComponent(params[k] ?? ''));
}

export const useResolvedPath = (to: To) => {
  const href = toHref(to);
  const [pathname, rest = ''] = href.split('?');
  const [search, hash = ''] = rest.split('#');
  return { pathname, search: search ? `?${search}` : '', hash: hash ? `#${hash}` : '' };
};
