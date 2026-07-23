"use client";

import { useActionState } from "react";
import { joinAction, type JoinState } from "./actions";

const initial: JoinState = {};

const field =
  "w-full rounded-xl border border-hair bg-white px-4 py-3.5 text-[16px] font-medium text-charcoal outline-none transition-colors placeholder:font-normal placeholder:text-slate/60 focus:border-royal focus:ring-2 focus:ring-royal/15";

export function JoinForm({ slug }: { slug: string }) {
  const action = joinAction.bind(null, slug);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-2.5">
      <input
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
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
        placeholder="Choisis un code à 4 chiffres"
        aria-label="Code à 4 chiffres"
        className={field}
      />

      <input
        name="name"
        type="text"
        autoComplete="given-name"
        placeholder="Ton prénom (optionnel)"
        aria-label="Ton prénom, optionnel"
        className={field}
      />

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
        {pending ? "…" : "Activer ma carte ✦"}
      </button>

      <p className="pt-0.5 text-center text-[12px] text-slate">
        Ton code te servira à retrouver ta carte.
      </p>
    </form>
  );
}
