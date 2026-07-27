"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { QrScanner } from "@/components/QrScanner";
import { CheckIcon, QrIcon, StampIcon } from "@/components/icons";
import type { Activity, OwnerCard } from "@/lib/db";
import {
  addStampAction,
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
  The till, as a terminal — not a web form.

  Behind a counter you do one of two things: identify a customer, or validate a
  code they show you. So the screen is those two modes and nothing else.

  The KEYPAD is the resting state and the camera opens only when asked. Lighting
  the lens the moment someone opens the till drains the battery through a whole
  shift, and on the very first visit it throws a permission prompt at a cashier
  who was only trying to type a number.

  Once identified, the customer takes over the whole screen: at arm's length,
  mid-service, a small inline panel is not readable.
*/

type Customer = NonNullable<ResolveState["customer"]>;
type Mode = "client" | "code";
type Stage = "scan" | "keypad";

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
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
}

const ACT: Record<Activity["reason"], string> = {
  earn: "Achat",
  welcome: "Bienvenue",
  redeem: "Échange",
  adjust: "Correction",
  expire: "Expiration",
  collected: "Récupéré",
};

/* ── the only text entry a cashier should need ─────────────────────────── */

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

function Keypad({ onKey, decimal = false }: { onKey: (k: string) => void; decimal?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((k) =>
        k === "." && !decimal ? (
          <span key={k} />
        ) : (
          <button
            key={k}
            type="button"
            onClick={() => onKey(k)}
            className={`h-[58px] rounded-2xl text-[24px] font-bold tabular-nums transition active:scale-95 ${
              k === "⌫" ? "bg-white/[0.06] text-white/70" : "bg-white/[0.11] text-white"
            }`}
          >
            {k}
          </button>
        ),
      )}
    </div>
  );
}

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
  const [mode, setMode] = useState<Mode>("client");
  const [stage, setStage] = useState<Stage>("keypad");
  const [typed, setTyped] = useState("");
  /*
    Bumped after every successful read, to REMOUNT the scanner.

    QrScanner stops its MediaStream once it decodes something — it has to, or it
    would fire again on the same frame. But its effect only depends on `facing`,
    so nothing ever restarted it: the camera read customer #1 and then showed a
    frozen frame for the rest of the shift, with no error to explain why.
  */
  const [scanNonce, setScanNonce] = useState(0);
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
        setTyped("");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* two modes, nothing else */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.07] p-1">
        {(["client", "code"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError("");
            }}
            className={`rounded-xl py-3 text-[14px] font-bold transition ${
              mode === m ? "bg-[#6d4ae6] text-white shadow-lg" : "text-white/55"
            }`}
          >
            {m === "client" ? "Un client" : "Un code"}
          </button>
        ))}
      </div>

      {mode === "client" ? (
        <>
          {/* the camera replaces the pad rather than sitting beside it */}
          {stage === "scan" ? (
            <section>
              <div className="overflow-hidden rounded-3xl border border-white/12">
                {/* no camera on this device → drop straight back to the pad */}
                <QrScanner
                  key={scanNonce}
                  onScan={(text) => {
                    setScanNonce((n) => n + 1);
                    find(text);
                  }}
                  onUnavailable={() => setStage("keypad")}
                />
              </div>
              <p className="mt-3 text-center text-[13px] text-white/55">
                {busy ? "Recherche…" : "Pointez le QR du client"}
              </p>
              <button type="button" onClick={() => setStage("keypad")} className="a-btn a-btn--ghost mt-3">
                Fermer la caméra
              </button>
            </section>
          ) : (
            <section className="a-card p-4">
              <button
                type="button"
                onClick={() => setStage("scan")}
                className="a-btn mb-3 flex items-center justify-center gap-2"
              >
                <QrIcon className="h-5 w-5" /> Scanner le QR
              </button>

              {/* a real input, so a hardware keyboard — or a code with letters — works too */}
              <input
                name="customer"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && find(typed)}
                placeholder="Code client ou numéro"
                inputMode="text"
                className="w-full rounded-2xl bg-white/[0.06] px-4 py-4 text-center text-[26px] font-extrabold tracking-[0.06em] text-white outline-none placeholder:text-[16px] placeholder:font-semibold placeholder:tracking-normal placeholder:text-white/35"
              />
              <div className="mt-3">
                <Keypad
                  onKey={(k) =>
                    setTyped(k === "⌫" ? typed.slice(0, -1) : typed.length >= 20 ? typed : typed + k)
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => find(typed)}
                disabled={busy || !typed.trim()}
                className="a-btn mt-3"
              >
                {busy ? "· · ·" : "Chercher"}
              </button>
            </section>
          )}

          {error && (
            <p role="alert" className="rounded-2xl bg-[#ff6b6b]/12 px-4 py-3 text-[13.5px] font-semibold text-[#ff9a9a]">
              {error}
            </p>
          )}

          <Recents onPick={find} stampsEnabled={stampsEnabled} stampsRequired={stampsRequired} />
        </>
      ) : (
        <ValidateForm />
      )}

      {customer && (
        <CustomerSheet
          key={customer.ref}
          customer={customer}
          pointsPerTnd={pointsPerTnd}
          stampsEnabled={stampsEnabled}
          stampsRequired={stampsRequired}
          onClose={() => setCustomer(null)}
        />
      )}
    </div>
  );
}

/* ── the usual faces, one tap away ────────────────────────────────────── */

function Recents({
  onPick,
  stampsEnabled,
  stampsRequired,
}: {
  onPick: (ref: string) => void;
  stampsEnabled: boolean;
  stampsRequired: number;
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
    <section className="a-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-extrabold text-white">Mes clients</h2>
        <span className="text-[11.5px] text-white/45">{total}</span>
      </div>

      {!q && cards.length > 0 && (
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {cards.slice(0, 8).map((c) => (
            <button
              key={c.phone}
              type="button"
              onClick={() => onPick(c.code || c.phone)}
              className="flex shrink-0 items-center gap-2 rounded-full bg-white/[0.09] py-1.5 pl-1.5 pr-3.5 active:scale-95"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#6d4ae6] text-[12px] font-extrabold text-white">
                {(c.name ?? "?").charAt(0).toUpperCase()}
              </span>
              <span className="whitespace-nowrap text-[13px] font-bold text-white">
                {c.name ?? c.code ?? "—"}
              </span>
              <span className="whitespace-nowrap text-[11px] font-semibold text-white/45">
                {ago(c.lastAt)}
              </span>
            </button>
          ))}
        </div>
      )}

      <input
        name="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher…"
        inputMode="search"
        className="a-field mt-3 !py-3"
      />

      {q && (
        <ul className="mt-2 divide-y divide-white/10">
          {cards.length === 0 ? (
            <li className="py-5 text-center text-[13px] text-white/45">
              {busy ? "Recherche…" : "Aucune carte."}
            </li>
          ) : (
            cards.map((c) => (
              <li key={c.phone}>
                <button
                  type="button"
                  onClick={() => onPick(c.code || c.phone)}
                  className="flex w-full items-center gap-3 py-3 text-left active:opacity-70"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.1] text-[15px] font-extrabold text-white">
                    {(c.name ?? "?").charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold text-white">
                      {c.name ?? "Sans nom"}
                    </span>
                    <span className="block truncate text-[11.5px] text-white/45">
                      <span className="font-mono font-bold">{c.code ?? "—"}</span> · {ago(c.lastAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[15px] font-extrabold tabular-nums text-[#b9a3ff]">
                      {c.balance}
                    </span>
                    {stampsEnabled && (
                      <span className="block text-[10px] font-semibold text-white/45">
                        {c.stamps}/{stampsRequired}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  THE CUSTOMER — full screen, readable at arm's length                  */
/* ══════════════════════════════════════════════════════════════════════ */

function CustomerSheet({
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

  const [more, setMore] = useState(false);
  const [history, setHistory] = useState<Activity[] | null>(null);
  const [delta, setDelta] = useState("");
  const [stampSet, setStampSet] = useState(String(customer.stamps));

  const earned = Math.floor((Number(amount.replace(",", ".")) || 0) * pointsPerTnd);

  function credit() {
    // Clear BOTH first. Otherwise a refusal renders underneath the previous
    // sale's green confirmation, and the screen says yes and no at once.
    setFlash(null);
    setErr("");
    const n = Number(amount.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return setErr("Montant invalide.");
    start(async () => {
      const fd = new FormData();
      fd.set("customer", customer.ref);
      fd.set("amount", String(n));
      const res = await creditAction({}, fd);
      if (res.error) return setErr(res.error);
      if (res.ok) {
        setBalance(res.ok.balance);
        setAmount("");
        setFlash(
          `+${res.ok.earned} points` +
            (res.ok.welcome > 0 ? ` · +${res.ok.welcome} de bienvenue` : "") +
            ` · nouveau solde ${res.ok.balance} points`,
        );
      }
    });
  }

  function stamp() {
    setFlash(null);
    setErr("");
    start(async () => {
      const fd = new FormData();
      fd.set("customer", customer.ref);
      const res = await addStampAction({}, fd);
      if (res.error) return setErr(res.error);
      if (res.ok) {
        const next = res.ok.completed ? 0 : res.ok.count;
        setStamps(next);
        setStampSet(String(next));
        setFlash(
          res.ok.completed
            ? `Carte pleine 🎉 ${res.ok.label} — code ${res.ok.code}`
            : `${res.ok.count} / ${res.ok.required} tampons`,
        );
      }
    });
  }

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Le client"
      className="fixed inset-0 z-50 flex flex-col bg-[#0a0614]/97 backdrop-blur-sm"
    >
      <header className="mx-auto flex w-full max-w-[520px] items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0">
          <p className="truncate text-[24px] font-extrabold leading-tight text-white">
            {customer.name ?? "Client"}
          </p>
          {customer.enrolled ? (
            <p className="mt-0.5 font-mono text-[13px] font-bold tracking-[0.14em] text-white/55">
              {customer.code}
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] font-semibold text-[#ffd27a]">
              {/* "enrolled" means "has a card HERE" — they may well be a
                  Pointili member already, just not yours yet. */}
              Première visite ici — ses points l&apos;attendent
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/[0.1] text-[22px] leading-none text-white active:scale-95"
        >
          ×
        </button>
      </header>

      <div className="mx-auto min-h-0 w-full max-w-[520px] flex-1 overflow-y-auto px-5 pb-6">
        {/*
          A balance is context, not the job. The job is the amount below. It used
          to be a 30px number in its own tile, which read as the thing you had
          come here to do — so it is one quiet line now.
        */}
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px] font-semibold text-white/50">
          <span>
            Solde{" "}
            <b className="text-[15px] font-extrabold tabular-nums text-[#b9a3ff]">{balance}</b> points
          </span>
          {stampsEnabled && (
            <span>
              · <b className="text-[15px] font-extrabold tabular-nums text-white">{stamps}</b>/
              {stampsRequired} tampons
            </span>
          )}
        </p>

        {flash && (
          <p role="status" className="mt-3 rounded-2xl bg-[#7ff0b0]/12 px-4 py-3 text-[13.5px] font-bold text-[#7ff0b0]">
            {flash}
          </p>
        )}
        {err && (
          <p role="alert" className="mt-3 rounded-2xl bg-[#ff6b6b]/12 px-4 py-3 text-[13.5px] font-semibold text-[#ff9a9a]">
            {err}
          </p>
        )}

        {/* the amount, on a keypad — the main act */}
        <div className="mt-4">
          <input
            name="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && credit()}
            placeholder="0"
            inputMode="decimal"
            className="w-full rounded-2xl bg-white/[0.06] px-4 py-4 text-center text-[34px] font-extrabold tabular-nums text-white outline-none placeholder:text-white/25"
          />
          <p className="mt-1.5 text-center text-[12px] font-semibold text-white/45">
            {amount ? `→ ${earned} points` : `Montant en dinars · ${pointsPerTnd} pt/DT`}
          </p>
          <div className="mt-3">
            <Keypad
              decimal
              onKey={(k) => {
                if (k === "⌫") return setAmount(amount.slice(0, -1));
                if (k === "." && amount.includes(".")) return;
                if (amount.replace(".", "").length >= 7) return;
                setAmount(amount + k);
              }}
            />
          </div>
          <button type="button" onClick={credit} disabled={busy || !amount} className="a-btn mt-3 !min-h-[56px] !text-[16px]">
            {busy ? "· · ·" : "Créditer"}
          </button>
        </div>

        {stampsEnabled && (
          <button
            type="button"
            onClick={stamp}
            disabled={busy}
            className="a-btn a-btn--dark mt-2.5 flex !min-h-[52px] items-center justify-center gap-2"
          >
            <StampIcon className="h-5 w-5" /> +1 tampon
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setMore((v) => !v);
            if (history === null) start(async () => setHistory(await historyByCodeAction(customer.ref)));
          }}
          className="mt-4 w-full py-2 text-center text-[12.5px] font-bold text-white/50"
        >
          {more ? "Masquer" : "Corriger / Historique"}
        </button>

        {more && (
          <div className="border-t border-white/10 pt-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-white/45">
              Corriger les points
            </p>
            <div className="mt-2 flex gap-2">
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
                className="a-btn a-btn--dark !w-auto shrink-0 px-4 !text-[12.5px]"
              >
                Appliquer
              </button>
            </div>

            {stampsEnabled && (
              <>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.06em] text-white/45">
                  Tampons (0 à {Math.max(0, stampsRequired - 1)})
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={stampSet}
                    onChange={(e) => setStampSet(e.target.value)}
                    inputMode="numeric"
                    className="a-field font-mono"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const n = Number(stampSet);
                      if (!Number.isFinite(n) || n < 0) return;
                      start(async () => {
                        const r = await setStampsByCodeAction(customer.ref, n);
                        if (r.ok && typeof r.stamps === "number") {
                          setStamps(r.stamps);
                          setFlash(`${r.stamps} / ${stampsRequired} tampons`);
                        } else setErr(r.error ?? "Échec.");
                      });
                    }}
                    className="a-btn a-btn--dark !w-auto shrink-0 px-4 !text-[12.5px]"
                  >
                    Définir
                  </button>
                </div>
              </>
            )}

            <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.06em] text-white/45">Activité</p>
            {history === null ? (
              <p className="mt-1 text-[12.5px] text-white/45">Chargement…</p>
            ) : history.length === 0 ? (
              <p className="mt-1 text-[12.5px] text-white/45">Aucune activité.</p>
            ) : (
              <ul className="mt-1 divide-y divide-white/10">
                {history.slice(0, 8).map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate text-[12.5px] text-white/90">
                      {a.reason === "collected" ? `Récupéré · ${a.label ?? ""}` : ACT[a.reason]}
                    </span>
                    <span className="shrink-0 text-[11px] text-white/40">{ago(a.at)}</span>
                    {a.reason !== "collected" && (
                      <span
                        className={`w-10 shrink-0 text-right text-[12px] font-bold tabular-nums ${
                          a.delta > 0 ? "text-[#7ff0b0]" : "text-white/45"
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
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  VALIDATE A CODE                                                       */
/* ══════════════════════════════════════════════════════════════════════ */

const STATUS_MSG: Record<"expired" | "claimed", string> = {
  expired: "Ce code a expiré.",
  claimed: "Ce code a déjà été utilisé.",
};

export function ValidateForm() {
  const [k, setK] = useState(0);
  return <ValidateInner key={k} onReset={() => setK((n) => n + 1)} />;
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
      <h2 className="text-[15px] font-extrabold text-white">Valider un code</h2>

      {done ? (
        <>
          <div role="status" className="mt-4 rounded-2xl bg-[#7ff0b0]/12 px-4 py-6 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#7ff0b0] text-[#062b18]">
              <CheckIcon className="h-7 w-7" />
            </span>
            <p className="mt-3 text-[17px] font-extrabold text-white">{done.label}</p>
            <p className="mt-0.5 font-mono text-[13px] font-bold text-[#7ff0b0]">{done.code} · collecté</p>
          </div>
          <button type="button" onClick={onReset} className="a-btn a-btn--ghost mt-3">
            Nouveau code
          </button>
        </>
      ) : peek ? (
        <>
          <div
            className={`mt-4 rounded-2xl px-4 py-5 text-center ${
              peek.status === "valid" ? "bg-white/[0.08]" : "bg-[#ff6b6b]/12"
            }`}
          >
            <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/50">
              {peek.kind === "stamp" ? "Carte pleine" : peek.kind === "win" ? "Gain" : "Récompense"}
            </p>
            <p
              className={`mt-1.5 text-[21px] font-extrabold ${
                peek.status === "valid" ? "text-white" : "text-[#ff9a9a]"
              }`}
            >
              {peek.label}
            </p>
            <p className="mt-1 font-mono text-[13px] font-bold tracking-[0.12em] text-white/55">{peek.code}</p>
            {peek.status !== "valid" && (
              <p className="mt-2 text-[13px] font-semibold text-[#ff9a9a]">
                {STATUS_MSG[peek.status as "expired" | "claimed"]}
              </p>
            )}
          </div>
          {peek.status === "valid" ? (
            <div className="mt-3 space-y-2">
              <button type="button" onClick={collect} disabled={busy} className="a-btn !min-h-[56px] !text-[16px]">
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
        <>
          <input
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && check()}
            maxLength={6}
            autoCapitalize="characters"
            placeholder="A1B2C3"
            className="mt-4 w-full rounded-2xl bg-white/[0.06] px-4 py-4 text-center text-[30px] font-extrabold uppercase tracking-[0.18em] text-white outline-none placeholder:text-white/25"
          />
          <p className="mt-2 text-center text-[12.5px] text-white/45">
            Le code que le client montre sur son téléphone.
          </p>
          <button type="button" onClick={check} disabled={busy} className="a-btn mt-3 !min-h-[56px] !text-[16px]">
            {busy ? "· · ·" : "Vérifier"}
          </button>
        </>
      )}

      {err && (
        <p role="alert" className="mt-3 rounded-2xl bg-[#ff6b6b]/12 px-4 py-3 text-[13.5px] font-semibold text-[#ff9a9a]">
          {err}
        </p>
      )}
    </section>
  );
}
