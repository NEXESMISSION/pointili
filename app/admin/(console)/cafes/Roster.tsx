"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AdminCafe, Remaining } from "@/lib/platform";
import { ago, day, PLAN_LABEL, shopTone } from "../ui";
import { BulkBar } from "./BulkBar";

/**
 * THE ROSTER — every shop, rankable, and every row is a LINK now.
 *
 * WHAT CHANGED, and why it is not a restyle. This table used to open a modal
 * drawer: clicking a café dimmed the platform behind it and showed four
 * aggregate numbers with three form controls under them. That drawer could not
 * be linked to, could not survive a reload, could not be opened in a second tab
 * to compare two shops, and had nowhere to put the things an operator actually
 * asks for — the ledger, the reward ladder, the history of what we did. Rows
 * point at /admin/cafes/[id] instead, which is a real page with all of it.
 *
 * ── A TABLE ON A DESKTOP, CARDS ON A PHONE ────────────────────────────────
 *
 * Not a responsive compromise — two correct answers. At a desk the question is
 * comparative ("who expires this week", "who has the most customers") and only
 * a dense sortable grid answers it. On a phone the same grid was 560px wide
 * inside a 360px screen, so every row was read by swiping sideways; there the
 * question is singular ("what is going on with THIS shop") and a card answers
 * it without scrolling in two axes.
 *
 * ── THE COLUMN THAT WAS MISSING ───────────────────────────────────────────
 *
 * "Dernière activité". The old table ranked shops by customers and by points —
 * both cumulative, so a café that stopped trading in March still looks like one
 * of the best on the platform forever. A shop whose till has been silent for
 * six weeks is the single most actionable row in this console and it was
 * unsortable and undisplayed.
 */

export type Row = AdminCafe & { left: Remaining };

type Filter = "all" | "live" | "soon" | "expired" | "suspended" | "quiet";
type SortKey = "name" | "customers" | "points" | "expiry" | "activity";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "live", label: "En ligne" },
  { id: "soon", label: "Bientôt" },
  { id: "expired", label: "Expirés" },
  { id: "suspended", label: "Suspendus" },
  { id: "quiet", label: "Silencieux" },
];

/** Fourteen days without a single point credited. Long enough that a slow week
 *  does not raise it, short enough to still be worth a phone call. */
const QUIET_MS = 14 * 86_400_000;

function matches(r: Row, f: Filter): boolean {
  switch (f) {
    case "live":
      return r.live && !r.suspendedAt;
    case "soon":
      return r.left.soon && !r.left.expired && !r.left.unlimited;
    case "expired":
      return r.left.expired;
    case "suspended":
      return Boolean(r.suspendedAt);
    case "quiet":
      return (
        r.live &&
        !r.suspendedAt &&
        (!r.lastActivity || Date.now() - new Date(r.lastActivity).getTime() > QUIET_MS)
      );
    default:
      return true;
  }
}

export function Roster({ rows }: { rows: Row[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("activity");
  const [desc, setDesc] = useState(true);
  /*
    THE SELECTION IS A SET OF IDS, NOT A FLAG ON EACH ROW.

    Filtering and sorting rebuild the visible list constantly, and per-row state
    would silently drop a café out of the selection the moment it stopped
    matching the filter — so an operator who ticks six shops under "Bientôt",
    then switches to "Tous" to check one of them, would send five. A set of ids
    survives every re-render of the table, and "select all" below only ever adds
    what is currently ON SCREEN, which is the only honest meaning of the phrase.
  */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const counts = useMemo(
    () =>
      Object.fromEntries(FILTERS.map((f) => [f.id, rows.filter((r) => matches(r, f.id)).length])) as
        Record<Filter, number>,
    [rows],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        matches(r, filter) &&
        (!needle ||
          r.name.toLowerCase().includes(needle) ||
          r.slug.includes(needle) ||
          (r.ownerEmail ?? "").toLowerCase().includes(needle)),
    );
    /* Unlimited plans sort last on expiry — they never expire, so they are
       never urgent. A shop that has never traded sorts as the oldest possible
       activity rather than as "now", which is what `?? 0` gives you. */
    const key = (r: Row): string | number =>
      sort === "name"
        ? r.name.toLowerCase()
        : sort === "customers"
          ? r.customers
          : sort === "points"
            ? r.pointsIssued
            : sort === "activity"
              ? (r.lastActivity ? new Date(r.lastActivity).getTime() : 0)
              : r.left.unlimited
                ? Number.MAX_SAFE_INTEGER
                : new Date(r.planExpiresAt ?? 0).getTime();

    return [...list].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      const cmp =
        typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return desc ? -cmp : cmp;
    });
  }, [rows, filter, q, sort, desc]);

  const allShown = shown.length > 0 && shown.every((r) => picked.has(r.id));
  const toggleAll = () =>
    setPicked((s) => {
      const next = new Set(s);
      if (allShown) shown.forEach((r) => next.delete(r.id));
      else shown.forEach((r) => next.add(r.id));
      return next;
    });

  /** A checkbox that must not navigate — every row is a link. */
  const Tick = ({ id }: { id: string }) => (
    <input
      type="checkbox"
      checked={picked.has(id)}
      onChange={() => toggle(id)}
      onClick={(e) => e.stopPropagation()}
      aria-label="Sélectionner ce café"
      className="h-4 w-4 shrink-0 accent-[var(--color-royal)]"
    />
  );

  const head = (key: SortKey, label: string, right = false) => (
    <th scope="col" className={`px-3 py-2 ${right ? "text-end" : "text-start"}`}>
      <button
        type="button"
        onClick={() => {
          if (sort === key) setDesc(!desc);
          else {
            setSort(key);
            setDesc(key !== "name"); // numbers and dates are most useful biggest-first
          }
        }}
        className={`k-h transition hover:text-charcoal ${sort === key ? "!text-royal" : ""}`}
      >
        {label}
        {sort === key && <span className="ms-1">{desc ? "↓" : "↑"}</span>}
      </button>
    </th>
  );

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
            {/* The count must stay readable ON the filled chip: slate ink on
                royal lands at 1.2:1, and the number being read is the one that
                disappears. */}
            <span className={`k-num ms-1.5 ${filter === f.id ? "text-white/75" : "text-slate/70"}`}>
              {counts[f.id]}
            </span>
          </button>
        ))}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Nom, slug ou email du propriétaire…"
        className="k-field mb-3 w-full"
        aria-label="Filtrer les cafés"
      />

      {shown.length === 0 ? (
        <p className="k-card px-4 py-6 text-center text-[13px] text-slate">
          Aucun café ne correspond.
        </p>
      ) : (
        <>
          {/* ── the grid, md and up ─────────────────────────────────── */}
          <div className="k-card hidden overflow-hidden md:block">
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="border-b border-[var(--o-edge)] bg-[var(--o-inset)]">
                <tr>
                  <th scope="col" className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allShown}
                      onChange={toggleAll}
                      aria-label="Tout sélectionner"
                      className="h-4 w-4 accent-[var(--color-royal)]"
                    />
                  </th>
                  {head("name", "Café")}
                  {head("activity", "Dernière activité", true)}
                  {head("customers", "Clients", true)}
                  {head("points", "Points", true)}
                  {head("expiry", "Abonnement", true)}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const { tone, label } = shopTone(r);
                  return (
                    <tr key={r.id} className="k-row transition hover:bg-[var(--o-inset)]">
                      <td className="px-3 py-2.5">
                        <Tick id={r.id} />
                      </td>
                      <td className="px-3 py-2.5">
                        {/* The LINK carries the name, so the row is reachable by
                            keyboard and openable in a new tab — a <tr onClick>
                            is neither. */}
                        <Link href={`/admin/cafes/${r.id}`} className="flex items-center gap-2">
                          <span className={`k-dot k-${tone}`} title={label} aria-hidden />
                          <span className="min-w-0">
                            <span className="block truncate font-bold text-charcoal">{r.name}</span>
                            <span className="k-num block truncate text-[10.5px] text-slate">
                              /{r.slug}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-end text-slate">{ago(r.lastActivity)}</td>
                      <td className="k-num px-3 py-2.5 text-end text-charcoal">{r.customers}</td>
                      <td className="k-num px-3 py-2.5 text-end text-royal">
                        {r.pointsIssued.toLocaleString("fr-FR")}
                      </td>
                      <td className="px-3 py-2.5 text-end">
                        <Plan row={r} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── cards, below md ─────────────────────────────────────── */}
          <ul className="space-y-2 md:hidden">
            {shown.map((r) => {
              const { tone, label } = shopTone(r);
              return (
                <li key={r.id} className="k-card flex items-start gap-2 px-3 py-3">
                  <span className="pt-0.5">
                    <Tick id={r.id} />
                  </span>
                  <Link href={`/admin/cafes/${r.id}`} className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`k-dot k-${tone}`} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-charcoal">
                        {r.name}
                      </span>
                      <Plan row={r} />
                    </span>
                    <span className="k-num mt-1.5 flex flex-wrap gap-x-2 text-[11px] text-slate">
                      <span>/{r.slug}</span>
                      <span className="text-slate/40">·</span>
                      <span>{label}</span>
                      <span className="text-slate/40">·</span>
                      <span>{r.customers} clients</span>
                      <span className="text-slate/40">·</span>
                      <span>{ago(r.lastActivity)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="mt-2 text-[11px] text-slate">
            {shown.length} sur {rows.length}
            {picked.size > 0 && ` · ${picked.size} sélectionné(s)`}
          </p>
        </>
      )}

      <BulkBar ids={[...picked]} onClear={() => setPicked(new Set())} />
    </>
  );
}

/** The plan chip and what is left of it — one component so the table and the
 *  phone cards can never word it differently. */
function Plan({ row }: { row: Row }) {
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span
        className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.05em] ${
          row.plan === "pro" ? "bg-royal text-white" : "bg-[var(--o-inset)] text-royal"
        }`}
      >
        {(PLAN_LABEL[row.plan] ?? row.plan).toUpperCase()}
      </span>
      {!row.left.unlimited && (
        <span
          className={`k-num text-[10px] font-semibold ${
            row.left.expired ? "text-[#b3202f]" : row.left.soon ? "text-[#8a5a00]" : "text-slate"
          }`}
        >
          {row.left.expired ? "expiré" : `${row.left.label} · ${day(row.planExpiresAt)}`}
        </span>
      )}
    </span>
  );
}
