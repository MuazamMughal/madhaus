import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE } from "@/lib/auth/session";
import { isPrivateRoute, requiresStaffSession } from "@/lib/auth/route-protection";

/**
 * Proxy (what earlier Next.js versions called middleware).
 *
 * This does ONE thing: bounce obviously-unauthenticated requests away from /admin and
 * /studio before they render, and set security headers. It is an optimistic check on the
 * presence of a cookie, not an authorisation decision -- it cannot reach the database,
 * and a cookie's existence proves nothing about whether the session is valid, unexpired,
 * or attached to an account that is still active.
 *
 * The real check is `requirePermission()` inside every page and action. If this file were
 * deleted, nothing would become accessible that is not already protected.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // The rule lives in lib/auth/route-protection so it can be unit tested. Sign-in and
  // sign-out are under /admin but deliberately NOT protected.
  const hasStaffCookie = request.cookies.has(STAFF_COOKIE);

  if (requiresStaffSession(pathname) && !hasStaffCookie) {
    const signIn = new URL("/admin/sign-in", request.url);
    // Bring them back where they were going once they are in.
    signIn.searchParams.set("next", pathname);
    return applySecurityHeaders(NextResponse.redirect(signIn), pathname);
  }

  // Pass the path through so server code can build an accurate post-sign-in return
  // link. Request headers are not reachable from a Server Component otherwise.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  return applySecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    pathname,
  );
}

function applySecurityHeaders(response: NextResponse, pathname: string): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );

  // A customer's booking page and the staff area must never be stored by a shared cache
  // or reachable through the back button on a shared machine.
  if (isPrivateRoute(pathname)) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  return response;
}

export const config = {
  // Everything except static assets and Next's own internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|avif|ico|woff2?)$).*)"],
};
