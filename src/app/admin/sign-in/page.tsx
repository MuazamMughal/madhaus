import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/admin/sign-in-form";
import { Wordmark } from "@/components/ui/wordmark";
import { getStaffSession } from "@/lib/auth/session";
import { landingPathForRole } from "@/lib/auth/permissions";
import { getSiteSettings } from "@/lib/content";

export const metadata: Metadata = {
  title: "Staff sign in",
  robots: { index: false, follow: false },
};

export default async function SignInPage({ searchParams }: PageProps<"/admin/sign-in">) {
  const session = await getStaffSession();
  if (session) redirect(landingPathForRole(session.role));

  const params = await searchParams;
  const next = Array.isArray(params.next) ? params.next[0] : params.next;
  const settings = await getSiteSettings();

  return (
    <div data-surface="dark" className="surface flex min-h-dvh items-center">
      <div className="shell mx-auto w-full max-w-md py-16">
        <Wordmark brandName={settings.brandName} size="lg" />
        <h1 className="text-headline mt-8">Staff sign in</h1>
        <p className="mt-3 text-sm text-grey-400">
          For venue staff. Customers do not need an account to book.
        </p>

        <div className="mt-10">
          <SignInForm next={next ?? null} />
        </div>
      </div>
    </div>
  );
}
