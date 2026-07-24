"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { StampIcon } from "@/components/icons";
import type { Activity, OwnerCard } from "@/lib/db";
import {
  adjustPointsAction,
  cardHistoryAction,
  searchCardsAction,
  setStampsAction,
} from "./actions";

const ACTIVITY_LABEL: Record<Activity["reason"], string> = {
  earn: "Achat",
  welcome: "Bienvenue",
  redeem: "Échange",
  adjust: "Ajustement",
  expire: "Expiration",
  collected: "Récupéré",
};

function ago(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hier" : `il y a ${d} j`;
}


export function ClientsView({
  initial,
  stampsEnabled,
  stampsRequired,
}: {
  initial: { total: number; cards: OwnerCard[] };
  stampsEnabled: boolean;
  stampsRequired: number;
}) {
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<OwnerCard[]>(initial.cards);
  const [total, setTotal] = useState(initial.total);
  const [open, setOpen] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const first = useRef(true);

  // Debounced search — skip the first render (we already have SSR data).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      startSearch(async () => {
        const res = await searchCardsAction(query, 0);
        setCards(res.cards);
        setTotal(res.total);
        setOpen(null);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  function loadMore() {
    startSearch(async () => {
      const res = await searchCardsAction(query, cards.length);
      setCards((prev) => [...prev, ...res.cards]);
      setTotal(res.total);
    });
  }

  function patch(phone: string, next: Partial<OwnerCard>) {
    setCards((prev) => prev.map((c) => (c.phone === phone ? { ...c, ...next } : c)));
  }

  return (
    <div className="space-y-3.5">
      <div>
        <h1 className="px-1 text-[24px] font-extrabold text-charcoal">Clients</h1>
        <p className="mt-0.5 px-1 text-[13px] text-slate">
          {total} carte{total === 1 ? "" : "s"} · recherchez, ajustez, consultez.
        </p>
      </div>

      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un nom, un code ou un numéro…"
          /* !pl-11: .o-field is non-layered CSS and its padding beats a plain
             pl-* utility, so the text would sit under the search icon. */
          className="o-field !pl-11"
          inputMode="search"
        />
        <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3.5 text-slate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" strokeLinecap="round" />
          </svg>
        </span>
      </div>

      {cards.length === 0 ? (
        <p className="o-card px-4 py-10 text-center text-[13.5px] text-slate">
          {searching ? "Recherche…" : query ? "Aucune carte ne correspond." : "Aucun client pour l'instant."}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {cards.map((card) => (
            <CardRow
              key={card.phone}
              card={card}
              open={open === card.phone}
              onToggle={() => setOpen(open === card.phone ? null : card.phone)}
              onPatch={(next) => patch(card.phone, next)}
              stampsEnabled={stampsEnabled}
              stampsRequired={stampsRequired}
            />
          ))}
        </ul>
      )}

      {cards.length < total && (
        <button
          type="button"
          onClick={loadMore}
          disabled={searching}
          className="w-full rounded-2xl border border-hair bg-white py-3 text-[13px] font-bold text-charcoal active:scale-[0.99] disabled:opacity-55"
        >
          {searching ? "· · ·" : `Voir plus (${total - cards.length})`}
        </button>
      )}
    </div>
  );
}

function CardRow({
  card,
  open,
  onToggle,
  onPatch,
  stampsEnabled,
  stampsRequired,
}: {
  card: OwnerCard;
  open: boolean;
  onToggle: () => void;
  onPatch: (next: Partial<OwnerCard>) => void;
  stampsEnabled: boolean;
  stampsRequired: number;
}) {
  const [history, setHistory] = useState<Activity[] | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [pointsDelta, setPointsDelta] = useState("");
  const [stampCount, setStampCount] = useState(String(card.stamps));

  // Lazy-load the history the first time the card is opened.
  useEffect(() => {
    if (open && history === null) {
      start(async () => setHistory(await cardHistoryAction(card.phone)));
    }
  }, [open, history, card.phone]);

  function applyPoints() {
    const delta = Number(pointsDelta.replace(",", "."));
    if (!Number.isFinite(delta) || delta === 0) return;
    start(async () => {
      const res = await adjustPointsAction(card.phone, delta);
      if (res.ok && typeof res.balance === "number") {
        onPatch({ balance: res.balance });
        setPointsDelta("");
        setMsg(`Solde : ${res.balance} points`);
      } else setMsg(res.error ?? "Échec.");
    });
  }

  function applyStamps() {
    const c = Number(stampCount);
    if (!Number.isFinite(c) || c < 0) return;
    start(async () => {
      const res = await setStampsAction(card.phone, c);
      if (res.ok && typeof res.count === "number") {
        onPatch({ stamps: res.count });
        setStampCount(String(res.count));
        setMsg(`${res.count} / ${res.required} tampons`);
      } else setMsg(res.error ?? "Échec.");
    });
  }

  return (
    <li className="o-card overflow-hidden">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lilac-2 text-[15px] font-extrabold text-royal">
          {(card.name ?? "?").charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-bold text-charcoal">
            {card.name ?? "Sans nom"}
          </span>
          <span className="block truncate text-[11.5px] text-slate">
            <span className="font-mono font-bold tracking-[0.1em] text-charcoal">{card.code ?? "—"}</span>
            {" · "}
            {ago(card.lastAt)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[14px] font-extrabold tabular-nums text-royal">{card.balance}</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate">points</span>
        </span>
        {stampsEnabled && (
          <span className="ml-1 flex shrink-0 items-center gap-1 rounded-full bg-charcoal/90 px-2 py-1 text-[11px] font-bold text-white">
            <StampIcon className="h-3.5 w-3.5" /> {card.stamps}/{stampsRequired}
          </span>
        )}
        {card.pending > 0 && (
          <span className="ml-1 shrink-0 rounded-full bg-gold-soft px-2 py-1 text-[10px] font-bold text-gold-deep">
            {card.pending} code{card.pending === 1 ? "" : "s"}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-hair bg-lilac-2/40 px-4 py-3.5">
          {/* adjust points */}
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-slate">Corriger les points</p>
          <div className="mt-1.5 flex gap-2">
            <input
              value={pointsDelta}
              onChange={(e) => setPointsDelta(e.target.value)}
              inputMode="numeric"
              placeholder="+10 ou -5"
              className="o-field !bg-white font-mono"
            />
            <button
              type="button"
              onClick={applyPoints}
              disabled={pending}
              className="shrink-0 rounded-xl bg-royal px-4 text-[12.5px] font-bold text-white active:scale-95 disabled:opacity-55"
            >
              Appliquer
            </button>
          </div>

          {/* adjust stamps */}
          {stampsEnabled && (
            <>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.05em] text-slate">
                Tampons (0 à {Math.max(0, stampsRequired - 1)})
              </p>
              <div className="mt-1.5 flex gap-2">
                <input
                  value={stampCount}
                  onChange={(e) => setStampCount(e.target.value)}
                  inputMode="numeric"
                  className="o-field !bg-white font-mono"
                />
                <button
                  type="button"
                  onClick={applyStamps}
                  disabled={pending}
                  className="shrink-0 rounded-xl bg-charcoal px-4 text-[12.5px] font-bold text-white active:scale-95 disabled:opacity-55"
                >
                  Définir
                </button>
              </div>
            </>
          )}

          {msg && <p className="mt-2 text-[12px] font-semibold text-ok">{msg}</p>}

          {/* history */}
          <p className="mt-3.5 text-[11px] font-bold uppercase tracking-[0.05em] text-slate">Activité</p>
          {history === null ? (
            <p className="mt-1 text-[12.5px] text-slate">Chargement…</p>
          ) : history.length === 0 ? (
            <p className="mt-1 text-[12.5px] text-slate">Aucune activité.</p>
          ) : (
            <ul className="mt-1 divide-y divide-hair/70">
              {history.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate text-[12.5px] text-charcoal">
                    {a.reason === "collected" ? `Récupéré · ${a.label ?? ""}` : ACTIVITY_LABEL[a.reason]}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate">{ago(a.at)}</span>
                  {a.reason !== "collected" && (
                    <span
                      className={`w-10 shrink-0 text-right text-[12px] font-bold tabular-nums ${
                        a.delta > 0 ? "text-ok" : "text-slate"
                      }`}
                    >
                      {a.delta > 0 ? "+" : ""}
                      {a.delta}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
