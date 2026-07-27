"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { QrScanner } from "@/components/QrScanner";
import { CheckIcon, GiftIcon, QrIcon, StampIcon, UsersIcon } from "@/components/icons";
import type { Activity, OwnerCard } from "@/lib/db";
import {
  adjustByCodeAction,
  collectAction,
  creditAction,
  historyByCodeAction,
  peekAction,
  resolveCustomerAction,
  searchCardsAction,
  setStampsByCodeAction,
  type ResolveState,
} from "./actions";

/*
  The till, on one screen.

  It used to be four stacked forms (scan · credit · stamp · validate) plus a
  separate "Clients" page — and every one of them asked "who is the customer?"
  again. Now there is ONE customer panel: find them (scan, type, or pick from
  the list) and every action lives in the same place. Nothing is hidden behind
  an accordion; the page is short enough not to need one.
*/

type Customer = NonNullable<ResolveState["customer"]>;

/** Accept a raw code or a URL that carries it (?c= or last path segment). */
function extractCode(text: string): string {
  const t = text.trim();
  try {
    const u = new URL(t);
    return u.searchParams.get("c") || u.pathname.split("/").filter(Boolean).pop() || t;
  } catch {
    return t;
  }
}

function ago(iso: string | null): string {
  if (!iso) return "jamais";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hier" : `il y a ${d} j`;
}

const ACT: Record<Activity["reason"], string> = {
  earn: "Achat",
  welcome: "Bienvenue",
  redeem: "Échange",
  adjust: "Correction",
  expire: "Expiration",
  collected: "Récupéré",
};

/* ══════════════════════════════════════════════════════════════════════ */
/*  1 · LE CLIENT — trouver, puis tout faire au même endroit              */
/* ══════════════════════════════════════════════════════════════════════ */

export function CaisseDesk({
  pointsPerTnd,
  stampsEnabled,
  stampsRequired,
}: {
  pointsPerTnd: number;
  stampsEnabled: boolean;
  stampsRequired: number;
}) {
  const [scanning, setScanning] = useState(false);
  const [input, setInput] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState("");
  const [busy, start] = useTransition();

  function find(raw: string) {
    const code = extractCode(raw);
    if (!code) return;
    setError("");
    start(async () => {
      const res = await resolveCustomerAction(code);
      if (res.error) {
        setCustomer(null);
        setError(res.error);
      } else {
        setCustomer(res.customer ?? null);
        setInput("");
        setScanning(false);
      }
    });
  }

  return (
    <div className="space-y-3.5">
      <section className="a-card p-5">
        <Header
          icon={<UsersIcon className="h-5 w-5" />}
          title="Le client"
          sub="Scannez son QR, ou saisissez son code / numéro."
        />

        {/* find */}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setError("");
              setScanning((s) => !s);
            }}
            className={`grid h-[46px] w-[46px] shrink-0 place-items-center rounded-xl transition active:scale-95 ${
              scanning ? "bg-charcoal text-white" : "bg-royal text-white"
            }`}
            aria-label="Scanner"
          >
            <QrIcon className="h-5 w-5" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && find(input)}
            name="customer"
            placeholder="Code / numéro"
            className="a-field"
            inputMode="text"
          />
          <button
            type="button"
            onClick={() => find(input)}
            disabled={busy || !input.trim()}
            className="shrink-0 rounded-xl bg-charcoal px-4 text-[13px] font-bold text-white active:scale-95 disabled:opacity-40"
          >
            {busy ? "· ·" : "Chercher"}
          </button>
        </div>

        {scanning && <QrScanner onScan={find} onClose={() => setScanning(false)} />}

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-[#ff6b6b]/12 px-3.5 py-2.5 text-[13px] font-semibold text-[#ff9a9a]">
            {error}
          </p>
        )}

        {customer && (
          <CustomerPanel
            key={customer.ref}
            customer={customer}
            pointsPerTnd={pointsPerTnd}
            stampsEnabled={stampsEnabled}
            stampsRequired={stampsRequired}
            onClose={() => setCustomer(null)}
          />
        )}
      </section>

      <ValidateForm />
      <CardList
        stampsEnabled={stampsEnabled}
        stampsRequired={stampsRequired}
        onPick={(code) => find(code)}
      />
    </div>
  );
}

function Header({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-royal text-white shadow-[0_8px_18px_-8px_rgba(91,63,209,.7)]">
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-[17px] font-extrabold leading-tight text-white">{title}</h2>
        {sub && <p className="text-[12px] text-white/55">{sub}</p>}
      </div>
    </div>
  );
}

/** Everything you can do to one card — credit, stamp, correct, history. */
function CustomerPanel({
  customer,
  pointsPerTnd,
  stampsEnabled,
  stampsRequired,
  onClose,
}: {
  customer: Customer;
  pointsPerTnd: number;
  stampsEnabled: boolean;
  stampsRequired: number;
  onClose: () => void;
}) {
  const [balance, setBalance] = useState(customer.balance);
  const [stamps, setStamps] = useState(customer.stamps);
  const [amount, setAmount] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();

  const [showMore, setShowMore] = useState(false);
  const [history, setHistory] = useState<Activity[] | null>(null);
  const [delta, setDelta] = useState("");

  function credit() {
    const n = Number(amount.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return setErr("Montant invalide.");
    setErr("");
    start(async () => {
      const fd = new FormData();
      fd.set("customer", customer.ref);
      fd.set("amount", String(n));
      const res = await creditAction({}, fd);
      if (res.error) return setErr(res.error);
      if (res.ok) {
        setBalance(res.ok.balance);
        setAmount("");
        // The cashier wants both: what was just added AND the new total.
        setFlash(
          `+${res.ok.earned} points` +
            (res.ok.welcome > 0 ? ` · +${res.ok.welcome} de bienvenue` : "") +
            ` · nouveau solde ${res.ok.balance} points`,
        );
      }
    });
  }

  function stamp() {
    setErr("");
    start(async () => {
      const fd = new FormData();
      fd.set("customer", customer.ref);
      const { addStampAction } = await import("./actions");
      const res = await addStampAction({}, fd);
      if (res.error) return setErr(res.error);
      if (res.ok) {
        setStamps(res.ok.completed ? 0 : res.ok.count);
        setFlash(
          res.ok.completed
            ? `Carte pleine 🎉 ${res.ok.label} — code ${res.ok.code}`
            : `${res.ok.count} / ${res.ok.required} tampons`,
        );
      }
    });
  }

  function openMore() {
    setShowMore((v) => !v);
    if (history === null) {
      start(async () => setHistory(await historyByCodeAction(customer.ref)));
    }
  }

  return (
    <div className="a-inset mt-4 p-4">
      {/* who */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[16px] font-extrabold text-white">{customer.name ?? "Client"}</p>
          {customer.enrolled ? (
            <p className="mt-0.5 font-mono text-[12px] font-bold tracking-[0.1em] text-white/55">
              {customer.code}
            </p>
          ) : (
            <p className="mt-0.5 text-[11.5px] font-semibold text-[#ffd27a]">
              Pas encore inscrit — ses points l’attendent
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg px-2 py-1 text-[18px] leading-none text-white/55"
          aria-label="Fermer"
        >
          ×
        </button>
      </div>

      {/* the two numbers that matter */}
      <div className="mt-3 flex gap-2">
        <span className="flex-1 rounded-xl bg-white/[0.1] px-3 py-2 text-center">
          <span className="block text-[20px] font-extrabold leading-none tabular-nums text-[#b9a3ff]">
            {balance}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-white/55">points</span>
        </span>
        {stampsEnabled && (
          <span className="flex-1 rounded-xl bg-white/[0.1] px-3 py-2 text-center">
            <span className="block text-[20px] font-extrabold leading-none tabular-nums text-white">
              {stamps}/{stampsRequired}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-white/55">tampons</span>
          </span>
        )}
      </div>

      {/* credit */}
      <div className="mt-3 flex gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && credit()}
          name="amount"
          inputMode="decimal"
          placeholder={`Montant · ${pointsPerTnd} pt/DT`}
          className="a-field"
        />
        <button
          type="button"
          onClick={credit}
          disabled={busy}
          className="shrink-0 rounded-xl bg-royal px-5 text-[13px] font-bold text-white active:scale-95 disabled:opacity-55"
        >
          Créditer
        </button>
      </div>

      {stampsEnabled && (
        <button
          type="button"
          onClick={stamp}
          disabled={busy}
          className="a-btn a-btn--dark mt-2 flex items-center justify-center gap-2 disabled:opacity-45"
        >
          <StampIcon className="h-4 w-4" /> +1 tampon
        </button>
      )}

      {flash && (
        <p role="status" className="mt-2.5 rounded-xl bg-ok/10 px-3.5 py-2.5 text-[13px] font-bold text-[#7ff0b0]">
          {flash}
        </p>
      )}
      {err && (
        <p role="alert" className="mt-2.5 rounded-xl bg-[#ff6b6b]/12 px-3.5 py-2.5 text-[13px] font-semibold text-[#ff9a9a]">
          {err}
        </p>
      )}

      {/* corrections + history, one tap away — not a separate page */}
      <button
        type="button"
        onClick={openMore}
        className="mt-3 flex w-full items-center justify-center gap-1.5 text-[12px] font-bold text-white/55"
      >
        {showMore ? "Masquer" : "Corriger / Historique"}
        <span className={`text-[13px] transition-transform ${showMore ? "rotate-180" : ""}`}>⌄</span>
      </button>

      {showMore && (
        <div className="mt-3 border-t border-white/12 pt-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-white/55">Corriger les points</p>
          <div className="mt-1.5 flex gap-2">
            <input
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              inputMode="numeric"
              placeholder="+10 ou -5"
              className="a-field font-mono"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const n = Number(delta.replace(",", "."));
                if (!Number.isFinite(n) || n === 0) return;
                start(async () => {
                  const r = await adjustByCodeAction(customer.ref, n);
                  if (r.ok && typeof r.balance === "number") {
                    setBalance(r.balance);
                    setDelta("");
                    setFlash(`Solde corrigé : ${r.balance}`);
                  } else setErr(r.error ?? "Échec.");
                });
              }}
              className="shrink-0 rounded-xl bg-charcoal px-4 text-[12.5px] font-bold text-white active:scale-95 disabled:opacity-55"
            >
              Appliquer
            </button>
          </div>

          {stampsEnabled && (
            <>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.05em] text-white/55">
                Tampons (0 à {Math.max(0, stampsRequired - 1)})
              </p>
              <div className="mt-1.5 flex gap-2">
                <input
                  defaultValue={String(stamps)}
                  inputMode="numeric"
                  className="a-field font-mono"
                  id={`st-${customer.ref}`}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const el = document.getElementById(`st-${customer.ref}`) as HTMLInputElement | null;
                    const n = Number(el?.value ?? "");
                    if (!Number.isFinite(n) || n < 0) return;
                    start(async () => {
                      const r = await setStampsByCodeAction(customer.ref, n);
                      if (r.ok && typeof r.stamps === "number") {
                        setStamps(r.stamps);
                        setFlash(`${r.stamps} / ${stampsRequired} tampons`);
                      } else setErr(r.error ?? "Échec.");
                    });
                  }}
                  className="shrink-0 rounded-xl bg-charcoal px-4 text-[12.5px] font-bold text-white active:scale-95 disabled:opacity-55"
                >
                  Définir
                </button>
              </div>
            </>
          )}

          <p className="mt-3.5 text-[11px] font-bold uppercase tracking-[0.05em] text-white/55">Activité</p>
          {history === null ? (
            <p className="mt-1 text-[12.5px] text-white/55">Chargement…</p>
          ) : history.length === 0 ? (
            <p className="mt-1 text-[12.5px] text-white/55">Aucune activité.</p>
          ) : (
            <ul className="mt-1 divide-y divide-white/10">
              {history.slice(0, 8).map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate text-[12.5px] text-white">
                    {a.reason === "collected" ? `Récupéré · ${a.label ?? ""}` : ACT[a.reason]}
                  </span>
                  <span className="shrink-0 text-[11px] text-white/55">{ago(a.at)}</span>
                  {a.reason !== "collected" && (
                    <span
                      className={`w-10 shrink-0 text-right text-[12px] font-bold tabular-nums ${
                        a.delta > 0 ? "text-[#7ff0b0]" : "text-white/55"
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
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  2 · VALIDER UN CODE                                                   */
/* ══════════════════════════════════════════════════════════════════════ */

const STATUS_MSG: Record<"expired" | "claimed", string> = {
  expired: "Ce code a expiré.",
  claimed: "Ce code a déjà été utilisé.",
};

export function ValidateForm() {
  const [key, setKey] = useState(0);
  return <ValidateInner key={key} onReset={() => setKey((k) => k + 1)} />;
}

function ValidateInner({ onReset }: { onReset: () => void }) {
  const [code, setCode] = useState("");
  const [peek, setPeek] = useState<NonNullable<Awaited<ReturnType<typeof peekAction>>>["peek"] | null>(null);
  const [done, setDone] = useState<{ label: string; code: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();

  function check() {
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(c)) return setErr("Code à 6 caractères.");
    setErr("");
    start(async () => {
      const fd = new FormData();
      fd.set("code", c);
      const res = await peekAction({}, fd);
      if (res.error) return setErr(res.error);
      setPeek(res.peek ?? null);
    });
  }

  function collect() {
    if (!peek) return;
    start(async () => {
      const fd = new FormData();
      fd.set("code", peek.code);
      const res = await collectAction({}, fd);
      if (res.error) return setErr(res.error);
      if (res.ok) setDone(res.ok);
    });
  }

  return (
    <section className="a-card p-5">
      <Header
        icon={<CheckIcon className="h-5 w-5" />}
        title="Valider un code"
        sub="Le client montre son code — vérifiez, puis collectez."
      />

      {done ? (
        <>
          <div role="status" className="mt-4 rounded-2xl border border-[#7ff0b0]/30 bg-ok/10 px-4 py-4 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-ok text-white">
              <CheckIcon className="h-6 w-6" />
            </span>
            <p className="mt-2 text-[15px] font-extrabold text-white">{done.label}</p>
            <p className="mt-0.5 font-mono text-[12px] font-semibold text-[#7ff0b0]">{done.code} · collecté</p>
          </div>
          <button type="button" onClick={onReset} className="a-btn a-btn--ghost mt-3">
            Nouveau code
          </button>
        </>
      ) : peek ? (
        <>
          <div
            className={`mt-4 rounded-2xl px-4 py-4 text-center ${
              peek.status === "valid" ? "a-inset" : "border border-[#ff6b6b]/30 bg-[#ff6b6b]/12"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/55">
              {peek.kind === "stamp" ? "Carte pleine" : peek.kind === "win" ? "Gain" : "Récompense"}
            </p>
            <p className={`mt-1 text-[18px] font-extrabold ${peek.status === "valid" ? "text-[#b9a3ff]" : "text-[#ff9a9a]"}`}>
              {peek.label}
            </p>
            <p className="mt-0.5 font-mono text-[12px] font-semibold text-white/55">{peek.code}</p>
            {peek.status !== "valid" && (
              <p className="mt-1.5 text-[12.5px] font-semibold text-[#ff9a9a]">
                {STATUS_MSG[peek.status as "expired" | "claimed"]}
              </p>
            )}
          </div>
          {peek.status === "valid" ? (
            <div className="mt-3 space-y-2">
              <button type="button" onClick={collect} disabled={busy} className="a-btn">
                {busy ? "· · ·" : "Collecter ✦"}
              </button>
              <button type="button" onClick={onReset} className="a-btn a-btn--ghost">
                Annuler
              </button>
            </div>
          ) : (
            <button type="button" onClick={onReset} className="a-btn a-btn--ghost mt-3">
              Nouveau code
            </button>
          )}
        </>
      ) : (
        <div className="mt-4 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && check()}
            name="code"
            maxLength={6}
            autoCapitalize="characters"
            placeholder="A1B2C3"
            className="a-field text-center !text-[20px] font-bold tracking-[0.14em]"
          />
          <button
            type="button"
            onClick={check}
            disabled={busy}
            className="shrink-0 rounded-xl bg-charcoal px-5 text-[13px] font-bold text-white active:scale-95 disabled:opacity-55"
          >
            {busy ? "· ·" : "Vérifier"}
          </button>
        </div>
      )}

      {err && (
        <p role="alert" className="mt-2.5 rounded-xl bg-[#ff6b6b]/12 px-3.5 py-2.5 text-[13px] font-semibold text-[#ff9a9a]">
          {err}
        </p>
      )}
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  3 · LES CARTES — la page "Clients" repliée sous la caisse             */
/* ══════════════════════════════════════════════════════════════════════ */

function CardList({
  stampsEnabled,
  stampsRequired,
  onPick,
}: {
  stampsEnabled: boolean;
  stampsRequired: number;
  onPick: (code: string) => void;
}) {
  const [q, setQ] = useState("");
  const [cards, setCards] = useState<OwnerCard[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, start] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    const t = setTimeout(
      () =>
        start(async () => {
          const res = await searchCardsAction(q, 0);
          setCards(res.cards);
          setTotal(res.total);
        }),
      first.current ? 0 : 250,
    );
    first.current = false;
    return () => clearTimeout(t);
  }, [q]);

  return (
    <section className="a-card p-5">
      <Header
        icon={<GiftIcon className="h-5 w-5" />}
        title="Mes clients"
        sub={`${total} carte${total === 1 ? "" : "s"} · touchez pour ouvrir`}
      />

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher un nom, un code…"
        name="search"
        inputMode="search"
        className="a-field mt-4"
      />

      {cards.length === 0 ? (
        <p className="mt-3 py-6 text-center text-[13px] text-white/55">
          {busy ? "Recherche…" : q ? "Aucune carte." : "Aucun client pour l'instant."}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-white/10">
          {cards.map((c) => (
            <li key={c.phone}>
              <button
                type="button"
                onClick={() => onPick(c.code || c.phone)}
                className="flex w-full items-center gap-3 py-2.5 text-left active:opacity-70"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.08] text-[14px] font-extrabold text-[#b9a3ff]">
                  {(c.name ?? "?").charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-white">
                    {c.name ?? "Sans nom"}
                  </span>
                  <span className="block truncate text-[11px] text-white/55">
                    <span className="font-mono font-bold">{c.code ?? "—"}</span> · {ago(c.lastAt)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[14px] font-extrabold tabular-nums text-[#b9a3ff]">{c.balance}</span>
                  {stampsEnabled && (
                    <span className="block text-[10px] font-semibold text-white/55">
                      {c.stamps}/{stampsRequired}
                    </span>
                  )}
                </span>
                {c.pending > 0 && (
                  <span className="shrink-0 rounded-full bg-[#ffd27a]/12 px-2 py-0.5 text-[10px] font-bold text-[#ffd27a]">
                    {c.pending}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {cards.length > 0 && cards.length < total && (
        <p className="mt-3 text-center text-[11.5px] text-white/55">
          {cards.length} sur {total} — affinez la recherche
        </p>
      )}
    </section>
  );
}
