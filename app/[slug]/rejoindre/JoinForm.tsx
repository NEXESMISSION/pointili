"use client";

import { useState, useActionState } from "react";
import { joinAction, type JoinState } from "./actions";

const initial: JoinState = {};

/**
 * Join AND sign in, in one form.
 *
 * joinAction already does the right thing either way — a known phone+code signs
 * in, an unknown one creates the card — but a returning customer couldn't TELL
 * that from a page headed "choose a code". The toggle makes the login path
 * obvious and expected; both modes post to the same action.
 */
export function JoinForm({ slug }: { slug: string }) {
  const [returning, setReturning] = useState(false);
  // React 19 auto-resets an uncontrolled <form action={…}>, which wiped the
  // phone number too on a failed attempt. Keeping it controlled means a wrong
  // code only costs them the code.
  const [phone, setPhone] = useState("");
  const [showPin, setShowPin] = useState(false);
  const action = joinAction.bind(null, slug);
  const [state, formAction, pending] = useActionState(action, initial);

  const tab = (active: boolean) =>
    `rounded-xl py-2.5 text-[13px] font-bold transition ${
      active ? "bg-white/[0.16] text-white shadow-sm" : "text-white/50"
    }`;

  const label = "mb-2 block text-[13px] font-semibold text-white/80";
  const box =
    "w-full rounded-2xl border border-white/14 bg-white/[0.06] px-4 py-3.5 text-[16px] font-medium text-white outline-none transition-colors placeholder:font-normal placeholder:text-white/30 focus:border-[#8b6bff] focus:bg-white/[0.09]";

  return (
    <div>
      {/* new vs returning — so signing in is a first-class, obvious path */}
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.07] p-1">
        <button type="button" onClick={() => setReturning(false)} className={tab(!returning)}>
          Nouveau compte
        </button>
        <button type="button" onClick={() => setReturning(true)} className={tab(returning)}>
          J&apos;ai déjà un compte
        </button>
      </div>

      <form action={formAction} className="space-y-4">
        {/* The declared mode must reach the server: on "J'ai déjà un compte" an
            unknown phone is a TYPO, and signing them into a brand-new empty
            account would orphan the card they were trying to reach. */}
        <input type="hidden" name="mode" value={returning ? "login" : "new"} />

        <div>
          <label htmlFor="phone" className={label}>
            Numéro de téléphone
          </label>
          {/*
            The +216 is fixed furniture, not something to type.

            normalisePhone only prepends the country code when the local part is
            8 digits or fewer, so a diner who helpfully typed "+216 25 123 456"
            and one who typed "25 123 456" could become two different people.
            Showing the prefix makes the 8-digit local number the only thing on
            offer.
          */}
          <div className="flex items-stretch gap-2">
            <span className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-white/14 bg-white/[0.06] px-3 text-[15px] font-semibold text-white/80">
              <span aria-hidden>🇹🇳</span>
              +216
            </span>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="25 123 456"
              className={`${box} tracking-[0.04em]`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="pin" className={label}>
            {returning ? "Ton code secret" : "Choisis un code secret"}
          </label>
          <div className="relative">
            <input
              id="pin"
              name="pin"
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              placeholder="••••"
              aria-label="Code secret à 4 chiffres"
              className={`${box} pr-16 tracking-[0.4em]`}
            />
            {/*
              A reveal toggle, because this code is INVENTED here and never
              confirmed — you are signed in immediately, so a typo does not
              surface until the day you try to sign in on another phone, and
              nothing can recover it for you.
            */}
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              className="absolute inset-y-0 right-0 px-4 text-[11px] font-bold uppercase tracking-[0.06em] text-white/50"
            >
              {showPin ? "Cacher" : "Voir"}
            </button>
          </div>
          <p className="mt-2 text-[12px] leading-snug text-white/45">
            {returning
              ? "Le code que tu as choisi en créant ton compte."
              : "Garde-le : c'est lui qui te rendra tes cartes sur un autre téléphone."}
          </p>
        </div>

        {/* only new accounts ask a name — signing in doesn't need it */}
        {!returning && (
          <div>
            <label htmlFor="name" className={label}>
              Ton prénom <span className="font-normal text-white/40">(optionnel)</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="given-name"
              placeholder="Karim"
              className={box}
            />
          </div>
        )}

        {state.error && (
          <p
            role="alert"
            className="rounded-2xl border border-[#ff6b6b]/35 bg-[#ff6b6b]/12 px-4 py-3 text-[13px] font-semibold text-[#ff9a9a]"
          >
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="!mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6d4ae6] py-4 text-[15.5px] font-bold text-white shadow-[0_16px_36px_-14px_rgba(109,74,230,.9)] transition active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "· · ·" : returning ? "Retrouver mes cartes" : "Créer mon compte"}
          {!pending && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
        </button>

        {!returning && (
          /* Plain text, not a link: there is no terms page yet, and a link to
             nothing is the same defect as the dead social icons just removed
             from the landing. It becomes a link the day the page exists. */
          <p className="pt-0.5 text-center text-[11.5px] leading-relaxed text-white/35">
            En continuant, tu acceptes nos conditions d&apos;utilisation.
          </p>
        )}
      </form>
    </div>
  );
}
