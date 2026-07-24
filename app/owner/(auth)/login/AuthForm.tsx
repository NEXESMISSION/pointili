"use client";

import { useActionState, useState } from "react";
import type { AuthState } from "./actions";

export function AuthForm({
  action,
  cta,
  passwordAutoComplete = "current-password",
  passwordHint,
}: {
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  cta: string;
  passwordAutoComplete?: "current-password" | "new-password";
  passwordHint?: string;
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});
  const [show, setShow] = useState(false);

  return (
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-bold text-charcoal">E-mail</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="vous@boutique.tn"
          className="o-field"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-bold text-charcoal">Mot de passe</span>
        <span className="relative block">
          <input
            name="password"
            type={show ? "text" : "password"}
            autoComplete={passwordAutoComplete}
            required
            placeholder="••••••••"
            className="o-field pr-16"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 grid place-items-center px-4 text-[11.5px] font-bold uppercase tracking-[0.04em] text-royal"
            aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {show ? "Cacher" : "Voir"}
          </button>
        </span>
        {passwordHint && (
          <span className="mt-1.5 block text-[11.5px] text-slate">{passwordHint}</span>
        )}
      </label>

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

      <button type="submit" disabled={pending} className="o-btn !mt-4 text-[14px]">
        {pending ? "· · ·" : cta}
      </button>
    </form>
  );
}
