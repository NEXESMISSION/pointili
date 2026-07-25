"use client";

import { useState, useActionState } from "react";
import { joinAction, type JoinState } from "./actions";

const initial: JoinState = {};

const field =
  "w-full rounded-xl border border-hair bg-white px-4 py-3.5 text-[16px] font-medium text-charcoal outline-none transition-colors placeholder:font-normal placeholder:text-slate/60 focus:border-royal focus:ring-2 focus:ring-royal/15";

/**
 * Join AND sign in, in one form.
 *
 * joinAction already does the right thing either way — a known phone+PIN signs
 * in, an unknown one creates the card — but a returning customer couldn't TELL
 * that from a page headed "choose a code". The toggle makes the login path
 * obvious and expected; both modes post to the same action.
 */
export function JoinForm({ slug }: { slug: string }) {
  const [returning, setReturning] = useState(false);
  // React 19 auto-resets an uncontrolled <form action={…}>, which wiped the
  // phone number too on a failed attempt. Keeping it controlled means a wrong
  // PIN only costs them the PIN.
  const [phone, setPhone] = useState("");
  const action = joinAction.bind(null, slug);
  const [state, formAction, pending] = useActionState(action, initial);

  const tab = (active: boolean) =>
    `rounded-xl py-2.5 text-[13px] font-bold transition ${
      active ? "bg-white text-royal shadow-sm" : "text-white/60"
    }`;

  return (
    <div>
      {/* new vs returning — so signing in is a first-class, obvious path */}
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-white/10 p-1">
        <button type="button" onClick={() => setReturning(false)} className={tab(!returning)}>
          Nouvelle carte
        </button>
        <button type="button" onClick={() => setReturning(true)} className={tab(returning)}>
          J&apos;ai déjà une carte
        </button>
      </div>

      <form action={formAction} className="space-y-2.5">
        {/* The declared mode must reach the server: on "J'ai déjà une carte" an
            unknown phone is a TYPO, and signing them into a brand-new empty
            account would orphan the card they were trying to reach. */}
        <input type="hidden" name="mode" value={returning ? "login" : "new"} />

        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Ton numéro"
          aria-label="Ton numéro de téléphone"
          className={field}
        />

        <input
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          required
          placeholder={returning ? "Ton code à 4 chiffres" : "Choisis un code à 4 chiffres"}
          aria-label="Code à 4 chiffres"
          className={field}
        />

        {/* only new cards ask a name — signing in doesn't need it */}
        {!returning && (
          <input
            name="name"
            type="text"
            autoComplete="given-name"
            placeholder="Ton prénom (optionnel)"
            aria-label="Ton prénom, optionnel"
            className={field}
          />
        )}

        {state.error && (
          <p
            role="alert"
            className="rounded-xl bg-seal-soft px-3.5 py-2.5 text-[13px] font-semibold text-seal"
          >
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="!mt-3.5 w-full rounded-xl bg-royal py-4 text-[15px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "…" : returning ? "Retrouver ma carte" : "Activer ma carte ✦"}
        </button>

        <p className="pt-0.5 text-center text-[12px] text-white/55">
          {returning
            ? "Entre le numéro et le code de ta carte."
            : "Ton code te servira à retrouver ta carte."}
        </p>
      </form>
    </div>
  );
}
