"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { tnd } from "@/lib/billing";
import type { AdminRenewal } from "@/lib/platform";
import { decideRenewalAction, type AdminState } from "../actions";

/*
  The labels come from the platform's live settings, handed down by the page —
  not from lib/billing's constants, which the settings screen can now diverge
  from. `?? r.offer` is not a fallback so much as the honest answer when an
  offer has since been renamed or dropped: what is printed is then the id that
  was actually sold, which is what the row records.
*/
type Naming = { offers: { id: string; label: string }[]; methods: { id: string; label: string }[] };

/**
 * The renewal queue.
 *
 * The receipt is the whole point, so it is on the row rather than behind a
 * link — a thumbnail you can enlarge in place. Deciding without looking at the
 * transfer would make this queue a rubber stamp, and approving is what extends
 * the plan.
 *
 * ── WHAT CHANGED IN THE REBUILD ───────────────────────────────────────────
 *
 * The shop's name is a LINK now. An operator looking at a receipt for eighty
 * dinars is being asked "is this the right shop and the right amount?", and
 * until there was a page per café the only way to check anything about them was
 * to close the panel and search a table. It is one tap, in a new context, and
 * the queue keeps its place.
 *
 * The decided rows also stopped being a stub. They were six mono lines with a
 * tick and a date — no method, no duration, no reason for a refusal — which is
 * exactly the information wanted when a shop rings up asking why their transfer
 * was rejected three weeks ago.
 */
export function Renewals({ rows, naming }: { rows: AdminRenewal[]; naming: Naming }) {
  const offerLabel = (id: string) => naming.offers.find((o) => o.id === id)?.label ?? id;
  const methodLabel = (id: string) => naming.methods.find((m) => m.id === id)?.label ?? id;
  /*
    ── THE RESULT LIVES ON THE SECTION, NOT ON THE ROW ───────────────────────

    It used to live in each RequestRow's own useActionState, and that made the
    confirmation impossible to see: approving revalidates the page, the request
    stops being pending, and the row RENDERS ITSELF OUT OF THE LIST — taking its
    own success line with it. The operator pressed "Valider · +12 mois", the row
    vanished, and nothing anywhere said whether a shop had just been given a
    year or an error had been swallowed. The one moment in this console where a
    confirmation matters most was the one moment it could not survive.

    So one action instance is shared by every row and its result is drawn above
    the queue, which stays mounted. `pending` disabling all the buttons at once
    is a bonus rather than a cost: these decisions move money, and one at a time
    is the right pace.
  */
  const [state, act, busy] = useActionState<AdminState, FormData>(decideRenewalAction, {});
  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  return (
    <>
      {state.error && (
        <p role="alert" className="k-note k-bad mb-2.5 w-full  px-3.5 py-2.5">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="k-note k-ok mb-2.5 w-full  px-3.5 py-2.5">
          {state.ok}
        </p>
      )}

      {pending.length === 0 ? (
        <p className="k-card px-4 py-5 text-[13px] text-slate">
          Aucune demande en attente. Les cafés envoient leur reçu depuis
          /owner/renouveler.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {pending.map((r) => (
            <RequestRow
                  key={r.id}
                  r={r}
                  act={act}
                  busy={busy}
                  offerLabel={offerLabel}
                  methodLabel={methodLabel}
                />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <details className="group mt-4">
          <summary className="k-h cursor-pointer list-none py-2 hover:text-charcoal [&::-webkit-details-marker]:hidden">
            <span className="inline-block w-3 text-slate/60 transition-transform group-open:rotate-90">
              ›
            </span>
            Déjà traitées ({done.length})
          </summary>
          <ul className="k-card divide-y divide-[var(--o-edge)]">
            {done.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2.5 px-4 py-2.5 text-[12px]">
                <span className={`k-dot k-${r.status === "approved" ? "ok" : "bad"}`} aria-hidden />
                <Link
                  href={`/admin/cafes/${r.businessId}`}
                  className="font-semibold text-charcoal hover:text-royal"
                >
                  {r.name}
                </Link>
                <span className="k-num text-charcoal">{tnd(r.amount)}</span>
                <span className="k-num text-slate">
                  {r.months} mois · {methodLabel(r.method)}
                </span>
                <span className="k-num ms-auto shrink-0 text-slate/70">
                  {new Date(r.decidedAt ?? r.createdAt).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                  })}
                </span>
                {/* The refusal reason, on the row. It is what the shop was told,
                    and the operator will be asked to repeat it. */}
                {r.decidedNote && (
                  <span className="w-full text-[11.5px] italic text-slate">« {r.decidedNote} »</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function RequestRow({
  r,
  act,
  busy,
  offerLabel,
  methodLabel,
}: {
  r: AdminRenewal;
  act: (formData: FormData) => void;
  busy: boolean;
  offerLabel: (id: string) => string;
  methodLabel: (id: string) => string;
}) {
  const [big, setBig] = useState(false);
  const [refusing, setRefusing] = useState(false);
  /* Named `pending` here for the row's own buttons, which is what the markup
     below already called it — the queue's shared busy flag. */
  const pending = busy;

  return (
    <li className="k-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <Link
          href={`/admin/cafes/${r.businessId}`}
          className="text-[14.5px] font-bold text-charcoal hover:text-royal"
        >
          {r.name}
        </Link>
        <span className="k-num text-[11.5px] text-slate">/{r.slug}</span>
        <span className="k-num ms-auto text-[11.5px] text-slate">
          {new Date(r.createdAt).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* The amount is the biggest thing on the row, because it is the one that
          has to be matched against the picture below it. */}
      <p className="k-num mt-1.5 text-[12.5px] text-slate">
        <b className="text-[16px] text-charcoal">{tnd(r.amount)}</b>
        <span className="text-slate/40"> · </span>
        {offerLabel(r.offer)} ({r.months} mois)
        <span className="text-slate/40"> · </span>
        {methodLabel(r.method)}
        <span className="text-slate/40"> · </span>
        formule {r.plan}
        {r.planExpiresAt
          ? ` jusqu'au ${new Date(r.planExpiresAt).toLocaleDateString("fr-FR")}`
          : " (illimitée)"}
      </p>

      {r.note && (
        <p className="mt-1.5 border-s-2 border-[var(--o-edge)] ps-2.5 text-[12px] italic text-slate">
          « {r.note} »
        </p>
      )}

      {/*
        The receipt, thumbnail until it is clicked.

        A transfer screenshot is portrait and narrow; stretched across the row it
        was a hundred pixels of receipt in a wide box. Capped and centred
        instead, with the enlarge affordance said out loud — an operator must
        actually READ the amount before pressing a green button, and a picture
        that looks decorative does not get read.
      */}
      <button
        type="button"
        onClick={() => setBig((v) => !v)}
        className="k-inset group mt-2.5 flex w-full flex-col items-center gap-1 py-2.5"
        aria-label={big ? "Réduire le reçu" : "Agrandir le reçu"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- served as bytes by /api/admin/proof */}
        <img
          src={`/api/admin/proof/${r.id}`}
          alt={`Reçu de ${r.name}`}
          className={`w-auto rounded object-contain transition-all ${
            big ? "max-h-[70vh] max-w-full" : "max-h-[140px] max-w-[190px]"
          }`}
        />
        <span className="k-h group-hover:text-charcoal">
          {big ? "réduire" : "agrandir le reçu"}
        </span>
      </button>

      <form action={act} className="mt-2.5 flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={r.id} />
        {refusing ? (
          <>
            <input
              name="note"
              autoFocus
              placeholder="Raison du refus — le café la verra"
              className="k-field min-w-[220px] flex-1"
            />
            <button
              type="submit"
              name="approve"
              value="0"
              disabled={pending}
              className="k-btn k-btn--sm k-btn--danger"
            >
              Refuser
            </button>
            <button
              type="button"
              onClick={() => setRefusing(false)}
              className="k-btn k-btn--sm k-btn--ghost"
            >
              Annuler
            </button>
          </>
        ) : (
          <>
            {/* Approving carries the duration from the row, so there is nothing
                to fill in: the button says exactly what it will do. */}
            <button
              type="submit"
              name="approve"
              value="1"
              disabled={pending}
              className="k-btn k-btn--sm k-btn--ok"
            >
              {pending ? "…" : `Valider · +${r.months} mois`}
            </button>
            <button
              type="button"
              onClick={() => setRefusing(true)}
              className="k-btn k-btn--sm k-btn--ghost"
            >
              Refuser
            </button>
          </>
        )}
      </form>

    </li>
  );
}
