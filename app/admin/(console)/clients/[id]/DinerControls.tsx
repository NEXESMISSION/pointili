"use client";

import { useActionState, useState } from "react";
import { adjustPointsAction, resetDinerPinAction, type AdminState } from "../../actions";

/**
 * The two things support actually has to do to a customer.
 *
 * Neither existed anywhere in the console. A shop can adjust its own
 * cardholders' points and reset their codes from the till; the PLATFORM could
 * do neither — so a customer whose shop had closed, or who was locked out of a
 * café they no longer visit, had nobody who could help them.
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

export function DinerControls({
  publicId,
  cards,
}: {
  publicId: string;
  cards: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-2.5">
      <AdjustBox publicId={publicId} cards={cards} />
      <PinBox publicId={publicId} />
    </div>
  );
}

/* ══ points ═════════════════════════════════════════════════════════════ */

function AdjustBox({
  publicId,
  cards,
}: {
  publicId: string;
  cards: { id: string; name: string }[];
}) {
  const [state, act, pending] = useActionState<AdminState, FormData>(adjustPointsAction, {});
  const [delta, setDelta] = useState("");

  if (cards.length === 0) {
    return (
      <div className="k-card p-4">
        <p className="k-h">Corriger des points</p>
        <p className="mt-2 text-[12px] leading-snug text-slate">
          Ce client n&apos;a de carte nulle part — il n&apos;y a pas de solde à corriger.
        </p>
      </div>
    );
  }

  const n = Number(delta);
  const valid = Number.isFinite(n) && n !== 0;

  return (
    <div className="k-card p-4">
      <p className="k-h">Corriger des points</p>
      <form action={act} className="mt-2.5 space-y-2">
        <input type="hidden" name="publicId" value={publicId} />

        {/* Which shop, always explicitly. A correction is per-café — there is no
            platform-wide balance to move — and defaulting to "the first one"
            would put points in the wrong shop's books silently. */}
        <select name="businessId" className="k-field w-full" aria-label="Commerce" required>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap gap-2">
          <input
            name="delta"
            type="number"
            step="1"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="+50"
            className="k-field k-field--num w-[92px] text-center"
            aria-label="Points à ajouter ou retirer"
          />
          <input
            name="note"
            placeholder="Pourquoi ? (journal)"
            maxLength={200}
            className="k-field min-w-[140px] flex-1"
            aria-label="Raison de la correction"
          />
        </div>

        {/* The button says the direction, so a stray minus sign is visible
            BEFORE it is pressed rather than in the result line after. */}
        <button type="submit" disabled={pending || !valid} className="k-btn k-btn--sm w-full">
          {pending
            ? "· ·"
            : !valid
              ? "Indiquez un nombre"
              : n > 0
                ? `Ajouter ${n} points`
                : `Retirer ${Math.abs(n)} points`}
        </button>
      </form>
      <p className="mt-2 text-[11px] leading-snug text-slate">
        Écrit dans l&apos;historique du client et du commerce, comme une opération
        normale. Fonctionne même si le café est hors ligne.
      </p>
      <Result state={state} />
    </div>
  );
}

/* ══ the secret code ════════════════════════════════════════════════════ */

function PinBox({ publicId }: { publicId: string }) {
  const [state, act, pending] = useActionState<AdminState, FormData>(resetDinerPinAction, {});
  const [armed, setArmed] = useState(false);

  return (
    <div className="k-card p-4">
      <p className="k-h">Code secret</p>

      {armed ? (
        <form action={act} className="mt-2.5 space-y-2">
          <input type="hidden" name="publicId" value={publicId} />
          <p className="text-[12px] leading-snug text-charcoal">
            Un nouveau code à quatre chiffres sera tiré au sort et affiché{" "}
            <b>une seule fois</b>. L&apos;ancien cessera de fonctionner immédiatement.
          </p>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="k-btn k-btn--sm flex-1">
              {pending ? "· ·" : "Générer le nouveau code"}
            </button>
            <button
              type="button"
              onClick={() => setArmed(false)}
              className="k-btn k-btn--sm k-btn--ghost"
            >
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="k-btn k-btn--sm k-btn--ghost mt-2.5 w-full"
        >
          Réinitialiser le code
        </button>
      )}

      <p className="mt-2 text-[11px] leading-snug text-slate">
        Lève aussi le blocage après trop d&apos;essais. Le code n&apos;est stocké nulle
        part en clair : personne, nous compris, ne peut le relire ensuite.
      </p>

      {/*
        The digits live in this one line and nowhere else — not in the database,
        not in the audit log, and not on the page after a reload. Rendered
        bigger than anything else in the box because it is dictated over the
        phone once, and misreading it costs the whole call.
      */}
      {state.ok ? (
        <p role="status" className="k-note k-ok mt-2 w-full  px-3 py-2.5 text-[13px] font-bold">
          {state.ok}
        </p>
      ) : (
        <Result state={state} />
      )}
    </div>
  );
}
