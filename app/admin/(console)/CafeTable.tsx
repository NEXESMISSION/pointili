"use client";

import { useMemo, useState } from "react";
import type { AdminCafe, Remaining } from "@/lib/platform";
import { CafeDetail } from "./CafeControls";

/*
  The café list as a TABLE.

  A console is not a phone app. The operator opens it to answer questions across
  the whole platform — "who expires this week?", "who has the most customers?",
  "which one is suspended and why?" — and a stack of accordion cards can answer
  none of them: you cannot compare two shops that are 400 pixels apart, and you
  cannot sort a pile.

  So: filter chips over a dense, sortable table. One row per café, columns you
  can rank by, and the levers (plan, suspension, message) in a drawer so opening
  one café never pushes the others off screen.
*/

export type Row = AdminCafe & { left: Remaining };

type Filter = "all" | "live" | "soon" | "expired" | "suspended";
type SortKey = "name" | "customers" | "points" | "expiry";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "live", label: "En ligne" },
  { id: "soon", label: "Bientôt" },
  { id: "expired", label: "Expirés" },
  { id: "suspended", label: "Suspendus" },
];

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
    default:
      return true;
  }
}

export function CafeTable({ rows }: { rows: Row[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [desc, setDesc] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [f.id, rows.filter((r) => matches(r, f.id)).length]),
      ) as Record<Filter, number>,
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
    // Unlimited plans sort last on expiry: they never expire, so they are never urgent.
    const key = (r: Row) =>
      sort === "name"
        ? r.name.toLowerCase()
        : sort === "customers"
          ? r.customers
          : sort === "points"
            ? r.pointsIssued
            : r.left.unlimited
              ? Number.MAX_SAFE_INTEGER
              : new Date(r.planExpiresAt ?? 0).getTime();
    return [...list].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      const cmp = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return desc ? -cmp : cmp;
    });
  }, [rows, filter, q, sort, desc]);

  const open = rows.find((r) => r.id === openId) ?? null;

  const head = (key: SortKey, label: string, right = false) => (
    <th className={`px-3 py-2 font-bold ${right ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => {
          if (sort === key) setDesc(!desc);
          else {
            setSort(key);
            setDesc(key !== "name"); // numbers are most useful biggest-first
          }
        }}
        className={`uppercase tracking-[0.06em] ${sort === key ? "text-[#9d86ff]" : "text-[#8b93a7]"}`}
      >
        {label}
        {sort === key && <span className="ml-1">{desc ? "↓" : "↑"}</span>}
      </button>
    </th>
  );

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-md px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.05em] ${
              filter === f.id
                ? "bg-[#6d4ae6] text-white"
                : "border border-[#232838] bg-[#12151d] text-[#8b93a7]"
            }`}
          >
            {f.label}
            <span className={filter === f.id ? "ml-1.5 text-white/70" : "ml-1.5 text-[#5c6478]"}>
              {counts[f.id]}
            </span>
          </button>
        ))}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filtrer par nom, slug ou email…"
        className="k-field mb-2 w-full"
      />

      <div className="overflow-x-auto rounded-lg border border-[#232838] bg-[#12151d]">
        <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
          <thead className="border-b border-[#232838] text-[10px]">
            <tr>
              {head("name", "Café")}
              {head("customers", "Clients", true)}
              {head("points", "Points", true)}
              {head("expiry", "Abonnement", true)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1b202c]">
            {shown.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-[12.5px] text-[#8b93a7]">
                  Aucun café ne correspond.
                </td>
              </tr>
            ) : (
              shown.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setOpenId(r.id)}
                  className="cursor-pointer transition hover:bg-[#171b26]"
                >
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <Dot cafe={r} />
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-[#e6e8ee]">{r.name}</span>
                        <span className="block truncate font-mono text-[10.5px] text-[#8b93a7]">
                          /{r.slug}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#e6e8ee]">{r.customers}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#9d86ff]">{r.pointsIssued}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Plan cafe={r} left={r.left} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {shown.length > 0 && (
        <p className="mt-1.5 text-[10.5px] text-[#5c6478]">
          {shown.length} sur {rows.length} · cliquez une ligne pour agir dessus
        </p>
      )}

      {open && <Drawer cafe={open} onClose={() => setOpenId(null)} />}
    </section>
  );
}

/* ── the drawer: act on one café without losing the others ────────────── */

function Drawer({ cafe, onClose }: { cafe: Row; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={cafe.name}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[460px] flex-col overflow-y-auto border-l border-[#232838] bg-[#0f121a]"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#232838] bg-[#0f121a] px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2">
              <Dot cafe={cafe} />
              <span className="truncate text-[16px] font-bold text-[#e6e8ee]">{cafe.name}</span>
            </p>
            <p className="mt-0.5 truncate font-mono text-[10.5px] text-[#8b93a7]">
              /{cafe.slug} · {cafe.ownerEmail ?? "—"}
            </p>
            <p className="mt-1 text-[10.5px] text-[#8b93a7]">
              {cafe.customers} client{cafe.customers === 1 ? "" : "s"} · {cafe.pointsIssued} pts ·
              créé le {new Date(cafe.createdAt).toLocaleDateString("fr-FR")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 rounded-md border border-[#232838] px-2 py-1 text-[13px] text-[#8b93a7]"
          >
            ✕
          </button>
        </header>
        <CafeDetail cafe={cafe} />
      </aside>
    </div>
  );
}

/* ── row furniture ────────────────────────────────────────────────────── */

function Dot({ cafe }: { cafe: AdminCafe }) {
  const [colour, title] = cafe.suspendedAt
    ? ["bg-[#e5484d]", "suspendu"]
    : cafe.live
      ? ["bg-[#2f9e6e]", "en ligne"]
      : ["bg-[#e0a52e]", "expiré"];
  return <span className={`h-2 w-2 shrink-0 rounded-full ${colour}`} title={title} />;
}

function Plan({ cafe, left }: { cafe: AdminCafe; left: Remaining }) {
  const label = cafe.plan === "free" ? "GRATUIT" : cafe.plan === "pro" ? "PRO" : "ESSAI";
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span
        className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-[0.06em] ${
          cafe.plan === "pro" ? "bg-[#6d4ae6] text-white" : "bg-[#1b2030] text-[#9d86ff]"
        }`}
      >
        {label}
      </span>
      {!left.unlimited && (
        <span
          className={`text-[10px] font-semibold ${
            left.expired ? "text-[#e5484d]" : left.soon ? "text-[#e0a52e]" : "text-[#8b93a7]"
          }`}
        >
          {left.expired ? "expiré" : left.label}
        </span>
      )}
    </span>
  );
}
