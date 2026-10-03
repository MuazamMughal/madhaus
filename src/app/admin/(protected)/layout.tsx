import { redirect } from "next/navigation";
import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { getStaffSession } from "@/lib/auth/session";
import { humanRole, roleHasPermission, type Permission } from "@/lib/auth/permissions";
import { Wordmark } from "@/components/ui/wordmark";

/**
 * Staff dashboard shell.
 *
 * This layout wraps only the PROTECTED admin routes. `/admin/sign-in` and
 * `/admin/sign-out` sit outside this group on purpose: a sign-in page inside a layout
 * that demands a session redirects to itself forever, and nobody can ever get in.
 *
 * The session is checked here, and again inside every page and action. This layout
 * decides what is worth putting in the navigation; it does not decide what a role is
 * allowed to do — that is `requirePermission`, on the server, per operation.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await getStaffSession();
  if (!session) redirect("/admin/sign-in?next=/admin");

  // Only show a link a role could actually use, so nobody is invited into a 403.
  const links = (
    [
      { href: "/admin", label: "Tonight", permission: "booking.view" },
      { href: "/admin/bookings", label: "Bookings", permission: "booking.view" },
      { href: "/admin/payments", label: "Payments", permission: "payment.verify" },
      { href: "/admin/pricing", label: "Rates", permission: "pricing.manage" },
      { href: "/admin/schedule", label: "Hours", permission: "schedule.manage" },
      { href: "/admin/menu", label: "Menu", permission: "menu.manage" },
      { href: "/admin/cafe", label: "Café", permission: "cafe.reservation.view" },
      { href: "/admin/inquiries", label: "Enquiries", permission: "booking.view" },
      { href: "/admin/reports", label: "Reports", permission: "report.view" },
      { href: "/admin/settings", label: "Settings", permission: "settings.manage" },
    ] as Array<{ href: string; label: string; permission: Permission }>
  ).filter((link) => roleHasPermission(session.role, link.permission));

  return (
    <div data-surface="dark" className="surface min-h-dvh">
      <div className="border-b border-charcoal-line">
        <div className="shell flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex items-baseline gap-4">
            <Link href="/admin">
              <Wordmark brandName="MadHaus" size="sm" />
            </Link>
            <span className="text-eyebrow font-display text-grey-400 uppercase">Operations</span>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className="text-grey-400">
              {session.name}{" "}
              <span className="text-grey-500">· {humanRole(session.role)}</span>
            </span>
            <form action="/admin/sign-out" method="post">
              <button
                type="submit"
                className="font-display text-xs uppercase underline decoration-lime decoration-2 underline-offset-4"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>

      <AdminNav links={links} />

      <div className="shell py-8">{children}</div>
    </div>
  );
}
