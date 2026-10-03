"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { pool } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { startStaffSession } from "@/lib/auth/session";
import { landingPathForRole } from "@/lib/auth/permissions";
import { checkRateLimit } from "@/server/rate-limit";

const schema = z.object({
  email: z.string().trim().min(3).max(200),
  password: z.string().min(1).max(200),
  next: z.string().trim().max(200).optional(),
});

export interface SignInState {
  error?: string;
}

/**
 * Staff sign-in.
 *
 * Rate limited per client AND per account, so neither a single attacker nor a
 * distributed one gets unlimited attempts at one mailbox. The failure message is the same
 * whether the email exists or the password was wrong, and a dummy hash is verified when
 * the account does not exist so the response takes the same time either way.
 */
export async function signInAction(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter your email and password." };

  const forwarded = (await headers()).get("x-forwarded-for") ?? "unknown";
  const ip = forwarded.split(",")[0].trim();

  const byIp = await checkRateLimit(`signin:ip:${ip}`, { tokens: 10, windowSeconds: 900 });
  const byAccount = await checkRateLimit(`signin:acct:${parsed.data.email.toLowerCase()}`, {
    tokens: 8,
    windowSeconds: 900,
  });
  if (!byIp.allowed || !byAccount.allowed) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }

  const { rows } = await pool().query(
    "SELECT id, password_hash, role, is_active FROM staff_users WHERE lower(email) = lower($1)",
    [parsed.data.email],
  );

  const user = rows[0];
  // Always do the work, so a missing account and a wrong password take the same time.
  const storedHash =
    user?.password_hash ??
    "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
  const passwordOk = await verifyPassword(parsed.data.password, storedHash);

  if (!user || !user.is_active || !passwordOk) {
    // One message for every failure: never confirm whether an account exists.
    return { error: "That email and password do not match an active account." };
  }

  await startStaffSession(user.id);

  // Only ever redirect within this site: an open redirect here would be a phishing gift.
  const next = parsed.data.next;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  redirect(safeNext ?? landingPathForRole(user.role));
}
