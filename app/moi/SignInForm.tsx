"use client";

import { useActionState } from "react";
import { signInAction, type SignInState } from "./actions";
import { translator, type Lang } from "@/lib/dict";

/* Same field + button as /[slug]/rejoindre — a diner must recognise this as the
   same door, not a second product. */
const field =
  "w-full rounded-xl border border-hair bg-white px-4 py-3.5 text-[16px] font-medium text-charcoal outline-none transition-colors placeholder:font-normal placeholder:text-slate/60 focus:border-royal focus:ring-2 focus:ring-royal/15";

export function SignInForm({ lang = "fr" }: { lang?: Lang }) {
  const t = translator(lang);
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, {});

  return (
    <form action={action} className="space-y-2.5">
      <label className="block">
        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-slate">
          {t("Ton numéro")}
        </span>
        {/* dir=ltr: a phone number is a left-to-right string wherever it is
            typed, and an RTL field puts the caret and the digits the wrong
            way round while somebody is entering it. */}
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
          {t("Ton code secret")}
        </span>
        <input
          name="pin"
          type="password"
          dir="ltr"
          inputMode="numeric"
          autoComplete="current-password"
          pattern="\d{4}"
          maxLength={4}
          required
          placeholder="••••"
          className={`${field} text-center tracking-[0.5em]`}
        />
      </label>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-seal/25 bg-seal-soft px-3.5 py-2.5 text-[13px] font-semibold text-seal"
        >
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="!mt-4 w-full rounded-xl py-4 text-[14px] font-bold transition active:scale-[0.98] disabled:opacity-60"
        style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}>
        {pending ? "· · ·" : t("Voir mes cartes ✦")}
      </button>
    </form>
  );
}
