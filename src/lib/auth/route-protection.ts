/**
 * Which routes require a staff session.
 *
 * Extracted from `proxy.ts` as a pure function so it can be tested directly. The bug this
 * exists to prevent: `/admin/sign-in` lives under `/admin`, so a naive `startsWith` check
 * protects the sign-in page itself — which then redirects to the sign-in page, forever,
 * and nobody can ever sign in.
 *
 * This is an optimistic gate, not an authorisation decision. It runs in the proxy, which
 * cannot reach the database, so all it can tell is whether a cookie is present. The real
 * check is `requirePermission()` inside every page and action.
 */

/** Under /admin, but reachable without a session. */
const PUBLIC_STAFF_ROUTES = new Set(["/admin/sign-in", "/admin/sign-out"]);

const STAFF_PREFIXES = ["/admin", "/studio"];

export function isStaffRoute(pathname: string): boolean {
  return STAFF_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function requiresStaffSession(pathname: string): boolean {
  if (PUBLIC_STAFF_ROUTES.has(pathname)) return false;
  return isStaffRoute(pathname);
}

/** Routes whose responses must never be cached or indexed. */
const PRIVATE_PREFIXES = ["/admin", "/studio", "/account", "/booking", "/book/checkout"];

export function isPrivateRoute(pathname: string): boolean {
  return PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
