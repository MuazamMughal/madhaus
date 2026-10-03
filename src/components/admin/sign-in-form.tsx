"use client";

import { useActionState } from "react";
import { signInAction, type SignInState } from "@/app/admin/sign-in/actions";
import { Button } from "@/components/ui/button";

export function SignInForm({ next }: { next: string | null }) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signInAction, {});

  return (
    <form action={formAction} className="space-y-5">
      {next && <input type="hidden" name="next" value={next} />}

      {state.error && (
        <div role="alert" className="border-l-4 border-negative bg-charcoal-raised p-4 text-sm">
          <p className="text-negative">
            <span aria-hidden="true">⚠ </span>
            {state.error}
          </p>
        </div>
      )}

      <div>
        <label htmlFor="email" className="text-eyebrow font-display mb-2 block uppercase">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="min-h-12 w-full border border-charcoal-line bg-transparent px-3 text-base focus:border-lime"
        />
      </div>

      <div>
        <label htmlFor="password" className="text-eyebrow font-display mb-2 block uppercase">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="min-h-12 w-full border border-charcoal-line bg-transparent px-3 text-base focus:border-lime"
        />
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
