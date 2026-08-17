"use client";

import { useActionState, useState } from "react";
import type { ShopDetail } from "@/lib/platform";
import { noticeAction, setPlanAction, setSuspendedAction, type AdminState } from "../../actions";

/**
 * The three levers, on the shop's own page instead of inside a modal.
 *
 * WHAT WAS WRONG WITH THE OLD ONES — beyond where they lived.
 *
 * 1. RENEWING WAS ALWAYS A FORM. Extending by six months or a year is what
 *    happens nearly every time, and it cost a plan select, a number and a unit
 *    dropdown — three chances to typo a duration into a paying customer's
 *    account. The queue on the front page grew one-tap buttons for exactly this
 *    reason; there was no reason the shop's own page should be worse.
 *
 * 2. SUSPENDING ASKED FOR CONFIRMATION WITH window.confirm(). That is a browser
 *    dialog with an OK button, dismissed by muscle memory, and it is the guard
 *    on the single most destructive thing in this console — it takes a paying
 *    shop's customers offline instantly. It is a typed confirmation now: the
 *    reason field is mandatory (it always was, server-side) and the button only
 *    arms once a reason exists, so the guard is the same keystroke as the audit
 *    trail rather than an extra one to click past.
 *
 * 3. NOTHING SAID WHAT WOULD HAPPEN. "Appliquer" on a plan form, with the
 *    consequence explained in grey type underneath. Each control now states its
 *    own outcome on the button — "+1 an", "Suspendre le café", "Envoyer" — and
 *    the result line reports what came BACK from Postgres rather than what was
 *    sent (see verdict() in actions.ts, and the bug that taught us).
 */

function Result({ state }: { state: AdminState }) {
  if (state.error) {
    return (
      <p role="alert" className="k-note k-bad mt-2 w-full  px-3 py-2">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="k-note k-ok mt-2 w-full  px-3 py-2">
        {state.ok}
      </p>
    );
  }
  return null;
}

export function ShopControls({ shop }: { shop: ShopDetail["shop"] }) {
  return (
    <div className="space-y-2.5">
      <PlanBox shop={shop} />
      <ModerationBox shop={shop} />
      <NoticeBox shop={shop} />
    </div>
  );
}

/* ══ subscription ═══════════════════════════════════════════════════════ */

function PlanBox({ shop }: { shop: ShopDetail["shop"] }) {
  const [state, act, pending] = useActionState<AdminState, FormData>(setPlanAction, {});
  const [custom, setCustom] = useState(false);

  /* A paying renewal promotes a trial to pro; anything else keeps what it has.
     Same rule as the front-page queue, and it lives in both places rather than
     being a prop, because getting it wrong here silently gives away a plan. */
  const plan = shop.plan === "trial" ? "pro" : shop.plan;

  return (
    <div className="k-card p-4">
      <p className="k-h">Abonnement</p>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {[
          { months: 6, label: "+6 mois" },
          { months: 12, label: "+1 an" },
        ].map((o) => (
          <form key={o.months} action={act}>
            <input type="hidden" name="businessId" value={shop.id} />
            <input type="hidden" name="plan" value={plan} />
            <input type="hidden" name="amount" value={o.months} />
            <input type="hidden" name="unit" value="months" />
            <button type="submit" disabled={pending} className="k-btn k-btn--sm">
              {o.label}
            </button>
          </form>
        ))}
        <button
          type="button"
          onClick={() => setCustom((v) => !v)}
          className="k-btn k-btn--sm k-btn--ghost"
        >
          {custom ? "Annuler" : "Autre durée…"}
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-snug text-slate">
        Prolonge à partir de l&apos;expiration actuelle — renouveler tôt ne perd rien.
      </p>

      {/* The full form, folded away. It can set a trial, grant an unlimited
          'free' plan, work in hours for a grace extension, or cut a shop off
          with a duration of 0 — all real needs, none of them frequent. */}
      {custom && (
        <form action={act} className="mt-3 space-y-2 border-t border-[var(--o-edge)] pt-3">
          <input type="hidden" name="businessId" value={shop.id} />
          <div className="flex flex-wrap gap-2">
            <select name="plan" defaultValue={shop.plan} className="k-field w-auto" aria-label="formule">
              <option value="trial">Essai</option>
              <option value="pro">Pro</option>
              <option value="free">Gratuit (illimité)</option>
            </select>
            <input
              name="amount"
              type="number"
              defaultValue={1}
              min={0}
              max={1000}
              className="k-field k-field--num w-[72px] text-center"
              aria-label="durée"
            />
            <select name="unit" defaultValue="months" className="k-field w-auto" aria-label="unité">
              <option value="hours">heures</option>
              <option value="days">jours</option>
              <option value="months">mois</option>
            </select>
          </div>
          <p className="text-[11px] leading-snug text-slate">
            « Gratuit » = sans limite. Durée <b>0</b> = couper l&apos;accès maintenant.
          </p>
          <button type="submit" disabled={pending} className="k-btn k-btn--sm w-full">
            {pending ? "· ·" : "Appliquer"}
          </button>
        </form>
      )}

      <Result state={state} />
    </div>
  );
}

/* ══ suspension ═════════════════════════════════════════════════════════ */

function ModerationBox({ shop }: { shop: ShopDetail["shop"] }) {
  const [state, act, pending] = useActionState<AdminState, FormData>(setSuspendedAction, {});
  const [reason, setReason] = useState("");

  if (shop.suspendedAt) {
    return (
      <div className="k-card p-4">
        <p className="k-h">Modération</p>
        <p className="k-note k-bad mt-2.5 w-full  px-3 py-2">
          Suspendu : {shop.suspendedReason || "sans raison"}
        </p>
        <form action={act} className="mt-2">
          <input type="hidden" name="businessId" value={shop.id} />
          <input type="hidden" name="suspend" value="0" />
          <button type="submit" disabled={pending} className="k-btn k-btn--sm k-btn--ok w-full">
            {pending ? "· ·" : "Lever la suspension"}
          </button>
        </form>
        <p className="mt-2 text-[11px] leading-snug text-slate">
          Réactiver ne remet pas forcément le café en ligne : son abonnement peut avoir
          expiré pendant la suspension.
        </p>
        <Result state={state} />
      </div>
    );
  }

  return (
    <div className="k-card p-4">
      <p className="k-h">Modération</p>
      <form action={act} className="mt-2.5 space-y-2">
        <input type="hidden" name="businessId" value={shop.id} />
        <input type="hidden" name="suspend" value="1" />
        <input
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Raison — le propriétaire la verra"
          maxLength={200}
          className="k-field w-full"
          aria-label="Raison de la suspension"
        />
        {/*
          THE REASON IS THE CONFIRMATION.

          This used to be a window.confirm() — a browser dialog whose OK button
          is clicked past by reflex, guarding the one action here that takes a
          paying shop's customers offline the instant it lands. The button is
          simply dead until a reason has been typed, so the deliberate act and
          the audit record are the same keystrokes instead of two separate
          hurdles, one of which was theatre.
        */}
        <button
          type="submit"
          disabled={pending || reason.trim().length < 3}
          className="k-btn k-btn--sm k-btn--danger w-full"
        >
          {pending ? "· ·" : `Suspendre ${shop.name}`}
        </button>
      </form>
      <p className="mt-2 text-[11px] leading-snug text-slate">
        Coupe immédiatement l&apos;accès des clients à /{shop.slug}. Écrivez la raison
        pour activer le bouton.
      </p>
      <Result state={state} />
    </div>
  );
}

/* ══ a message to the owner ═════════════════════════════════════════════ */

function NoticeBox({ shop }: { shop: ShopDetail["shop"] }) {
  const [state, act, pending] = useActionState<AdminState, FormData>(noticeAction, {});

  return (
    <div className="k-card p-4">
      <p className="k-h">Message au propriétaire</p>
      <form action={act} className="mt-2.5 space-y-2">
        <input type="hidden" name="businessId" value={shop.id} />
        <textarea
          name="message"
          rows={3}
          maxLength={500}
          placeholder="Votre abonnement se termine dans 3 jours…"
          className="k-field w-full resize-none"
          aria-label="Message"
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
          <button type="submit" disabled={pending} className="k-btn k-btn--sm ms-auto">
            {pending ? "· ·" : "Envoyer"}
          </button>
        </div>
      </form>
      <p className="mt-2 text-[11px] leading-snug text-slate">
        S&apos;affiche sur le tableau de bord de {shop.ownerEmail ?? "son propriétaire"}.
      </p>
      <Result state={state} />
    </div>
  );
}
