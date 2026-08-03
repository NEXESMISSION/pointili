"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  pointsForVisits,
  visitsForPoints,
  rewardIdeas,
  type Ticket,
} from "@/lib/rewards";
import { saveStarterRewardsAction, type StarterState } from "./actions";

/**
 * The first reward ladder — asked in VISITS, on the screen where it matters most.
 *
 * This was eight rows of two inputs, and the second input was "Points". A
 * person who signed up four minutes ago, has never run a loyalty programme and
 * has served nobody was being asked to price a free coffee in a unit that did
 * not exist until they got here. The honest answer is that nobody knows, so the
 * seeded numbers survived untouched — which was fine, or a disaster, and the
 * screen could not tell them which.
 *
 * Now each row asks the only question its author can answer: how many visits
 * should this take? Points are derived (lib/rewards.ts) and posted in a hidden
 * field, so saveStarterRewardsAction is unchanged and still speaks points.
 *
 * Three rows, not eight. Eight empty rows read as eight things you have to
 * think of; a ladder of three is a working programme, and "+ ajouter" is there
 * for a shop that wants more.
 *
 * NOTHING IS MANDATORY. "Je le ferai plus tard" is a real link, not a
 * discouraged one: the seeded ladder works as it stands.
 */
const ROWS = 8;

type Seed = { id: string; label: string; pointsCost: number };

export function RewardsSetup({
  seeded,
  ticket,
  businessType,
}: {
  seeded: Seed[];
  /** What a visit is worth — the platform yardstick until the shop has sales. */
  ticket: Ticket;
  businessType: string | null;
}) {
  const [state, formAction, pending] = useActionState<StarterState, FormData>(
    saveStarterRewardsAction,
    {},
  );
  const ideas = rewardIdeas(businessType);

  /*
    `cost` is carried alongside `visits` so an untouched row posts back the
    points it arrived with.

    points → visits → points does not round-trip (a 40-point reward against a
    7,86 TND ticket shows as 5 visits, and 5 visits computes back to 39), so
    finishing signup without touching a seeded row would quietly re-price the
    whole ladder. Moving the stepper is what clears it.
  */
  type Row = { id: string; label: string; visits: number; cost: number | null };
  const [rows, setRows] = useState<Row[]>(
    Array.from({ length: ROWS }, (_, i): Row =>
      seeded[i]
        ? {
            id: seeded[i].id,
            label: seeded[i].label,
            visits: visitsForPoints(seeded[i].pointsCost, ticket),
            cost: seeded[i].pointsCost,
          }
        : // a sensible ladder for anything the owner adds: 3, then 5, then 8…
          { id: "", label: "", visits: Math.min(3 + i * 2, 15), cost: null },
    ),
  );
  const [shown, setShown] = useState(Math.max(3, seeded.length));

  const set = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const filled = rows.slice(0, shown).filter((r) => r.label.trim()).length;

  return (
    <form action={formAction} className="space-y-3">
      <ul className="space-y-2.5">
        {rows.slice(0, shown).map((row, i) => (
          <li key={i} className="a-card p-3">
            <input type="hidden" name={`id${i}`} value={row.id} />
            {/* The unit the action wants, derived from the one asked for —
                unless this row still carries the points it arrived with. */}
            <input
              type="hidden"
              name={`cost${i}`}
              value={row.cost ?? pointsForVisits(row.visits, ticket)}
            />

            <input
              name={`label${i}`}
              value={row.label}
              onChange={(e) => set(i, { label: e.target.value })}
              maxLength={60}
              placeholder={ideas[i % ideas.length]}
              className="a-field"
              aria-label={`Récompense ${i + 1}`}
            />

            {/*
              A stepper, not a number field. Two taps beats summoning a keyboard
              on a phone, and it makes the range self-evident — an owner can see
              they are at 3 and that 4 is one press away, which a blank box
              never does.
            */}
            <div className="mt-2.5 flex items-center gap-2.5">
              <span className="min-w-0 flex-1 text-[12px] font-semibold text-white/55">
                Après combien de visites ?
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Step
                  label="Moins"
                  onClick={() => set(i, { visits: Math.max(1, row.visits - 1) })}
                  disabled={row.visits <= 1}
                >
                  −
                </Step>
                {/* The number alone — the label beside it already says
                    "visites", and repeating it here stole enough width to wrap
                    that label and orphan its question mark on its own line. */}
                <span className="w-[38px] text-center text-[17px] font-extrabold tabular-nums text-white">
                  {row.visits}
                </span>
                <Step
                  label="Plus"
                  onClick={() => set(i, { visits: Math.min(200, row.visits + 1) })}
                  disabled={row.visits >= 200}
                >
                  +
                </Step>
              </div>
            </div>

            {/* The one warning worth giving a beginner, on the one row where it
                changes the outcome. */}
            {i === 0 && row.visits > 6 && row.label.trim() && (
              <p className="mt-2 rounded-xl bg-[#ffd27a]/12 px-3 py-2 text-[12px] font-semibold leading-snug text-[#ffd27a]">
                C&apos;est votre première récompense — {row.visits} visites,
                c&apos;est long. La plupart abandonneront avant.
              </p>
            )}
          </li>
        ))}
      </ul>

      {shown < ROWS && (
        <button
          type="button"
          onClick={() => setShown((n) => n + 1)}
          className="text-[12px] font-bold text-[#b9a3ff] hover:text-white"
        >
          + Ajouter une récompense
        </button>
      )}

      {/*
        What "visites" is being measured against. It used to explain the points
        rate, which is no longer a number anyone on this screen has to hold.
      */}
      <p className="!mt-4 rounded-xl bg-white/[0.05] px-3.5 py-2.5 text-[12px] leading-snug text-white/60">
        {ticket.measured ? (
          <>
            Calculé sur votre ticket moyen réel :{" "}
            <b className="text-white">{ticket.tnd.toFixed(2)} TND</b> par visite.
          </>
        ) : (
          <>
            Estimé sur un panier de{" "}
            <b className="text-white">{ticket.tnd.toFixed(2)} TND</b> — vous
            n&apos;avez pas encore de ventes. Vous pourrez tout changer plus tard
            dans Réglages.
          </>
        )}
      </p>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-[#ff6b6b]/35 bg-[#ff6b6b]/12 px-3.5 py-2.5 text-[13px] font-semibold text-[#ff9a9a]"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="!mt-4 w-full rounded-xl bg-[#6d4ae6] py-4 text-[12px] font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
      >
        {pending
          ? "· · ·"
          : filled === 0
            ? "Terminer sans récompense"
            : `Terminer · ${filled} récompense${filled > 1 ? "s" : ""} ✦`}
      </button>

      <Link
        href="/owner"
        className="block pt-1 text-center text-[12px] font-semibold text-white/45 hover:text-white/75"
      >
        Je le ferai plus tard
      </Link>
    </form>
  );
}

function Step({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.09] text-[18px] font-bold leading-none text-white transition active:scale-95 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
