"use client";

import { useActionState, useState, type ReactNode } from "react";
import { CheckIcon, Sparkle } from "@/components/icons";
import {
  collectAction,
  creditAction,
  peekAction,
  type CollectState,
  type CreditState,
  type PeekState,
} from "./actions";

export function CreditForm({ pointsPerTnd }: { pointsPerTnd: number }) {
  const [state, formAction, pending] = useActionState<CreditState, FormData>(
    creditAction,
    {},
  );

  return (
    <section className="rounded-xl border border-line bg-paper2 p-4">
      <h2 className="font-display text-[18px] font-black text-ink">
        Créditer des points
      </h2>
      <p className="mt-0.5 text-[12px] text-mut">
        {pointsPerTnd} point{pointsPerTnd > 1 ? "s" : ""} par dinar dépensé.
      </p>

      <form action={formAction} className="mt-3 space-y-2.5">
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          required
          placeholder="Numéro du client"
          className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-slate/60 focus:border-royal focus:ring-2 focus:ring-royal/15"
        />
        <input
          name="amount"
          type="text"
          inputMode="decimal"
          required
          placeholder="Montant en TND"
          className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-slate/60 focus:border-royal focus:ring-2 focus:ring-royal/15"
        />
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-brand py-3 text-[12px] font-bold text-white active:scale-95 disabled:opacity-60"
        >
          {pending ? "· · ·" : "Créditer ✦"}
        </button>
      </form>

      {state.error && (
        <p role="alert" className="mt-2 rounded-lg bg-[#FBE9E4] px-3 py-2 text-[12.5px] font-semibold text-seal">
          {state.error}
        </p>
      )}

      {state.ok && (
        <div role="status" className="mt-3 rounded-xl bg-brand-soft px-4 py-3 text-center">
          <p className="font-display text-[30px] font-black leading-none text-brand">
            +{state.ok.earned}
          </p>
          <p className="mt-1 text-[12px] font-semibold text-ink2">
            points crédités à {state.ok.phone}
          </p>
          {state.ok.welcome > 0 && (
            <p className="mt-1 flex items-center justify-center gap-1 text-[12px] font-bold text-gold">
              <Sparkle className="h-3.5 w-3.5" />+ {state.ok.welcome} points de
              bienvenue
            </p>
          )}
          <p className="mt-1 font-mono text-[11px] text-mut">
            nouveau solde : {state.ok.balance} pts
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * The counter code flow, in two deliberate steps: look up a code (read-only, so
 * a diner can just SHOW it), then decide whether to collect it. Nothing is
 * served until staff explicitly hits "Collecter".
 *
 * Remounting on reset (via a bumped key) is the simplest clean way to clear both
 * action states between codes.
 */
function CodeShell({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-paper2 p-4">
      <h2 className="font-display text-[18px] font-black text-ink">Valider un code</h2>
      {children}
    </section>
  );
}

export function ValidateForm() {
  const [resetKey, setResetKey] = useState(0);
  return (
    <ValidateInner key={resetKey} onReset={() => setResetKey((k) => k + 1)} />
  );
}

const STATUS_MSG: Record<"expired" | "claimed", string> = {
  expired: "Ce code a expiré.",
  claimed: "Ce code a déjà été utilisé.",
};

function ValidateInner({ onReset }: { onReset: () => void }) {
  const [peekState, peekForm, peeking] = useActionState<PeekState, FormData>(peekAction, {});
  const [collectState, collectForm, collecting] = useActionState<CollectState, FormData>(collectAction, {});

  // ── collected ───────────────────────────────────────────────
  if (collectState.ok) {
    return (
      <CodeShell>
        <div role="status" className="mt-3 rounded-xl bg-[#E6F4EC] px-4 py-3 text-center">
          <CheckIcon className="mx-auto h-6 w-6 text-ok" />
          <p className="mt-1 text-[14px] font-bold text-ok">{collectState.ok.label}</p>
          <p className="font-mono text-[11px] text-mut">{collectState.ok.code} — collecté</p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="mt-3 w-full rounded-xl border border-line py-2.5 text-[12px] font-bold text-ink2 active:scale-95"
        >
          Nouveau code
        </button>
      </CodeShell>
    );
  }

  // ── looked up: show it, then collect or not ─────────────────
  const peek = peekState.peek;
  if (peek) {
    const valid = peek.status === "valid";
    return (
      <CodeShell>
        <div className={`mt-3 rounded-xl px-4 py-3 text-center ${valid ? "bg-brand-soft" : "bg-[#FBE9E4]"}`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-mut">
            {peek.kind === "win" ? "Gain à la roue" : "Récompense"}
          </p>
          <p className={`mt-0.5 text-[16px] font-bold ${valid ? "text-brand" : "text-seal"}`}>
            {peek.label}
          </p>
          <p className="font-mono text-[11px] text-mut">{peek.code}</p>
          {!valid && (
            <p className="mt-1 text-[12.5px] font-semibold text-seal">
              {STATUS_MSG[peek.status as "expired" | "claimed"]}
            </p>
          )}
        </div>

        {valid ? (
          <div className="mt-3 space-y-2">
            <form action={collectForm}>
              <input type="hidden" name="code" value={peek.code} />
              <button
                type="submit"
                disabled={collecting}
                className="w-full rounded-xl bg-brand py-3 text-[12px] font-bold text-white active:scale-95 disabled:opacity-60"
              >
                {collecting ? "· · ·" : "Collecter ✦"}
              </button>
            </form>
            <button
              type="button"
              onClick={onReset}
              className="w-full rounded-xl border border-line py-2.5 text-[12px] font-bold text-ink2 active:scale-95"
            >
              Annuler
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onReset}
            className="mt-3 w-full rounded-xl border border-line py-2.5 text-[12px] font-bold text-ink2 active:scale-95"
          >
            Nouveau code
          </button>
        )}

        {collectState.error && (
          <p role="alert" className="mt-2 rounded-lg bg-[#FBE9E4] px-3 py-2 text-[12.5px] font-semibold text-seal">
            {collectState.error}
          </p>
        )}
      </CodeShell>
    );
  }

  // ── initial: enter a code and look it up ────────────────────
  return (
    <CodeShell>
      <p className="mt-0.5 text-[12px] text-mut">
        Le client montre son code — vérifiez-le, puis collectez-le.
      </p>
      <form action={peekForm} className="mt-3 space-y-2.5">
        <input
          name="code"
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          maxLength={6}
          required
          placeholder="A1B2C3"
          className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-center text-[20px] font-bold outline-none placeholder:tracking-[0.15em] placeholder:text-slate/50 focus:border-royal focus:ring-2 focus:ring-royal/15"
        />
        <button
          type="submit"
          disabled={peeking}
          className="w-full rounded-xl border border-brand py-3 text-[12px] font-bold text-brand active:scale-95 disabled:opacity-60"
        >
          {peeking ? "· · ·" : "Vérifier"}
        </button>
      </form>

      {peekState.error && (
        <p role="alert" className="mt-2 rounded-lg bg-[#FBE9E4] px-3 py-2 text-[12.5px] font-semibold text-seal">
          {peekState.error}
        </p>
      )}
    </CodeShell>
  );
}
