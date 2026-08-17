"use client";

import { useActionState, useState } from "react";
import { noticeAction, type AdminState } from "../actions";

/**
 * A message to every café at once.
 *
 * The only control in this console with no target, which is exactly why it says
 * so on its own button rather than in a label above it. It used to be a form
 * inside a <details> labelled "Message à tous les cafés" with a button reading
 * "Envoyer à tous les cafés" — correct, and read once, before the drawer was
 * left open and the button pressed on a later visit with a different intention.
 *
 * No businessId field at all: the RPC treats a missing one as "everyone", so
 * there is nothing here that could be filled in wrongly.
 *
 * ── AND IT ASKS TWICE, WHICH NOTHING ELSE HERE DOES BY ACCIDENT ──────────
 * Suspending ONE café makes the operator confirm. Deleting one makes them type
 * its slug. This reaches EVERY owner's dashboard at once and went out on a
 * single click — the widest-blast-radius control in the console was the only
 * one with no second step.
 *
 * Two presses, in-page, and the second one carries the count so the operator
 * reads what "tous" currently means before they commit. Not window.confirm():
 * a browser dialog is the same OK button used to dismiss cookie banners all
 * day, and the console already made that argument once (see ShopControls).
 */
export function Broadcast({ shops }: { shops?: number }) {
  const [state, act, pending] = useActionState<AdminState, FormData>(noticeAction, {});
  const [armed, setArmed] = useState(false);

  return (
    <form action={act} className="k-card space-y-2 p-4">
      <textarea
        name="message"
        rows={3}
        maxLength={500}
        required
        placeholder="Maintenance prévue dimanche de 8h à 10h…"
        className="k-field w-full resize-none"
        aria-label="Message à tous les cafés"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select name="kind" defaultValue="info" className="k-field w-auto" aria-label="type">
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
          aria-label="jours d'affichage"
        />
        <span className="text-[11px] text-slate">jours</span>
      </div>
      {armed ? (
        <div className="space-y-2">
          <p role="status" className="k-note k-warn px-3 py-2">
            Ce message s&apos;affichera sur le tableau de bord de{" "}
            <b>
              {shops === undefined
                ? "tous les cafés"
                : `${shops} café${shops === 1 ? "" : "s"}`}
            </b>
            .
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setArmed(false)}
              className="k-btn k-btn--sm k-btn--ghost flex-1"
            >
              Annuler
            </button>
            <button type="submit" disabled={pending} className="k-btn k-btn--sm flex-1">
              {pending ? "· ·" : "Confirmer l'envoi"}
            </button>
          </div>
        </div>
      ) : (
        /* type=button: it opens the question, it does not submit the form. */
        <button
          type="button"
          onClick={() => setArmed(true)}
          disabled={pending}
          className="k-btn w-full"
        >
          Envoyer à tous les cafés
        </button>
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
    </form>
  );
}
