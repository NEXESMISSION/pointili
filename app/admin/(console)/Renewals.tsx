"use client";

import { useActionState, useState } from "react";
import { method as payMethod, offer as findOffer, tnd } from "@/lib/billing";
import type { AdminRenewal } from "@/lib/platform";
import { decideRenewalAction, type AdminState } from "./actions";

/**
 * DEMANDES DE RENOUVELLEMENT — the money queue.
 *
 * Everything else in this console is the operator noticing something (a café
 * expired, one went dark). This is the only part where a shop asks THEM for
 * something, and it arrives with everything needed to answer: who, which offer,
 * how much, paid how, and the receipt.
 *
 * The receipt is the whole point, so it is on the row rather than behind a
 * link — a thumbnail you can enlarge in place. Deciding without looking at the
 * transfer would make this queue a rubber stamp, and approving is what extends
 * the plan.
 */
export function Renewals({ rows }: { rows: AdminRenewal[] }) {
  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending").slice(0, 6);

  if (rows.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate">
        Renouvellements{pending.length > 0 && ` (${pending.length})`}
      </h2>

      {pending.length === 0 ? (
        <p className="rounded-lg border border-[var(--o-edge)] bg-[var(--o-panel)] px-4 py-4 text-[13px] text-slate">
          Aucune demande en attente.
        </p>
      ) : (
        <ul className="space-y-2">
          {pending.map((r) => (
            <RequestRow key={r.id} r={r} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <ul className="mt-2 space-y-1">
          {done.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-lg border border-[var(--o-edge)] bg-[var(--o-inset)] px-3 py-2 font-mono text-[11.5px] text-slate"
            >
              <span
                className={r.status === "approved" ? "text-[#2f9e6e]" : "text-[#c0341c]"}
              >
                {r.status === "approved" ? "✓" : "✕"}
              </span>
              <span className="min-w-0 flex-1 truncate text-slate">{r.name}</span>
              <span>{tnd(r.amount)}</span>
              <span className="text-slate/40">·</span>
              <span>
                {new Date(r.decidedAt ?? r.createdAt).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RequestRow({ r }: { r: AdminRenewal }) {
  const [state, act, pending] = useActionState<AdminState, FormData>(decideRenewalAction, {});
  const [big, setBig] = useState(false);
  const [refusing, setRefusing] = useState(false);

  return (
    <li className="rounded-lg border border-[var(--o-edge)] bg-[var(--o-panel)] p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[14px] font-bold text-charcoal">{r.name}</span>
        <span className="font-mono text-[11.5px] text-slate">/{r.slug}</span>
        <span className="ml-auto font-mono text-[11.5px] text-slate">
          {new Date(r.createdAt).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      <p className="mt-1 font-mono text-[12.5px] text-slate">
        <b className="text-charcoal">{tnd(r.amount)}</b>
        <span className="text-slate/40"> · </span>
        {findOffer(r.offer)?.label ?? r.offer} ({r.months} mois)
        <span className="text-slate/40"> · </span>
        {payMethod(r.method)?.label ?? r.method}
        <span className="text-slate/40"> · </span>
        formule actuelle {r.plan}
        {r.planExpiresAt
          ? ` jusqu'au ${new Date(r.planExpiresAt).toLocaleDateString("fr-FR")}`
          : " (illimitée)"}
      </p>

      {r.note && (
        <p className="mt-1 border-l-2 border-[var(--o-edge)] pl-2 text-[12px] italic text-slate">
          « {r.note} »
        </p>
      )}

      {/*
        The receipt, thumbnail until it is clicked.

        A transfer screenshot is portrait and narrow; stretched across the row
        it was a hundred pixels of receipt in a wide black box. Capped and
        centred instead, with the enlarge affordance said out loud — an operator
        must actually READ the amount before pressing a green button, and a
        picture that looks decorative does not get read.
      */}
      <button
        type="button"
        onClick={() => setBig((v) => !v)}
        className="group mt-2 flex w-full flex-col items-center gap-1 rounded-lg border border-[var(--o-edge)] bg-[var(--o-inset)] py-2"
        aria-label={big ? "Réduire le reçu" : "Agrandir le reçu"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- served as bytes by /api/admin/proof */}
        <img
          src={`/api/admin/proof/${r.id}`}
          alt={`Reçu de ${r.name}`}
          className={`w-auto rounded object-contain transition-all ${
            big ? "max-h-[70vh] max-w-full" : "max-h-[132px] max-w-[180px]"
          }`}
        />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-slate group-hover:text-slate">
          {big ? "réduire" : "agrandir le reçu"}
        </span>
      </button>

      <form action={act} className="mt-2 flex flex-wrap items-center gap-2">
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
              className="rounded-xl bg-[#c0341c] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-white active:scale-95 disabled:opacity-50"
            >
              Refuser
            </button>
            <button
              type="button"
              onClick={() => setRefusing(false)}
              className="rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-slate"
            >
              Annuler
            </button>
          </>
        ) : (
          <>
            {/*
              Approving carries the duration from the row, so there is nothing
              to fill in: the button says exactly what it will do.
            */}
            <button
              type="submit"
              name="approve"
              value="1"
              disabled={pending}
              className="rounded-xl bg-[#2f9e6e] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-white active:scale-95 disabled:opacity-50"
            >
              {pending ? "…" : `Valider · +${r.months} mois`}
            </button>
            <button
              type="button"
              onClick={() => setRefusing(true)}
              className="rounded-xl border border-[var(--o-edge)] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-slate active:scale-95"
            >
              Refuser
            </button>
          </>
        )}
      </form>

      {state.error && (
        <p role="alert" className="mt-2 rounded-xl bg-[#fdecec] px-3 py-2 text-[11.5px] font-semibold text-[#c0341c]">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="mt-2 rounded-xl bg-[#e7f6ee] px-3 py-2 text-[11.5px] font-semibold text-[#2f9e6e]">
          {state.ok}
        </p>
      )}
    </li>
  );
}
