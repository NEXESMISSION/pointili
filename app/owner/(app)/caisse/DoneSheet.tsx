"use client";

import { useEffect } from "react";
import { CardIcon, CheckIcon, Sparkle } from "@/components/icons";
import { fmtPoints } from "@/lib/points";

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

/*
  Fixed, not random. A celebration that lands differently every time reads as a
  glitch on the twentieth sale of the morning, and Math.random() in a render is
  a hydration mismatch waiting to happen. Twelve pieces, hand-placed around the
  tick: left/right in %, drop in px, hue, and a stagger so they do not all pop
  on the same frame.
*/
const CONFETTI: [number, number, string, number, number][] = [
  [16, -6, "#8b6bff", 0, 7], [30, 12, "#7ff0b0", 60, 5], [44, -14, "#ffd27a", 120, 6],
  [58, 8, "#8b6bff", 40, 5], [72, -10, "#7ff0b0", 100, 7], [86, 14, "#ffd27a", 150, 5],
  [10, 26, "#ffd27a", 90, 5], [24, 40, "#8b6bff", 180, 6], [50, 46, "#7ff0b0", 30, 5],
  [66, 34, "#ffd27a", 130, 6], [80, 44, "#8b6bff", 70, 5], [92, 28, "#7ff0b0", 160, 6],
];

function Celebration({ tone }: { tone: "green" | "gold" }) {
  const ring = tone === "green" ? "#7ff0b0" : "#ffd27a";
  return (
    <span className="relative mx-auto block h-[104px] w-full">
      <span aria-hidden className="pointer-events-none absolute inset-0">
        {CONFETTI.map(([left, top, colour, delay, size], i) => (
          <span
            key={i}
            className="done-confetti absolute block rounded-[2px]"
            style={{
              left: `${left}%`,
              top: `${34 + top}px`,
              width: size,
              height: size + 2,
              background: colour,
              animationDelay: `${delay}ms`,
            }}
          />
        ))}
      </span>
      {/* the halo is what makes the tick read as "yes" from across a counter */}
      <span
        aria-hidden
        className="absolute left-1/2 top-[18px] h-[68px] w-[68px] -translate-x-1/2 rounded-full"
        style={{ boxShadow: `0 0 0 6px ${ring}1f, 0 0 34px 6px ${ring}33` }}
      />
      <span
        className="done-tick absolute left-1/2 top-[20px] grid h-16 w-16 -translate-x-1/2 place-items-center rounded-full"
        style={{ background: ring, color: "#062b18" }}
      >
        <CheckIcon className="h-9 w-9" />
      </span>
    </span>
  );
}

export function DoneSheet({
  done,
  onClose,
  onNext,
}: {
  done: Done;
  /** Dismiss the receipt only — the veil, Escape, the × and the auto-close. */
  onClose: () => void;
  /**
   * Finish with this customer and return the till to the keypad.
   *
   * Separate from onClose on purpose. The button says "Client suivant" and used
   * to call the dismiss handler, leaving the till bound to the same person
   * behind a screen that looked ready for the next one.
   */
  onNext: () => void;
}) {
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
      /*
        overflow-y-auto + m-auto on the sheet, NOT items-center on the veil.
        Centred flex children that outgrow the container crop at BOTH ends and
        the cropped part is unreachable — no scroll can get to it, which is
        exactly the "Bravo!" head cut off on a short phone. Auto margins do the
        same centring when the sheet is short, and collapse to allow scrolling
        the moment it is tall.
      */
      className="done-veil fixed inset-0 z-50 flex overflow-y-auto bg-black/78 px-3 py-5 backdrop-blur-[3px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="done-sheet relative m-auto w-full max-w-[420px] rounded-[28px] border border-white/[0.09] bg-[#120d20] p-5 pt-4 text-center text-white shadow-[0_24px_70px_-20px_rgba(0,0,0,.95)]"
      >
        {/* an explicit way out, for the cashier who wants the till back NOW */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/[0.08] text-white/60 transition active:scale-95"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-4 w-4">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <Celebration tone={filled ? "gold" : "green"} />

        {done.kind === "credit" ? (
          <>
            <h2 className="text-[30px] font-extrabold leading-none">Bravo !</h2>
            <p className="mt-2 text-[13px] text-white/55">
              Des points ont été ajoutés à <b className="font-bold text-white/85">{done.who}</b>.
            </p>

            {/*
              The hero. One framed block holding the only two numbers a cashier
              reads out loud, so the eye lands once instead of hunting.
            */}
            <div className="mt-4 rounded-3xl border border-[#8b6bff]/25 bg-gradient-to-b from-[#2a1d55] to-[#1b1338] px-5 py-6">
              <p className="text-[44px] font-extrabold leading-none tabular-nums text-[#7ff0b0]">
                +{fmtPoints(done.earned)}
              </p>
              <p className="mt-1.5 text-[17px] font-bold text-white/85">points</p>
              <p className="mt-3.5 inline-block rounded-full bg-[#7ff0b0]/12 px-3.5 py-1.5 text-[13px] font-bold text-[#7ff0b0]">
                Nouveau solde : {fmtPoints(done.balance)} pts
              </p>
              {done.welcome > 0 && (
                <p className="mt-2 text-[12px] font-bold text-[#ffd27a]">
                  dont +{fmtPoints(done.welcome)} de bienvenue
                </p>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <Fact icon={<CardIcon className="h-[18px] w-[18px]" />} label="Montant" value={`${fmtDinars(done.amount)} TND`} />
              <Fact icon={<Sparkle className="h-[18px] w-[18px]" />} label="Nouveau solde" value={`${fmtPoints(done.balance)} pts`} />
            </div>

            {done.unlocked.length > 0 ? (
              <p className="mt-3 flex items-center gap-3 rounded-2xl border border-[#ffd27a]/25 bg-[#ffd27a]/[0.08] px-4 py-3 text-left text-[13px] leading-snug text-white/60">
                <span className="shrink-0 text-[20px]">🎁</span>
                <span>
                  Peut prendre maintenant :{" "}
                  <b className="block font-extrabold text-[#ffd27a]">{done.unlocked.join(", ")}</b>
                </span>
              </p>
            ) : (
              done.next && (
                <p className="mt-3 text-[12px] text-white/45">
                  Encore <b className="font-bold text-white/75">{fmtPoints(done.next.needed)}</b> pour{" "}
                  {done.next.label.toLowerCase()}
                </p>
              )
            )}
          </>
        ) : (
          <>
            <h2 className="text-[30px] font-extrabold leading-none">
              {filled ? "Carte pleine !" : "Bravo !"}
            </h2>
            <p className="mt-2 text-[13px] text-white/55">
              {filled ? "La carte de " : "Un tampon de plus pour "}
              <b className="font-bold text-white/85">{done.who}</b>
              {filled ? " est complète." : "."}
            </p>

            <div className="mt-4 rounded-3xl border border-[#8b6bff]/25 bg-gradient-to-b from-[#2a1d55] to-[#1b1338] px-5 py-6">
              <p className="text-[44px] font-extrabold leading-none tabular-nums text-white">
                {done.count}
                <span className="text-[24px] text-white/35">/{done.required}</span>
              </p>
              {/* the punch card, drawn — a row of dots reads faster than "7/10" */}
              <span className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
                {Array.from({ length: done.required }, (_, i) => (
                  <span
                    key={i}
                    className={`h-[11px] w-[11px] rounded-full ${
                      i < done.count ? "bg-[#7ff0b0]" : "bg-white/15"
                    }`}
                  />
                ))}
              </span>
            </div>

            {filled ? (
              <div className="mt-3 rounded-2xl border border-[#ffd27a]/25 bg-[#ffd27a]/[0.08] px-4 py-3.5">
                <p className="text-[13px] font-extrabold leading-snug text-[#ffd27a]">
                  🎁 {done.label}
                </p>
                {done.code && (
                  <p className="mt-1.5 font-mono text-[20px] font-bold tracking-[0.18em] text-white">
                    {done.code}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-white/45">
                Encore <b className="font-bold text-white/75">{done.required - done.count}</b>{" "}
                {done.required - done.count === 1 ? "visite" : "visites"}
              </p>
            )}
          </>
        )}

        <div className="mt-4 flex gap-2.5">
          {done.kind === "credit" && done.onUndo && (
            <button
              type="button"
              onClick={() => {
                done.onUndo?.();
                onClose();
              }}
              className="shrink-0 rounded-2xl border border-white/15 px-6 py-3.5 text-[13px] font-bold text-white/70 active:scale-[0.98]"
            >
              Annuler
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#7c3aed] py-3.5 text-[15px] font-bold text-white shadow-[0_10px_26px_-10px_rgba(124,58,237,.9)] active:scale-[0.98]"
          >
            Client suivant
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
              <path d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="rounded-2xl bg-white/[0.05] px-3 py-3.5">
      <span className="mx-auto grid h-9 w-9 place-items-center rounded-xl bg-[#8b6bff]/15 text-[#b9a3ff]">
        {icon}
      </span>
      <span className="mt-2 block text-[12px] text-white/45">{label}</span>
      <span className="mt-0.5 block truncate text-[15px] font-extrabold tabular-nums">{value}</span>
    </span>
  );
}

/** 12.5 → "12,5", 60 → "60". Dinars, read aloud, in French. */
function fmtDinars(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace(".", ",");
}
