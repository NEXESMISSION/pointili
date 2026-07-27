"use client";

import { useActionState } from "react";
import type { AdminCafe } from "@/lib/platform";
import {
  noticeAction,
  setPlanAction,
  setSuspendedAction,
  type AdminState,
} from "./actions";

const btn =
  "rounded-xl px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.06em] active:scale-95 disabled:opacity-50";
const field =
  "k-field";

function Result({ state }: { state: AdminState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-2 rounded-xl bg-[#fdecec] px-3 py-2 text-[11.5px] font-semibold text-[#c0341c]">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="mt-2 rounded-xl bg-[#e7f6ee] px-3 py-2 text-[11.5px] font-semibold text-[#2f9e6e]">
        {state.ok}
      </p>
    );
  }
  return null;
}

/** The three levers, rendered inside the table drawer. */
export function CafeDetail({ cafe }: { cafe: AdminCafe }) {
  const [planState, planFn, planPending] = useActionState<AdminState, FormData>(setPlanAction, {});
  const [susState, susFn, susPending] = useActionState<AdminState, FormData>(setSuspendedAction, {});
  const [noticeState, noticeFn, noticePending] = useActionState<AdminState, FormData>(noticeAction, {});

  return (
    <div className="px-4 py-3">
      {/* subscription */}
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#8b93a7]">
        Abonnement
      </p>
      <form action={planFn} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="businessId" value={cafe.id} />
        <select name="plan" defaultValue={cafe.plan} className={field}>
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
          className={`${field} w-[60px] text-center`}
          aria-label="durée"
        />
        <select name="unit" defaultValue="months" className={field} aria-label="unité">
          <option value="hours">heures</option>
          <option value="days">jours</option>
          <option value="months">mois</option>
        </select>
        <button type="submit" disabled={planPending} className={`${btn} bg-[#6d4ae6] text-white`}>
          {planPending ? "· ·" : "Appliquer"}
        </button>
      </form>
      <p className="mt-1.5 text-[10.5px] leading-snug text-[#8b93a7]">
        Prolonge à partir de l&apos;expiration actuelle (renouveler tôt ne perd
        rien). « Gratuit » = sans limite. Durée <b>0</b> = couper maintenant.
      </p>
      <Result state={planState} />

      {/* suspend / ban */}
      <p className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-[#8b93a7]">
        Modération
      </p>
      {cafe.suspendedAt ? (
        <form action={susFn}>
          <input type="hidden" name="businessId" value={cafe.id} />
          <input type="hidden" name="suspend" value="0" />
          <p className="mb-2 rounded-xl bg-[#fdecec] px-3 py-2 text-[11.5px] text-[#c0341c]">
            Suspendu : {cafe.suspendedReason ?? "sans raison"}
          </p>
          <button type="submit" disabled={susPending} className={`${btn} bg-[#2f9e6e] text-white`}>
            {susPending ? "· ·" : "Réactiver"}
          </button>
        </form>
      ) : (
        <form action={susFn} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="businessId" value={cafe.id} />
          <input type="hidden" name="suspend" value="1" />
          <input
            name="reason"
            placeholder="Raison (obligatoire)"
            maxLength={200}
            className={`${field} min-w-0 flex-1`}
          />
          <button
            type="submit"
            disabled={susPending}
            onClick={(e) => {
              if (!confirm(`Suspendre « ${cafe.name} » ? Les clients perdront l'accès immédiatement.`)) {
                e.preventDefault();
              }
            }}
            className={`${btn} border border-[#e5484d] text-[#e5484d]`}
          >
            {susPending ? "· ·" : "Suspendre"}
          </button>
        </form>
      )}
      <p className="mt-1.5 text-[10.5px] leading-snug text-[#8b93a7]">
        Coupe l&apos;accès des clients à /{cafe.slug} immédiatement.
      </p>
      <Result state={susState} />

      {/* notice */}
      <p className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-[#8b93a7]">
        Message au propriétaire
      </p>
      <form action={noticeFn} className="space-y-2">
        <input type="hidden" name="businessId" value={cafe.id} />
        <div className="flex gap-2">
          <select name="kind" defaultValue="info" className={field}>
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
            className={`${field} w-[60px] text-center`}
            aria-label="jours"
          />
          <span className="self-center text-[11px] text-[#8b93a7]">jours</span>
        </div>
        <textarea
          name="message"
          rows={2}
          maxLength={500}
          placeholder="Votre essai se termine dans 3 jours…"
          className={`${field} w-full resize-none`}
        />
        <button type="submit" disabled={noticePending} className={`${btn} bg-[#1a1f2b] border border-[#2b3145] text-[#e6e8ee]`}>
          {noticePending ? "· ·" : "Envoyer"}
        </button>
      </form>
      <Result state={noticeState} />
    </div>
  );
}

/** Broadcast to every café at once. */
export function BroadcastForm() {
  const [state, action, pending] = useActionState<AdminState, FormData>(noticeAction, {});
  return (
    <form action={action} className="space-y-2">
      {/* no businessId → the RPC treats it as "all cafés" */}
      <div className="flex gap-2">
        <select name="kind" defaultValue="info" className={field}>
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
          className={`${field} w-[60px] text-center`}
          aria-label="jours"
        />
        <span className="self-center text-[11px] text-[#8b93a7]">jours</span>
      </div>
      <textarea
        name="message"
        rows={2}
        maxLength={500}
        placeholder="Maintenance prévue dimanche…"
        className={`${field} w-full resize-none`}
      />
      <button type="submit" disabled={pending} className={`${btn} w-full bg-[#1a1f2b] border border-[#2b3145] py-2.5 text-[#e6e8ee]`}>
        {pending ? "· ·" : "Envoyer à tous les cafés"}
      </button>
      <Result state={state} />
    </form>
  );
}
