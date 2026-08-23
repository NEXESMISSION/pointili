"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { translator, type Lang } from "@/lib/dict";
import { fmtPoints } from "@/lib/points";
import type { DinerPulse } from "@/lib/db";

/**
 * THE MOMENT THE POINTS LAND, ON THE SCREEN THAT IS WATCHING.
 *
 * A customer holds their phone out, the cashier scans it, and the points are
 * credited about a second later. Until now that phone went on showing the
 * balance it had loaded when the QR was opened: the one moment this whole
 * product exists for was invisible on the only screen pointed at it, and the
 * customer found out on their next visit.
 *
 * So the card watches for itself and says so, in the shop's own colour, for
 * two and a half seconds.
 *
 * ── HOW OFTEN IT ASKS, AND WHY IT IS NOT ONE NUMBER ───────────────────────
 *
 * Asking every two seconds forever would be a phone in somebody's pocket
 * talking to a database all afternoon. Asking every thirty would miss the
 * moment entirely. The honest answer is that BOTH are right, at different
 * times, and the difference is whether somebody is being served right now:
 *
 *   · HOT (1.5s) — for the first two minutes after the screen opens, and for
 *     two minutes after anything changes. That covers standing at a counter,
 *     which is the only time this matters.
 *   · WARM (6s) — after that. The card is open on a table.
 *   · COLD (25s) — ten minutes in. It is open in a pocket.
 *
 * And NOTHING while the screen is hidden. A backgrounded tab polls zero times;
 * coming back to the foreground asks immediately and starts hot again, which is
 * exactly the "I just took my phone out" case.
 *
 * ── WHAT IT DOES WITH AN ANSWER ───────────────────────────────────────────
 *
 * The overlay is a flourish; the PAGE still has to be right. So every change
 * also calls router.refresh(), and the server-rendered balance underneath is
 * already the new one by the time the animation fades. Without that the card
 * would celebrate +12 and then sit there showing the old total.
 *
 * ── AND WHAT IT REFUSES TO DO ─────────────────────────────────────────────
 *
 * It never celebrates a number going DOWN. Spending points on a reward is a
 * decrease, and confetti over "you have less than you did" is the kind of
 * cheerfulness that reads as a bug. It updates silently and says nothing.
 */

/** Poll cadences, in ms. See the note above for why there are three. */
const HOT = 1500;
const WARM = 6000;
const COLD = 25000;
/** How long "somebody is being served" lasts after the last sign of life. */
const HOT_FOR = 120_000;
const COLD_AFTER = 600_000;

type Celebration =
  | { kind: "points"; amount: number; balance: number }
  | { kind: "stamp"; count: number; required: number }
  | { kind: "full"; label: string | null };

export function LivePoints({
  slug,
  lang,
  initial,
  stampsRequired,
  colour,
}: {
  slug: string;
  lang: Lang;
  /** What the server rendered, so the first comparison has a floor. */
  initial: DinerPulse;
  stampsRequired: number;
  /** The shop's own colour — the celebration belongs to them, not to us. */
  colour: string;
}) {
  const router = useRouter();
  const t = translator(lang);
  const [show, setShow] = useState<Celebration | null>(null);

  /*
    The last figures we have SEEN, in a ref rather than state.

    They are read inside a timer and must never restart it: as state, every
    answer would re-run the effect, tear down the schedule and start a new one,
    which on a 1.5s cadence is a poll that drifts and occasionally doubles.
  */
  const seen = useRef<DinerPulse>(initial);
  /*
    Stamped in the effect, not here. `useRef(Date.now())` is a call during
    render, which React forbids for a good reason: a re-render re-evaluates it,
    so the "when did this open" the cadence is measured against would quietly
    move every time the component happened to render. 0 until mounted.
  */
  const lastChange = useRef(0);
  const openedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* One request in flight at a time. A slow answer on a bad connection must not
     stack up behind the next tick and arrive four at once. */
  const asking = useRef(false);

  const celebrate = useCallback((next: Celebration) => {
    setShow(next);
    lastChange.current = Date.now();
    /* A short, ordinary buzz. Absent on iOS, harmless everywhere. */
    try {
      navigator.vibrate?.(28);
    } catch {
      /* some browsers throw on a blocked gesture policy — never the caller's problem */
    }
    if (hide.current) clearTimeout(hide.current);
    hide.current = setTimeout(() => setShow(null), 2600);
  }, []);

  useEffect(() => {
    let stopped = false;
    const mounted = Date.now();
    lastChange.current = mounted;
    openedAt.current = mounted;

    const gap = () => {
      const now = Date.now();
      if (now - lastChange.current < HOT_FOR) return HOT;
      if (now - openedAt.current > COLD_AFTER) return COLD;
      return WARM;
    };

    const schedule = () => {
      if (stopped) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(tick, gap());
    };

    async function tick() {
      if (stopped || document.visibilityState !== "visible" || asking.current) return schedule();
      asking.current = true;
      try {
        const res = await fetch(`/api/pulse?s=${encodeURIComponent(slug)}`, { cache: "no-store" });
        if (!res.ok) return;
        const now = (await res.json()) as DinerPulse;
        const was = seen.current;

        /*
          A CARD THAT FILLED LOOKS LIKE STAMPS GOING BACKWARDS.

          add_stamp resets the counter to 0 the moment it completes and issues a
          voucher instead, so the honest signal is "stamps dropped AND a new code
          appeared". Checked before the plain stamp case, or a full card would
          celebrate nothing at all.
        */
        if (now.codes > was.codes && now.stamps < was.stamps) {
          celebrate({ kind: "full", label: now.latest });
        } else if (now.stamps > was.stamps) {
          celebrate({ kind: "stamp", count: now.stamps, required: stampsRequired });
        } else if (now.balance > was.balance) {
          celebrate({
            kind: "points",
            amount: Math.round((now.balance - was.balance) * 100) / 100,
            balance: now.balance,
          });
        }

        const changed =
          now.balance !== was.balance || now.stamps !== was.stamps || now.codes !== was.codes;
        seen.current = now;
        /* The overlay is the flourish; this is what makes the page itself true. */
        if (changed) router.refresh();
      } catch {
        /* Offline, or the shop went dark mid-shift. Say nothing and try again —
           a card that shouts about its own network is worse than a quiet one. */
      } finally {
        asking.current = false;
        schedule();
      }
    }

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      /* Back in the hand: ask now, and treat it as the counter again. */
      lastChange.current = Date.now();
      void tick();
    };

    document.addEventListener("visibilitychange", onVisible);
    schedule();

    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
      if (hide.current) clearTimeout(hide.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [slug, stampsRequired, celebrate, router]);

  if (!show) return null;

  return (
    <div
      /*
        A veil that can be dismissed but does not have to be. It disappears on
        its own after 2.6s; tapping only makes it sooner, for the customer who
        wants to see their card again immediately.
      */
      onClick={() => setShow(null)}
      role="status"
      aria-live="polite"
      data-live-celebration={show.kind}
      className="live-veil fixed inset-0 z-[60] flex items-center justify-center px-6 text-center"
    >
      <span aria-hidden className="live-ring" style={{ background: colour }} />
      <span aria-hidden className="live-ring live-ring--late" style={{ background: colour }} />

      <div className="live-card relative">
        {show.kind === "points" && (
          <>
            {/*
              dir="ltr", or Tunisian reads it "8+".

              The "+" and the "/" are BIDI-NEUTRAL characters: in an RTL
              paragraph they attach to whichever side the algorithm decides, and
              here that is the wrong one — the sign of the most important number
              on the screen ends up behind it. The figure is arithmetic, not
              prose, so it is pinned to left-to-right and the words around it
              keep flipping normally.
            */}
            <p className="live-figure" dir="ltr" style={{ color: colour }}>
              +{fmtPoints(show.amount)}
            </p>
            <p className="live-unit">{t("points")}</p>
            <p className="live-chip">
              {t("Nouveau solde")} : <b>{fmtPoints(show.balance)}</b>
            </p>
          </>
        )}

        {show.kind === "stamp" && (
          <>
            {/* "1/2", not "2/1" — the slash is neutral too. See above. */}
            <p className="live-figure" dir="ltr" style={{ color: colour }}>
              {show.count}
              <span className="live-of">/{show.required}</span>
            </p>
            <p className="live-unit">{t("tampons")}</p>
            <p className="live-chip">
              {show.required - show.count <= 0
                ? t("Carte pleine !")
                : `${t("Encore")} ${show.required - show.count}`}
            </p>
          </>
        )}

        {show.kind === "full" && (
          <>
            <p className="live-burst" aria-hidden>
              🎁
            </p>
            <p className="live-full" style={{ color: colour }}>
              {t("Carte pleine !")}
            </p>
            {show.label && <p className="live-chip">{show.label}</p>}
          </>
        )}
      </div>
    </div>
  );
}
