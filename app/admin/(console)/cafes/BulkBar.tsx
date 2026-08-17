"use client";

import { useActionState, useState } from "react";
import { bulkNoticeAction, bulkPlanAction, type AdminState } from "../actions";

/**
 * ACT ON THE SELECTION.
 *
 * "Everyone whose trial ends this week gets another fortnight" and "tell these
 * twelve cafés about Sunday's maintenance" are one decision each — and, before
 * this, twelve page visits each, with twelve chances to skip one and never know.
 *
 * ── IT APPEARS ONLY WHEN SOMETHING IS SELECTED ────────────────────────────
 *
 * A permanent bulk toolbar over a table is a permanent invitation to do
 * something to a lot of shops at once, and it makes the ordinary case — open
 * one café — feel like the exception. Nothing changes about the roster until a
 * checkbox is ticked; then a bar slides in at the bottom saying exactly how many
 * shops it is about, and every button on it names that number.
 *
 * ── AND IT COUNTS ITS FAILURES OUT LOUD ───────────────────────────────────
 *
 * admin_bulk_plan loops the single-shop function and reports both totals. A
 * bulk action that says "done" while three of twelve silently did nothing is
 * worse than one that fails outright, because nobody goes back to check.
 */
export function BulkBar({
  ids,
  onClear,
}: {
  ids: string[];
  onClear: () => void;
}) {
  const [plan, planAct, planPending] = useActionState<AdminState, FormData>(bulkPlanAction, {});
  const [notice, noticeAct, noticePending] = useActionState<AdminState, FormData>(
    bulkNoticeAction,
    {},
  );
  const [mode, setMode] = useState<"plan" | "notice" | null>(null);

  if (ids.length === 0) return null;
  const n = ids.length;
  const state = plan.error || plan.ok ? plan : notice;

  return (
    /* Fixed to the bottom, above the phone tab bar. The selection is made by
       scrolling a table, so a bar that scrolls away with it would be gone by the
       time the last box is ticked. */
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--o-edge)] bg-[var(--o-panel)] px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+64px)] shadow-[0_-4px_16px_-12px_rgba(26,19,48,.4)] md:pb-3">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        <span className="k-num text-[12.5px] font-bold text-charcoal">
          {n} café{n === 1 ? "" : "s"}
        </span>
        <button type="button" onClick={onClear} className="text-[11.5px] font-semibold text-slate hover:text-charcoal">
          désélectionner
        </button>

        <span className="ms-auto flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setMode(mode === "plan" ? null : "plan")}
            className={`k-btn k-btn--sm ${mode === "plan" ? "" : "k-btn--ghost"}`}
          >
            Prolonger
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === "notice" ? null : "notice")}
            className={`k-btn k-btn--sm ${mode === "notice" ? "" : "k-btn--ghost"}`}
          >
            Message
          </button>
        </span>

        {mode === "plan" && (
          <form action={planAct} className="flex w-full flex-wrap items-center gap-2 pt-1">
            <Ids ids={ids} />
            <select name="plan" defaultValue="pro" className="k-field" aria-label="formule">
              <option value="pro">Pro</option>
              <option value="trial">Essai</option>
              <option value="free">Gratuit (illimité)</option>
            </select>
            <input
              name="amount"
              type="number"
              defaultValue={6}
              min={0}
              max={1000}
              className="k-field k-field--num w-[72px] text-center"
              aria-label="durée"
            />
            <select name="unit" defaultValue="months" className="k-field" aria-label="unité">
              <option value="months">mois</option>
              <option value="days">jours</option>
              <option value="hours">heures</option>
            </select>
            <button type="submit" disabled={planPending} className="k-btn k-btn--sm">
              {planPending ? "· ·" : `Appliquer à ${n} café${n === 1 ? "" : "s"}`}
            </button>
          </form>
        )}

        {mode === "notice" && (
          <form action={noticeAct} className="flex w-full flex-wrap items-center gap-2 pt-1">
            <Ids ids={ids} />
            <input
              name="message"
              required
              maxLength={500}
              placeholder="Maintenance dimanche de 8h à 10h…"
              className="k-field min-w-[200px] flex-1"
              aria-label="Message"
            />
            <select name="kind" defaultValue="info" className="k-field" aria-label="type">
              <option value="info">Info</option>
              <option value="warning">Avertissement</option>
              <option value="urgent">Urgent</option>
            </select>
            <input
              name="days"
              type="number"
              defaultValue={14}
              min={0}
              max={365}
              className="k-field k-field--num w-[64px] text-center"
              aria-label="jours"
            />
            <button type="submit" disabled={noticePending} className="k-btn k-btn--sm">
              {noticePending ? "· ·" : `Envoyer à ${n}`}
            </button>
          </form>
        )}

        {state.error && (
          <p role="alert" className="k-note k-bad w-full  px-3 py-2">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p role="status" className="k-note k-ok w-full  px-3 py-2">
            {state.ok}
          </p>
        )}
      </div>
    </div>
  );
}

/** One hidden field per selected shop — the server reads them with getAll. */
function Ids({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}
    </>
  );
}
