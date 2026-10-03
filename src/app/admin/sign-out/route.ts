import { redirect } from "next/navigation";
import { endStaffSession } from "@/lib/auth/session";

/**
 * Sign out.
 *
 * POST only. A GET sign-out can be triggered by any image tag on any page, which makes it
 * a cross-site request forgery that logs people out at will.
 */
export async function POST() {
  await endStaffSession();
  redirect("/admin/sign-in");
}
