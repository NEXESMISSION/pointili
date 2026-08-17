"use client";

import Link from "next/link";
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

  /*
    THE ADDRESS SURVIVES A REJECTION.

    React 19 resets a <form> once its action resolves, so a rejected sign-up
    came back with the e-mail box empty and the person retyped an address the
    server had just been told. The action echoes it back in state.email; local
    state wins the moment they touch the field again.
  */
  const shownEmail = email || state.email || "";

  return (
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-[12px] font-bold text-charcoal">E-mail</span>
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
          value={shownEmail}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@boutique.tn"
          className="a-field"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[12px] font-bold text-charcoal">Mot de passe</span>
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
            className="absolute inset-y-0 right-0 grid place-items-center px-4 text-[12px] font-bold uppercase tracking-[0.04em] text-[#5b3fd1]"
            aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {show ? "Cacher" : "Voir"}
          </button>
        </span>
        {passwordHint && (
          <span className="mt-1.5 block text-[12px] text-slate">{passwordHint}</span>
        )}
      </label>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-[#e5484d]/35 bg-[#e5484d]/12 px-3.5 py-2.5 text-[13px] font-semibold text-[#e5484d]"
        >
          {state.error}
          {/*
            AN ERROR THAT NAMES THE WAY OUT.

            "Cette adresse a déjà un compte" is a dead end on a sign-up screen
            unless it also says what to do about it. The link at the bottom of
            the card already existed; nobody reading a red box looks there.
          */}
          {state.signIn && (
            <>
              {" "}
              <Link href="/owner/login" className="underline underline-offset-2">
                Se connecter
              </Link>
            </>
          )}
        </p>
      )}
      {state.notice && (
        <p
          role="status"
          className="rounded-xl border border-[#2f9e6e]/35 bg-ok/10 px-3.5 py-2.5 text-[13px] font-semibold text-[#2f9e6e]"
        >
          {state.notice}
        </p>
      )}

      <button type="submit" disabled={pending} className="a-btn !mt-4 text-[15px]">
        {pending ? "· · ·" : cta}
      </button>
    </form>
  );
}
