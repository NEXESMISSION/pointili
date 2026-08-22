"use client";

import { useEffect, useRef } from "react";
import { CardIcon, CheckIcon, Sparkle } from "@/components/icons";
import { fmtDinars, fmtPoints } from "@/lib/points";
import type { Whom } from "./actions";

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
      /** Name, code, whether they hold a card here, and what they hold. */
      who: Whom;
      /** Their balance before this sale — the receipt shows the movement. */
      before: number;
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
      who: Whom;
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
  [16, -6, "#5b3fd1", 0, 7], [30, 12, "#2f9e6e", 60, 5], [44, -14, "#a06e00", 120, 6],
  [58, 8, "#5b3fd1", 40, 5], [72, -10, "#2f9e6e", 100, 7], [86, 14, "#a06e00", 150, 5],
  [10, 26, "#a06e00", 90, 5], [24, 40, "#5b3fd1", 180, 6], [50, 46, "#2f9e6e", 30, 5],
  [66, 34, "#a06e00", 130, 6], [80, 44, "#5b3fd1", 70, 5], [92, 28, "#2f9e6e", 160, 6],
];

function Celebration({ tone }: { tone: "green" | "gold" }) {
  const ring = tone === "green" ? "#2f9e6e" : "#a06e00";
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
        style={{ background: ring, color: "#ffffff" }}
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
  /*
    THE TIMER RELEASES THE CUSTOMER. It used to only hide the receipt.

    The distinction above is the whole point of this component, and the sheet
    that owns it says so at CaisseForms.tsx:559 — dismissing "only hid the
    receipt, the till stayed bound to the same person, showing an empty amount
    box and a live Créditer", so the cashier keys the next customer's total and
    credits the previous one. The BUTTON was fixed to call onNext. This timer
    was left calling onClose, which performed that exact failure automatically,
    four seconds after every sale where nobody tapped — which is most sales,
    because the cashier is bagging the order.

    A deliberate dismiss still binds: tapping the veil or pressing Escape is a
    cashier saying "I am staying with this person" (to add a stamp, to check
    the history). Doing nothing is not that statement, so the unattended path
    is the safe one.

    Both handlers are held in refs because the parent passes fresh arrows on
    every render — with either in the dependency array, each re-render cleared
    the pending timeout and started the four seconds over.
  */
  const nextRef = useRef(onNext);
  const closeRef = useRef(onClose);
  /* Kept current in an effect, not during render — a ref written while
     rendering is torn under concurrent rendering, and React lints it. */
  useEffect(() => {
    nextRef.current = onNext;
    closeRef.current = onClose;
  });

  useEffect(() => {
    const t = setTimeout(() => nextRef.current(), 4000);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", esc);
    };
  }, []);

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
      /*
        THE LANDMARK THE TILL'S E2E READS, and the numbers on it as data.

        The suite used to wait for that [role="status"] flash line — which lives
        on the customer's desk, and the desk is torn down four seconds later
        when this receipt hands the till to the next customer. The check waited
        twenty. It therefore looked for the confirmation strictly after the
        confirmation had been taken off the screen, on a till that was working
        perfectly, and reported a timeout that named neither.

        Reading the amounts as attributes rather than as text also stops the
        check breaking on wording: it asserted "22,5 points" against a receipt
        that says "22,5 pts", so even winning the race would have failed it.
      */
      data-receipt
      data-earned={done.kind === "credit" ? done.earned : undefined}
      data-balance={done.kind === "credit" ? done.balance : undefined}
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
        className="done-sheet relative m-auto w-full max-w-[420px] rounded-[28px] border border-[var(--o-edge)] bg-[var(--o-panel)] p-5 pt-4 text-center text-charcoal shadow-[0_24px_70px_-24px_rgba(23,18,31,.45)]"
      >
        {/* an explicit way out, for the cashier who wants the till back NOW */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-[var(--o-inset)] text-slate transition active:scale-95"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-4 w-4">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <Celebration tone={filled ? "gold" : "green"} />

        {done.kind === "credit" ? (
          <>
            <h2 className="text-[30px] font-extrabold leading-none">Bravo !</h2>
            <Who who={done.who} />

            {/*
              The hero. One framed block holding the only two numbers a cashier
              reads out loud, so the eye lands once instead of hunting.
            */}
            <div className="mt-4 rounded-3xl border border-[#5b3fd1]/25 bg-[var(--o-inset)] px-5 py-6">
              <p className="text-[44px] font-extrabold leading-none tabular-nums text-[#2f9e6e]">
                +{fmtPoints(done.earned)}
              </p>
              <p className="mt-1.5 text-[17px] font-bold text-slate">points</p>
              <p className="mt-3.5 inline-block rounded-full bg-[#2f9e6e]/12 px-3.5 py-1.5 text-[13px] font-bold text-[#2f9e6e]">
                Nouveau solde : {fmtPoints(done.balance)} pts
              </p>
              {done.welcome > 0 && (
                <p className="mt-2 text-[12px] font-bold text-[#a06e00]">
                  dont +{fmtPoints(done.welcome)} de bienvenue
                </p>
              )}
            </div>

            {/*
              THE MOVEMENT, NOT THE NEW TOTAL TWICE.

              The hero above already says the new balance, in the largest type on
              the screen. Repeating it here left the receipt unable to answer the
              question the customer actually asks — "j'avais combien ?" — which
              used to mean closing this and searching the same person again.
            */}
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <Fact icon={<CardIcon className="h-[18px] w-[18px]" />} label="Montant" value={`${fmtDinars(done.amount)} TND`} />
              <Fact
                icon={<Sparkle className="h-[18px] w-[18px]" />}
                label="Solde"
                value={`${fmtPoints(done.before)} → ${fmtPoints(done.balance)}`}
              />
            </div>

            {done.unlocked.length > 0 ? (
              <p className="mt-3 flex items-center gap-3 rounded-2xl border border-[#a06e00]/25 bg-[#a06e00]/[0.08] px-4 py-3 text-left text-[13px] leading-snug text-slate">
                <span className="shrink-0 text-[20px]">🎁</span>
                <span>
                  Peut prendre maintenant :{" "}
                  <b className="block font-extrabold text-[#a06e00]">{done.unlocked.join(", ")}</b>
                </span>
              </p>
            ) : (
              done.next && (
                <p className="mt-3 text-[12px] text-slate">
                  Encore <b className="font-bold text-slate">{fmtPoints(done.next.needed)}</b> pour{" "}
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
            <p className="mt-2 text-[13px] text-slate">
              {filled ? "La carte est complète." : "Un tampon de plus."}
            </p>
            <Who who={done.who} />

            <div className="mt-4 rounded-3xl border border-[#5b3fd1]/25 bg-[var(--o-inset)] px-5 py-6">
              <p className="text-[44px] font-extrabold leading-none tabular-nums text-charcoal">
                {done.count}
                <span className="text-[24px] text-slate">/{done.required}</span>
              </p>
              {/* the punch card, drawn — a row of dots reads faster than "7/10" */}
              <span className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
                {Array.from({ length: done.required }, (_, i) => (
                  <span
                    key={i}
                    className={`h-[11px] w-[11px] rounded-full ${
                      i < done.count ? "bg-[#2f9e6e]" : "bg-[var(--o-inset)]"
                    }`}
                  />
                ))}
              </span>
            </div>

            {filled ? (
              <div className="mt-3 rounded-2xl border border-[#a06e00]/25 bg-[#a06e00]/[0.08] px-4 py-3.5">
                <p className="text-[13px] font-extrabold leading-snug text-[#a06e00]">
                  🎁 {done.label}
                </p>
                {done.code && (
                  <p className="mt-1.5 font-mono text-[20px] font-bold tracking-[0.18em] text-charcoal">
                    {done.code}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-slate">
                Encore <b className="font-bold text-slate">{done.required - done.count}</b>{" "}
                {done.required - done.count === 1 ? "visite" : "visites"}
              </p>
            )}

            {/* A stamp receipt answers the points question too — it is the same
                customer and the same breath. */}
            <p className="mt-3 text-[12px] text-slate">
              Solde <b className="font-extrabold tabular-nums text-charcoal">{fmtPoints(done.who.balance)}</b> points
            </p>
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
              className="shrink-0 rounded-2xl border border-[var(--o-edge)] px-6 py-3.5 text-[13px] font-bold text-slate active:scale-[0.98]"
            >
              Annuler
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#5b3fd1] py-3.5 text-[15px] font-bold text-white shadow-[0_10px_26px_-10px_rgba(124,58,237,.9)] active:scale-[0.98]"
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

/**
 * WHO THIS WAS, on the one screen where the cashier can still act on it.
 *
 * The till identifies people by a scan: nobody's name is on screen until the
 * act is over. So the confirmation carries the four facts that let a cashier
 * catch a wrong card in the second they have — the name, the code printed on
 * that card, whether this shop knows them at all, and what they hold.
 *
 * "Client de la maison" and "Première visite ici" are NOT the same question as
 * having an account, and conflating them is how a walk-in gets turned away:
 * somebody can be a Pointili member at ten other shops and a stranger at this
 * counter, and somebody credited by phone number may have no account at all —
 * their points wait for them either way.
 */
function Who({ who }: { who: Whom }) {
  const status = who.known
    ? { text: "Client de la maison", tone: "#2f9e6e" }
    : who.account
      ? { text: "Première visite ici", tone: "#a06e00" }
      : { text: "Pas encore inscrit — ses points l'attendent", tone: "#a06e00" };
  return (
    <div className="mt-3 rounded-2xl bg-[var(--o-inset)] px-4 py-3 text-left">
      <p className="flex items-baseline justify-between gap-2">
        <b className="min-w-0 truncate text-[16px] font-extrabold text-charcoal">{who.label}</b>
        {who.account && (
          <span className="shrink-0 font-mono text-[13px] font-bold tracking-[0.14em] text-slate">
            {who.account}
          </span>
        )}
      </p>
      <p className="mt-0.5 text-[12px] font-bold" style={{ color: status.tone }}>
        {status.text}
      </p>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="rounded-2xl bg-[var(--o-inset)] px-3 py-3.5">
      <span className="mx-auto grid h-9 w-9 place-items-center rounded-xl bg-[#5b3fd1]/15 text-[#5b3fd1]">
        {icon}
      </span>
      <span className="mt-2 block text-[12px] text-slate">{label}</span>
      <span className="mt-0.5 block truncate text-[15px] font-extrabold tabular-nums">{value}</span>
    </span>
  );
}
