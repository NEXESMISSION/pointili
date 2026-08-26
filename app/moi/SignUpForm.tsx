"use client";

import { useActionState } from "react";
import { signUpAction, type SignUpState } from "./actions";
import { translator, type Lang } from "@/lib/dict";

/* The same field and the same button as the sign-in form beside it and as
   /[slug]/rejoindre — three doors into one product must not look like three
   products. */
const field =
  "w-full rounded-xl border border-hair bg-white px-4 py-3.5 text-[16px] font-medium text-charcoal outline-none transition-colors placeholder:font-normal placeholder:text-slate/60 focus:border-royal focus:ring-2 focus:ring-royal/15";

/**
 * Three fields, and the third one is optional.
 *
 * A number, a secret code, and a first name so a cashier can greet them by it.
 * Nothing else: an address, an email or a birthday would each be a reason to
 * abandon a form somebody is filling in on a phone because they heard about
 * this thirty seconds ago.
 */
export function SignUpForm({ lang = "fr" }: { lang?: Lang }) {
  const t = translator(lang);
  const [state, action, pending] = useActionState<SignUpState, FormData>(signUpAction, {});

  return (
    <form action={action} className="space-y-2.5">
      <label className="block">
        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-slate">
          {t("Ton numéro")}
        </span>
        {/* dir=ltr: a phone number is a left-to-right string wherever it is
            typed, and an RTL field puts the caret and the digits the wrong way
            round while somebody is entering it. */}
        <input
          name="phone"
          type="tel"
          dir="ltr"
          inputMode="tel"
          autoComplete="tel"
          required
          defaultValue={state.phone ?? ""}
          placeholder="20 123 456"
          className={field}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-slate">
          {t("Ton prénom")}
        </span>
        <input
          name="name"
          type="text"
          autoComplete="given-name"
          maxLength={40}
          defaultValue={state.name ?? ""}
          placeholder={t("Comme au comptoir")}
          className={field}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-slate">
          {t("Choisis un code secret")}
        </span>
        <input
          name="pin"
          type="password"
          dir="ltr"
          inputMode="numeric"
          /* new-password, not current-password: this one is being CHOSEN, and a
             manager offering to fill it with an existing entry is offering the
             wrong thing. */
          autoComplete="new-password"
          pattern="\d{4}"
          maxLength={4}
          required
          placeholder="••••"
          className={`${field} text-center tracking-[0.5em]`}
        />
        <span className="mt-1.5 block text-[11.5px] leading-snug text-slate">
          {t("4 chiffres. C'est lui qui te rend tes points sur un autre téléphone.")}
        </span>
      </label>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-seal/25 bg-seal-soft px-3.5 py-2.5 text-[13px] font-semibold text-seal"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="!mt-4 w-full rounded-xl py-4 text-[14px] font-bold transition active:scale-[0.98] disabled:opacity-60"
        style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
      >
        {pending ? "· · ·" : t("Créer mon compte ✦")}
      </button>
    </form>
  );
}
