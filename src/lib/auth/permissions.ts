import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStaffSession, type StaffRole, type StaffSession } from "./session";

/**
 * Role permissions.
 *
 * Checked on the server for every protected operation. The dashboard also hides controls
 * a role cannot use, but that is presentation: a Server Action is a POST endpoint that
 * anyone signed in can aim at, so `requirePermission` is what actually decides.
 */

export const PERMISSIONS = [
  // Arena
  "booking.view",
  "booking.create",
  /** Deciding whether a customer's request can actually have the slot. */
  "booking.approve",
  "booking.reschedule",
  "booking.cancel",
  "booking.checkin",
  "maintenance.manage",
  "pricing.manage",
  "schedule.manage",
  // Café
  "cafe.reservation.view",
  "cafe.reservation.decide",
  "cafe.order.view",
  "cafe.order.decide",
  "menu.manage",
  // Money
  "payment.verify",
  "payment.refund",
  "report.view",
  "report.export",
  // Admin
  "content.edit",
  "staff.manage",
  "settings.manage",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  // Everything, including the things that move money and change who can sign in.
  owner: PERMISSIONS,

  arena_manager: [
    "booking.view",
    "booking.create",
    "booking.approve",
    "booking.reschedule",
    "booking.cancel",
    "booking.checkin",
    "maintenance.manage",
    "pricing.manage",
    "schedule.manage",
    "payment.verify",
    "report.view",
  ],

  cafe_manager: [
    "cafe.reservation.view",
    "cafe.reservation.decide",
    "cafe.order.view",
    "cafe.order.decide",
    "menu.manage",
    "booking.view", // needs to see which court an add-on order belongs to
    "report.view",
  ],

  content_editor: ["content.edit"],

  // The front desk: take bookings and check people in, but not issue refunds or
  // change prices.
  reception: [
    "booking.view",
    "booking.create",
    // Reception answers the phone and knows what is actually on the courts tonight, so
    // they are trusted to accept or decline a request.
    "booking.approve",
    "booking.checkin",
    "cafe.reservation.view",
    "cafe.order.view",
  ],
};

export function roleHasPermission(role: StaffRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function sessionHasPermission(
  session: StaffSession | null,
  permission: Permission,
): boolean {
  return session !== null && roleHasPermission(session.role, permission);
}

export class AuthorisationError extends Error {
  readonly status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "AuthorisationError";
    this.status = status;
  }
}

/**
 * Gate a protected operation.
 *
 * Two different failures, handled differently on purpose:
 *
 *   - **No valid session.** Not an error, just someone whose session lapsed. They are
 *     redirected to sign in and returned to where they were going. Showing an error page
 *     here would be unhelpful every time a twelve-hour session expires mid-shift.
 *   - **Signed in, wrong role.** A genuine 403. It throws, and the admin error boundary
 *     explains which role would be needed.
 *
 * It throws or redirects rather than returning a boolean, so forgetting to check the
 * result cannot quietly become a security hole.
 */
export async function requirePermission(permission: Permission): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect(await signInPath());

  if (!roleHasPermission(session.role, permission)) {
    throw new AuthorisationError(
      403,
      `Your role (${humanRole(session.role)}) cannot do that. Ask an owner if you need access.`,
    );
  }
  return session;
}

export async function requireStaff(): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect(await signInPath());
  return session;
}

/** Sign-in URL carrying a safe return path, read from the header the proxy sets. */
async function signInPath(): Promise<string> {
  const pathname = (await headers()).get("x-pathname");
  // Only ever an internal path: an open redirect here would be a phishing gift.
  const safe = pathname && pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : null;
  return safe ? `/admin/sign-in?next=${encodeURIComponent(safe)}` : "/admin/sign-in";
}

export function humanRole(role: StaffRole): string {
  const labels: Record<StaffRole, string> = {
    owner: "Owner",
    arena_manager: "Arena manager",
    cafe_manager: "Café manager",
    content_editor: "Content editor",
    reception: "Reception",
  };
  return labels[role];
}

/** Where a role should land after signing in, based on what it can actually do. */
export function landingPathForRole(role: StaffRole): string {
  if (role === "cafe_manager") return "/admin/cafe";
  if (role === "content_editor") return "/studio";
  return "/admin";
}
