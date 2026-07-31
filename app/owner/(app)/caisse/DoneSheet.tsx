"use client";

import { useEffect } from "react";
import { CheckIcon } from "@/components/icons";

/**
 * The receipt, for the one action a shop performs hundreds of times a week.
 *
 * The confirmation used to be a green line inside the panel: "+60 points ·
 * nouveau solde 70 points". Correct, and almost invisible — a cashier holding a
 * cup, at arm's length, mid-queue, could not tell at a glance whether the sale
 * had gone through. That uncertainty is what makes someone credit twice.
 *
 * So it is a sheet: it covers the till, it says the number in the largest type
 * on the screen, and it names the customer so a mis-scan is obvious immediately
 * rather than at the end of the shift.
 *
 * THE LINE THAT MATTERS MOST IS "PEUT PRENDRE MAINTENANT". Crossing a reward
 * threshold is the whole point of a loyalty scheme, and it happens while the
 * customer is still standing at the counter. Nothing told the cashier, so
 * nobody said it, and the customer found out days later on their own phone —
 * if ever. Naming it here turns a receipt into the moment the product pays for
 * itself.
 *
 * IT MUST NEVER BE IN THE WAY. It closes on any tap, on Escape, and on its own
 * after four seconds; the queue does not wait for an animation. Undo stays
 * reachable underneath either way — this sheet is the loud version, not the
 * only version.
 */

export type Done =
  | {
      kind: "credit";
      who: string;
      earned: number;
      welcome: number;
      balance: number;
      amount: number;
      unlocked: string[];
      next: { label: string; needed: number } | null;
      onUndo?: () => void;
    }
  | {
      kind: "stamp";
      who: string;
      count: number;
      required: number;
      completed: boolean;
      /** The voucher code, when this stamp filled the card. */
      code: string | null;
      label: string;
    };

export function DoneSheet({ done, onClose }: { done: Done; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const filled = done.kind === "stamp" && done.completed;

  return (
    <div
      /*
        aria-live WITHOUT role="status". The flash line underneath is already the
        page's status region, and two live regions announcing the same sale means
        a screen reader says it twice — and it left two [role="status"] nodes in
        the DOM, which is also what the till's own e2e reads to check a credit.
        One announcement, one status node, both still correct.
      */
      aria-live="polite"
      onClick={onClose}
      className="done-veil fixed inset-0 z-50 flex items-end justify-center bg-black/72 px-3 pb-5 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="done-sheet w-full max-w-[420px] rounded-3xl border border-white/12 bg-[#161029] p-5 text-center text-white shadow-[0_-10px_50px_-12px_rgba(0,0,0,.9)]"
      >
        <span className="done-tick mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#7ff0b0] text-[#062b18]">
          <CheckIcon className="h-8 w-8" />
        </span>

        {done.kind === "credit" ? (
          <>
            <p className="mt-3.5 text-[40px] font-extrabold leading-none tabular-nums text-[#7ff0b0]">
              +{done.earned}
              <span className="ml-1.5 align-middle text-[15px] font-bold text-white/50">points</span>
            </p>
            {done.welcome > 0 && (
              <p className="mt-1 text-[12.5px] font-bold text-[#ffd27a]">
                dont +{done.welcome} de bienvenue
              </p>
            )}
            <p className="mt-1.5 truncate text-[15px] font-bold">{done.who}</p>

            {/* the two numbers a cashier is asked to repeat out loud */}
            <div className="mt-4 grid grid-cols-2 gap-2 text-left">
              <Fact label="Montant" value={`${fmt(done.amount)} TND`} />
              <Fact label="Nouveau solde" value={`${done.balance} pts`} />
            </div>

            {done.unlocked.length > 0 ? (
              <p className="mt-3 rounded-2xl bg-[#ffd27a]/15 px-4 py-3 text-[13.5px] font-bold leading-snug text-[#ffd27a]">
                🎁 Peut prendre maintenant : {done.unlocked.join(", ")}
              </p>
            ) : (
              done.next && (
                <p className="mt-3 text-[12.5px] text-white/50">
                  Encore <b className="font-bold text-white/80">{done.next.needed}</b> pour{" "}
                  {done.next.label.toLowerCase()}
                </p>
              )
            )}
          </>
        ) : (
          <>
            <p className="mt-3.5 text-[40px] font-extrabold leading-none tabular-nums text-white">
              {done.count}
              <span className="text-[22px] text-white/40">/{done.required}</span>
            </p>
            <p className="mt-1.5 truncate text-[15px] font-bold">{done.who}</p>

            {/* the punch card, drawn — a row of dots reads faster than "7/10" */}
            <span className="mt-3.5 flex flex-wrap items-center justify-center gap-1.5">
              {Array.from({ length: done.required }, (_, i) => (
                <span
                  key={i}
                  className={`h-[11px] w-[11px] rounded-full ${
                    i < done.count ? "bg-[#7ff0b0]" : "bg-white/15"
                  }`}
                />
              ))}
            </span>

            {filled ? (
              <div className="mt-4 rounded-2xl bg-[#ffd27a]/15 px-4 py-3">
                <p className="text-[13.5px] font-extrabold leading-snug text-[#ffd27a]">
                  🎁 Carte pleine — {done.label}
                </p>
                {done.code && (
                  <p className="mt-1.5 font-mono text-[20px] font-bold tracking-[0.18em] text-white">
                    {done.code}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-[12.5px] text-white/50">
                Encore{" "}
                <b className="font-bold text-white/80">{done.required - done.count}</b>{" "}
                {done.required - done.count === 1 ? "visite" : "visites"}
              </p>
            )}
          </>
        )}

        <div className="mt-4 flex gap-2">
          {done.kind === "credit" && done.onUndo && (
            <button
              type="button"
              onClick={() => {
                done.onUndo?.();
                onClose();
              }}
              className="shrink-0 rounded-2xl border border-white/15 px-5 py-3 text-[13.5px] font-bold text-white/70 active:scale-[0.98]"
            >
              Annuler
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl bg-[#7c3aed] py-3 text-[14px] font-bold text-white active:scale-[0.98]"
          >
            Client suivant
          </button>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-2xl bg-white/[0.06] px-3.5 py-2.5">
      <span className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-white/45">
        {label}
      </span>
      <span className="mt-0.5 block truncate text-[15px] font-extrabold tabular-nums">{value}</span>
    </span>
  );
}

/** 12.5 → "12,5", 60 → "60". Dinars, read aloud, in French. */
function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace(".", ",");
}
