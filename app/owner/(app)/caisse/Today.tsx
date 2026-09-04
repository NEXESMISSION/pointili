import type { OwnerToday } from "@/lib/db";
import { fmtPoints } from "@/lib/points";

/**
 * AUJOURD'HUI — the shift, beside the till that is serving it.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * The till is a terminal: type a number, press a button, next customer. It said
 * nothing whatever about the day it was in the middle of. An owner standing at
 * their own counter at six in the evening could not answer "how did today go?"
 * without leaving the till, opening the customers screen, picking a period, and
 * doing arithmetic on a seven-day window — for a question about the last eight
 * hours.
 *
 * And on a laptop it was worse than an omission. The till is two small cards in
 * a 680px column; the other two thirds of the screen were empty. There was no
 * shortage of room to say how the day was going. There was no query that could
 * say it (0042), so nobody had tried.
 *
 * ── IT IS A COLUMN, NOT A DASHBOARD ───────────────────────────────────────
 *
 * On a phone this is BELOW the till and folded shut, because during service the
 * only thing that matters is the customer in front of you. On a laptop it takes
 * the width the till does not want. Same component, same data, two priorities —
 * which is the whole difference between the two machines this app runs on.
 *
 * ── AND EVERY NUMBER HAS SOMETHING TO COMPARE IT TO ───────────────────────
 *
 * "240 TND" is not information. "240 TND, 90 hier" is. The comparison is
 * against yesterday UP TO THIS HOUR (see 0042) — comparing a third of a shift
 * against a finished day would report a collapse every single morning.
 */
export function Today({ day, pointsPerTnd }: { day: OwnerToday; pointsPerTnd: number }) {
  const quiet = day.visits === 0 && day.newCards === 0;

  return (
    <section className="a-card overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate">
          Aujourd&apos;hui
        </h2>
        <span className="text-[11px] text-slate">
          {new Date().toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </span>
      </div>

      {quiet ? (
        /*
          A quiet morning is not an error, and it must not look like one. Four
          zeroes in a row read as "broken" — this says what is true and what to
          expect.
        */
        <p className="px-4 py-5 text-[13px] leading-relaxed text-slate">
          Rien encore aujourd&apos;hui. Le premier client qui passe apparaît ici,
          avec le montant et les points.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px bg-[var(--o-edge)] lg:grid-cols-4">
            <Cell
              k="Encaissé"
              v={`${Math.round(day.takings)}`}
              unit="TND"
              hint={compare(day.takings, day.yTakings)}
            />
            <Cell
              k="Passages"
              v={String(day.visits)}
              hint={compare(day.visits, day.yVisits)}
            />
            <Cell
              k="Nouveaux"
              v={String(day.newCards)}
              hint={day.newCards === 0 ? "aucune carte" : "cartes créées"}
            />
            <Cell
              k="Récompenses"
              v={String(day.rewards)}
              hint={day.rewards === 0 ? "aucune remise" : "remises"}
            />
          </div>
          {/* The rate, stated once, where the points are. It answers "why did
              he get 12?" without anybody opening a settings screen. */}
          <p className="border-t border-[var(--o-edge)] px-4 py-2 text-[11.5px] text-slate">
            {fmtPoints(day.points)} points distribués · {pointsPerTnd} point
            {pointsPerTnd === 1 ? "" : "s"} par dinar
          </p>
        </>
      )}

      {/*
        THE DAY'S LEDGER IS NOT THE TILL'S JOB.

        "Dernières opérations" listed every credit and redemption of the shift
        under the two buttons — six rows of names, amounts and times on the one
        screen a cashier looks at with a customer waiting. It reads as a report,
        and it turned the till into something to scroll.

        The numbers above already answer the question the counter asks ("how is
        today going?"). Who exactly bought what, at what time, is a question
        asked afterwards and standing still — and it is answered in full on the
        client list and in a customer's own fiche, both of which are one tap
        away in the menu.
      */}
    </section>
  );
}


/**
 * How today compares — as YESTERDAY'S NUMBER, never as a percentage.
 *
 * Two drafts of this printed a ratio. The first printed one whenever yesterday
 * was above zero, which on a small café produces "+500 % vs hier" out of six
 * passages against one: arithmetically true, useless, and the kind of figure
 * that gets screenshotted. The second only printed one above a base of five,
 * which fixed the lying and not the fitting — "+439 % vs hier" wrapped onto two
 * lines in a 125px tile, so the noisiest thing on the card was also the widest.
 *
 * "hier 14" is shorter than every percentage, fits on one line at any value,
 * needs no threshold, and cannot mislead at small numbers. The reader does the
 * comparison themselves, which for two numbers side by side is instant — and it
 * is the comparison they trust, because both figures are in front of them.
 */
function compare(today: number, yesterday: number): string {
  if (yesterday <= 0) return today > 0 ? "rien hier" : "—";
  return `hier ${trim(yesterday)}`;
}

/** 7.5 → "7,5"; 12 → "12". No trailing zero on a whole number. */
function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

function Cell({
  k,
  v,
  unit,
  hint,
}: {
  k: string;
  v: string;
  unit?: string;
  hint: string;
}) {
  return (
    <div className="bg-[var(--o-panel)] px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate">{k}</p>
      <p className="mt-1 font-display text-[24px] font-extrabold leading-none tabular-nums text-charcoal">
        {v}
        {unit && <span className="ms-1 text-[12px] font-bold text-slate">{unit}</span>}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate">{hint}</p>
    </div>
  );
}
