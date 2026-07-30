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
  /*
    React 19 resets an uncontrolled <form action={…}> after every submit — so a
    mistyped password also wiped the e-mail, and the owner had to retype both.
    Keeping the e-mail controlled means a wrong password costs only the password.
    (The same fix is on the diner join form for the same reason.)
  */
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-bold text-white">E-mail</span>
        {/*
          autoCapitalize / autoCorrect / spellCheck are not optional here.

          A phone keyboard capitalises the first letter and autocorrects the rest,
          so "elmanar@pointili.online" is offered back as "Elmanar@pointili.online"
          and an unfamiliar word like a shop's name gets "helpfully" rewritten.
          The account is then reported as a wrong password, which is the one error
          message that makes somebody give up rather than retry.

          type="email" alone does NOT prevent this — it only changes the key
          layout, and several Android keyboards still capitalise inside it.
        */}
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@boutique.tn"
          className="a-field"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-bold text-white">Mot de passe</span>
        <span className="relative block">
          <input
            name="password"
            type={show ? "text" : "password"}
            autoComplete={passwordAutoComplete}
            /* Once "Voir" flips this to type="text" it becomes an ordinary field
               again — and an ordinary field gets autocapitalised and
               autocorrected. Someone checking their typing must not have it
               changed under them. */
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            placeholder="••••••••"
            className="a-field pr-16"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 grid place-items-center px-4 text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#b9a3ff]"
            aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {show ? "Cacher" : "Voir"}
          </button>
        </span>
        {passwordHint && (
          <span className="mt-1.5 block text-[11.5px] text-white/55">{passwordHint}</span>
        )}
      </label>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-[#ff6b6b]/35 bg-[#ff6b6b]/12 px-3.5 py-2.5 text-[13px] font-semibold text-[#ff9a9a]"
        >
          {state.error}
        </p>
      )}
      {state.notice && (
        <p
          role="status"
          className="rounded-xl border border-[#7ff0b0]/35 bg-ok/10 px-3.5 py-2.5 text-[13px] font-semibold text-[#7ff0b0]"
        >
          {state.notice}
        </p>
      )}

      <button type="submit" disabled={pending} className="a-btn !mt-4 text-[14px]">
        {pending ? "· · ·" : cta}
      </button>
    </form>
  );
}
