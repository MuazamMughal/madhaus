import { requirePermission } from "@/lib/auth/permissions";
import { getProofScreenshot } from "@/server/payment-proof-service";

/**
 * The stored payment screenshot, for staff only.
 *
 * Served through a permission-checked route rather than as a public file: it is a
 * customer's payment record, and it lives in the database precisely so it is not sitting
 * on a CDN somewhere.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/admin/payments/proof/[id]">,
) {
  await requirePermission("payment.verify");

  const { id } = await context.params;
  const screenshot = await getProofScreenshot(id);
  if (!screenshot) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(screenshot.bytes), {
    headers: {
      "Content-Type": screenshot.mime,
      // Never cached by a shared proxy, never stored by the browser.
      "Cache-Control": "private, no-store",
      // Rendered inline for staff, but the browser is told not to sniff the type.
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
