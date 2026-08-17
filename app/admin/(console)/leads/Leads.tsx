"use client";

import { useMemo, useState } from "react";
import { businessType } from "@/lib/businessTypes";
import {
  prettyPhone,
  whatsappLink,
  STATUS_FLOW,
  STATUS_LABEL,
  WANT_LABEL,
  type EarlyLead,
  type EarlyStatus,
} from "@/lib/early";
import { deleteEarlyAction, setEarlyStatusAction, type AdminState } from "../actions";
import { ago } from "../ui";
import { useActionState } from "react";

/**
 * The lead list, as a pipeline you can stand in front of.
 *
 * ── WHAT THE FIRST VERSION GOT WRONG ──────────────────────────────────────
 *
 * It split the list in two — untouched rows visible, everything else folded
 * into a <details> — which is the right shape for a QUEUE and the wrong one for
 * a PIPELINE. A queue is cleared; a pipeline is worked, and the question "who
 * did I call last week and never hear back from?" was behind a fold with no way
 * to ask it. Contacted leads going quiet is the normal failure mode of a list
 * like this, and the interface hid exactly that.
 *
 * So: filter chips across the whole pipeline, defaulting to the untouched ones.
 * Same first screen, and every other stage is one tap away instead of nowhere.
 *
 * THE PHONE NUMBER IS THE PRIMARY CONTROL on every row. Everything else exists
 * to get to that tap — it is a wa.me link, so the operator lands in the thread
 * rather than copying digits into another app, which is where a list like this
 * normally goes to die.
 */
const TONE: Record<EarlyStatus, string> = {
  new: "k-warn",
  contacted: "k-idle",
  demo: "k-ok",
  client: "k-ok",
  lost: "k-idle",
};

type Filter = "new" | "working" | "client" | "lost" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "new", label: "À rappeler" },
  { id: "working", label: "En cours" },
  { id: "client", label: "Clients" },
  { id: "lost", label: "Perdus" },
  { id: "all", label: "Tous" },
];

function matches(l: EarlyLead, f: Filter): boolean {
  switch (f) {
    case "new":
      return l.status === "new";
    case "working":
      return l.status === "contacted" || l.status === "demo";
    case "client":
      return l.status === "client";
    case "lost":
      return l.status === "lost";
    default:
      return true;
  }
}

export function Leads({ rows }: { rows: EarlyLead[] }) {
  const [filter, setFilter] = useState<Filter>("new");
  const [q, setQ] = useState("");

  const counts = useMemo(
    () =>
      Object.fromEntries(FILTERS.map((f) => [f.id, rows.filter((l) => matches(l, f.id)).length])) as
        Record<Filter, number>,
    [rows],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (l) =>
        matches(l, filter) &&
        (!needle ||
          l.name.toLowerCase().includes(needle) ||
          l.phone.includes(needle.replace(/\s/g, ""))),
    );
  }, [rows, filter, q]);

  if (rows.length === 0) {
    return (
      <p className="k-card px-4 py-5 text-[13px] text-slate">
        Aucune demande. Le formulaire est en ligne sur /early.
      </p>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-lg px-3 py-1.5 text-[11.5px] font-bold transition ${
              filter === f.id
                ? "bg-royal text-white"
                : "border border-[var(--o-edge)] bg-[var(--o-panel)] text-slate hover:text-charcoal"
            }`}
          >
            {f.label}
            <span className={`k-num ms-1.5 ${filter === f.id ? "text-white/75" : "text-slate/70"}`}>
              {counts[f.id]}
            </span>
          </button>
        ))}
      </div>

      {rows.length > 8 && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nom du commerce ou numéro…"
          className="k-field mb-3 w-full"
          aria-label="Filtrer les demandes"
        />
      )}

      {shown.length === 0 ? (
        <p className="k-card px-4 py-5 text-[13px] text-slate">Rien dans cette étape.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((l) => (
            <LeadRow key={l.id} r={l} />
          ))}
        </ul>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */

function LeadRow({ r }: { r: EarlyLead }) {
  const [state, act, pending] = useActionState<AdminState, FormData>(setEarlyStatusAction, {});
  const [confirming, setConfirming] = useState(false);
  const kind = businessType(r.type);

  return (
    <li className="k-card p-3.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`k-dot ${TONE[r.status]} self-center`} aria-hidden />
        <span className="text-[14px] font-bold text-charcoal">
          <span aria-hidden>{kind.emoji}</span> {r.name}
        </span>
        <span className="k-num text-[11.5px] text-slate">{kind.label}</span>
        <span className="ms-auto text-[11.5px] text-slate">{ago(r.createdAt)}</span>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px]">
        {/* dir=ltr on the number: the leading + jumps to the wrong end otherwise,
            and a phone number reads left to right in every language. */}
        <a
          href={whatsappLink(r.phone)}
          target="_blank"
          rel="noopener"
          dir="ltr"
          className="k-btn k-btn--sm k-btn--ok"
        >
          {prettyPhone(r.phone)}
        </a>
        <span className={`k-pill ${TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
        {r.want && <span className="k-num text-slate">{WANT_LABEL[r.want] ?? r.want}</span>}
        {r.source && r.source !== "direct" && (
          <span className="k-num text-royal">{r.source}</span>
        )}
      </p>

      {r.note && (
        <p className="mt-2 border-s-2 border-[var(--o-edge)] ps-2.5 text-[12px] italic text-slate">
          « {r.note} »
        </p>
      )}

      <form action={act} className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="id" value={r.id} />

        {STATUS_FLOW.filter((s) => s !== r.status).map((s) => (
          <button
            key={s}
            type="submit"
            name="status"
            value={s}
            disabled={pending}
            className="k-btn k-btn--sm k-btn--ghost"
          >
            {STATUS_LABEL[s]}
          </button>
        ))}

        <input
          name="note"
          defaultValue={r.note ?? ""}
          placeholder="note…"
          maxLength={300}
          className="k-field min-w-[140px] flex-1"
          aria-label={`Note sur ${r.name}`}
        />
        {/* Saves the note WITHOUT moving the lead: it posts the status the row
            already has, which admin_set_early_status treats as a no-op on the
            pipeline (handled_at is stamped once and never re-stamped). */}
        <button
          type="submit"
          name="status"
          value={r.status}
          disabled={pending}
          className="k-btn k-btn--sm k-btn--ghost"
        >
          Note
        </button>
      </form>

      {/* A separate form, not a nested one — HTML forbids nesting, and a delete
          sharing the status form would submit the note field with it. */}
      <DeleteLead id={r.id} name={r.name} open={confirming} onOpen={setConfirming} />

      {state.error && (
        <p role="alert" className="k-note k-bad mt-2 w-full  px-3 py-2">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="mt-2 text-[11.5px] font-semibold text-[#1f7a52]">
          {state.ok}
        </p>
      )}
    </li>
  );
}

/**
 * Deleting is two taps, because it destroys a real person's request to be
 * contacted. The confirm names the shop, so an operator cannot discover
 * afterwards that they cleared the wrong row.
 */
function DeleteLead({
  id,
  name,
  open,
  onOpen,
}: {
  id: string;
  name: string;
  open: boolean;
  onOpen: (v: boolean) => void;
}) {
  const [state, act, pending] = useActionState<AdminState, FormData>(deleteEarlyAction, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpen(true)}
        className="mt-2 text-[11px] font-medium text-slate/70 transition hover:text-[#b3202f]"
      >
        Supprimer
      </button>
    );
  }

  return (
    <form action={act} className="mt-2.5 flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <span className="text-[11.5px] text-slate">Supprimer « {name} » définitivement ?</span>
      <button type="submit" disabled={pending} className="k-btn k-btn--sm k-btn--danger">
        Supprimer
      </button>
      <button type="button" onClick={() => onOpen(false)} className="k-btn k-btn--sm k-btn--ghost">
        Annuler
      </button>
      {state.error && (
        <span role="alert" className="text-[11.5px] font-semibold text-[#b3202f]">
          {state.error}
        </span>
      )}
    </form>
  );
}
