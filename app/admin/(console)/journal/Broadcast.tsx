"use client";

import { useActionState } from "react";
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
 */
export function Broadcast() {
  const [state, act, pending] = useActionState<AdminState, FormData>(noticeAction, {});

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
      <button type="submit" disabled={pending} className="k-btn w-full">
        {pending ? "· ·" : "Envoyer à tous les cafés"}
      </button>
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
