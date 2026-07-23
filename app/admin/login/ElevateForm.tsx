"use client";

import { useActionState } from "react";
import { elevateAction, type ElevateState } from "./actions";

export function ElevateForm() {
  const [state, action, pending] = useActionState<ElevateState, FormData>(
    elevateAction,
    {},
  );

  return (
    <form action={action} className="space-y-2.5">
      <input
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        placeholder="Votre mot de passe"
        className="w-full rounded-xl border border-hair bg-white px-4 py-3.5 text-[15px] font-medium text-charcoal outline-none focus:border-royal focus:ring-2 focus:ring-royal/20"
      />

      {state.error && (
        <p role="alert" className="rounded-xl bg-[#fdecec] px-3.5 py-2.5 text-[13px] font-semibold text-[#c0341c]">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="!mt-3.5 w-full rounded-xl bg-royal py-3.5 text-[15px] font-bold text-white shadow-[0_12px_28px_-10px_rgba(91,63,209,.6)] transition active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "· · ·" : "Déverrouiller la console"}
      </button>
    </form>
  );
}
