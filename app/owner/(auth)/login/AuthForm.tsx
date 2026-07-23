"use client";

import { useActionState } from "react";
import type { AuthState } from "./actions";

const field =
  "w-full rounded-xl border border-line bg-white px-4 py-3.5 text-[15px] font-medium text-ink outline-none transition-colors placeholder:font-normal placeholder:text-slate/60 focus:border-royal focus:ring-2 focus:ring-royal/15";

export function AuthForm({
  action,
  cta,
}: {
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  cta: string;
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-2.5">
      <input
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="vous@cafe.tn"
        className={field}
      />
      <input
        name="password"
        type="password"
        autoComplete="current-password"
        required
        placeholder="Mot de passe"
        className={field}
      />

      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-seal/40 bg-seal-soft px-3.5 py-2.5 text-[13px] font-semibold text-seal"
        >
          {state.error}
        </p>
      )}
      {state.notice && (
        <p
          role="status"
          className="rounded-xl border border-ok/40 bg-ok/10 px-3.5 py-2.5 text-[13px] font-semibold text-ok"
        >
          {state.notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="!mt-3.5 w-full rounded-xl bg-brand py-3.5 text-[12px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "· · ·" : cta}
      </button>
    </form>
  );
}
