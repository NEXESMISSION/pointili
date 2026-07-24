"use client";

import { useActionState, useState, useTransition, type ReactNode } from "react";
import { QrScanner } from "@/components/QrScanner";
import { CheckIcon, QrIcon, Sparkle, StampIcon } from "@/components/icons";
import {
  addStampAction,
  collectAction,
  creditAction,
  peekAction,
  resolveCustomerAction,
  type CollectState,
  type CreditState,
  type PeekState,
  type ResolveState,
  type StampState,
} from "./actions";

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

/* ── scan a customer's QR → credit or stamp, never touching the phone ──── */

export function ScanPanel({ stampsEnabled }: { stampsEnabled: boolean }) {
  const [scanning, setScanning] = useState(false);
  const [customer, setCustomer] = useState<NonNullable<ResolveState["customer"]> | null>(null);
  const [error, setError] = useState("");
  const [resolving, startResolve] = useTransition();

  function handleScan(text: string) {
    setScanning(false);
    setError("");
    startResolve(async () => {
      const res = await resolveCustomerAction(extractCode(text));
      if (res.error) {
        setCustomer(null);
        setError(res.error);
      } else {
        setCustomer(res.customer ?? null);
      }
    });
  }

  return (
    <section className="o-card p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-royal text-white shadow-[0_8px_18px_-8px_rgba(91,63,209,.7)]">
          <QrIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-extrabold leading-tight text-charcoal">Scanner un client</h2>
          <p className="text-[12px] text-slate">Scannez son QR pour créditer ou tamponner.</p>
        </div>
      </div>

      {scanning ? (
        <QrScanner onScan={handleScan} onClose={() => setScanning(false)} />
      ) : (
        <button
          type="button"
          onClick={() => {
            setError("");
            setScanning(true);
          }}
          className="o-btn mt-4"
        >
          Ouvrir la caméra
        </button>
      )}

      {resolving && <p className="mt-3 text-center text-[13px] font-semibold text-slate">Recherche…</p>}
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-seal-soft px-3.5 py-2.5 text-[13px] font-semibold text-seal">
          {error}
        </p>
      )}
      {customer && !resolving && <ResolvedCustomer customer={customer} stampsEnabled={stampsEnabled} />}
    </section>
  );
}

function ResolvedCustomer({
  customer,
  stampsEnabled,
}: {
  customer: NonNullable<ResolveState["customer"]>;
  stampsEnabled: boolean;
}) {
  const [credit, creditForm, crediting] = useActionState<CreditState, FormData>(creditAction, {});
  const [stamp, stampForm, stamping] = useActionState<StampState, FormData>(addStampAction, {});

  return (
    <div className="o-inset mt-4 p-4">
      <p className="text-[15px] font-extrabold text-charcoal">{customer.name ?? "Client"}</p>
      <p className="mt-0.5 text-[12.5px] font-semibold text-slate">
        {customer.balance} points{stampsEnabled ? ` · ${customer.stamps} tampons` : ""}
      </p>
      <p className="mt-0.5 font-mono text-[11px] text-slate/70">Code {customer.code}</p>

      <form action={creditForm} className="mt-3 flex gap-2">
        <input type="hidden" name="customer" value={customer.code} />
        <input name="amount" inputMode="decimal" required placeholder="Montant en dinars" className="o-field !bg-white" />
        <button type="submit" disabled={crediting} className="o-btn !w-auto shrink-0 whitespace-nowrap px-4">
          {crediting ? "· ·" : "Créditer"}
        </button>
      </form>
      {credit.ok && (
        <p role="status" className="mt-2 text-[12.5px] font-semibold text-ok">
          +{credit.ok.earned} points{credit.ok.welcome > 0 ? ` (+${credit.ok.welcome} bienvenue)` : ""} · solde {credit.ok.balance}
        </p>
      )}
      {credit.error && <p role="alert" className="mt-2 text-[12.5px] font-semibold text-seal">{credit.error}</p>}

      {stampsEnabled && (
        <>
          <form action={stampForm} className="mt-2">
            <input type="hidden" name="customer" value={customer.code} />
            <button
              type="submit"
              disabled={stamping}
              className="w-full rounded-xl border border-hair bg-white py-2.5 text-[13px] font-bold text-charcoal active:scale-[0.99] disabled:opacity-55"
            >
              {stamping ? "· ·" : "+1 tampon"}
            </button>
          </form>
          {stamp.ok && (
            <p role="status" className="mt-2 text-[12.5px] font-semibold text-ok">
              {stamp.ok.completed
                ? `Carte pleine ! ${stamp.ok.label} — code ${stamp.ok.code}`
                : `${stamp.ok.count} / ${stamp.ok.required} tampons`}
            </p>
          )}
          {stamp.error && <p role="alert" className="mt-2 text-[12.5px] font-semibold text-seal">{stamp.error}</p>}
        </>
      )}
    </div>
  );
}

/* The daily action — big, focused, thumb-friendly. */
export function CreditForm({ pointsPerTnd }: { pointsPerTnd: number }) {
  const [state, formAction, pending] = useActionState<CreditState, FormData>(creditAction, {});

  return (
    <section className="o-card p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-royal text-white shadow-[0_8px_18px_-8px_rgba(91,63,209,.7)]">
          <Sparkle className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-extrabold leading-tight text-charcoal">
            Créditer des points
          </h2>
          <p className="text-[12px] text-slate">
            {pointsPerTnd} point{pointsPerTnd > 1 ? "s" : ""} par dinar dépensé.
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-4 space-y-2.5">
        <input
          name="customer"
          type="text"
          inputMode="text"
          required
          placeholder="Numéro ou code du client"
          className="o-field"
        />
        <input
          name="amount"
          type="text"
          inputMode="decimal"
          required
          placeholder="Montant en dinars"
          className="o-field"
        />
        <button type="submit" disabled={pending} className="o-btn">
          {pending ? "· · ·" : "Créditer ✦"}
        </button>
      </form>

      {state.error && (
        <p role="alert" className="mt-3 rounded-xl bg-seal-soft px-3.5 py-2.5 text-[13px] font-semibold text-seal">
          {state.error}
        </p>
      )}

      {state.ok && (
        <div role="status" className="o-inset mt-4 px-4 py-4 text-center">
          <p className="font-display text-[42px] font-extrabold leading-none tabular-nums text-royal">
            +{state.ok.earned}
          </p>
          <p className="mt-1.5 text-[13px] font-semibold text-charcoal">
            points crédités à {state.ok.label}
          </p>
          {state.ok.welcome > 0 && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-gold-soft px-2.5 py-1 text-[11.5px] font-bold text-gold-deep">
              <Sparkle className="h-3.5 w-3.5" /> + {state.ok.welcome} de bienvenue
            </p>
          )}
          <p className="mt-2 text-[12px] font-semibold text-slate">
            Nouveau solde : <b className="tabular-nums text-charcoal">{state.ok.balance}</b> points
          </p>
        </div>
      )}
    </section>
  );
}

/* ── the manual stamp: +1 per visit, shown only when stamps are on ─────── */

export function StampForm({ required }: { required: number }) {
  const [state, formAction, pending] = useActionState<StampState, FormData>(addStampAction, {});
  return (
    <section className="o-card p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-charcoal text-white">
          <StampIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-extrabold leading-tight text-charcoal">Ajouter un tampon</h2>
          <p className="text-[12px] text-slate">Un tampon par visite — {required} pour une carte pleine.</p>
        </div>
      </div>

      <form action={formAction} className="mt-4 flex gap-2.5">
        <input name="customer" type="text" inputMode="text" required placeholder="Numéro ou code du client" className="o-field" />
        <button type="submit" disabled={pending} className="o-btn !w-auto shrink-0 whitespace-nowrap px-5">
          {pending ? "· ·" : "+1 tampon"}
        </button>
      </form>

      {state.error && (
        <p role="alert" className="mt-3 rounded-xl bg-seal-soft px-3.5 py-2.5 text-[13px] font-semibold text-seal">
          {state.error}
        </p>
      )}

      {state.ok && (
        <div role="status" className="o-inset mt-4 px-4 py-4 text-center">
          {/* the card, as dots */}
          <div className="flex flex-wrap justify-center gap-1.5">
            {Array.from({ length: state.ok.required }).map((_, i) => (
              <span
                key={i}
                className={`grid h-6 w-6 place-items-center rounded-full text-[11px] ${
                  i < (state.ok!.completed ? state.ok!.required : state.ok!.count)
                    ? "bg-royal text-white"
                    : "border border-hair bg-white text-transparent"
                }`}
              >
                ✦
              </span>
            ))}
          </div>
          {state.ok.completed ? (
            <>
              <p className="mt-3 text-[15px] font-extrabold text-royal">Carte pleine 🎉</p>
              <p className="mt-0.5 text-[12.5px] font-semibold text-charcoal">
                {state.ok.label} — code <span className="font-mono">{state.ok.code}</span>
              </p>
              <p className="mt-1 text-[11.5px] text-slate">
                Le client le retrouve sur sa carte, à collecter au comptoir.
              </p>
            </>
          ) : (
            <p className="mt-3 text-[13px] font-semibold text-charcoal">
              {state.ok.count} / {state.ok.required} tampons ·{" "}
              <span className="text-slate">{state.ok.who}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/* ── the counter code flow: look up (read-only) → collect ─────────────── */

function CodeShell({ children }: { children: ReactNode }) {
  return (
    <section className="o-card p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-charcoal text-white">
          <CheckIcon className="h-5 w-5" />
        </span>
        <h2 className="text-[17px] font-extrabold leading-tight text-charcoal">
          Valider un code
        </h2>
      </div>
      {children}
    </section>
  );
}

export function ValidateForm() {
  const [resetKey, setResetKey] = useState(0);
  return <ValidateInner key={resetKey} onReset={() => setResetKey((k) => k + 1)} />;
}

const STATUS_MSG: Record<"expired" | "claimed", string> = {
  expired: "Ce code a expiré.",
  claimed: "Ce code a déjà été utilisé.",
};

const codeField =
  "w-full rounded-xl border border-hair bg-white px-4 py-3.5 text-center text-[22px] font-bold tracking-[0.15em] text-charcoal outline-none transition-colors focus:border-royal focus:ring-2 focus:ring-royal/15 placeholder:tracking-[0.15em] placeholder:text-slate/50";
const ghostBtn =
  "w-full rounded-xl border border-hair bg-white py-3 text-[13px] font-bold text-charcoal active:scale-[0.99]";

function ValidateInner({ onReset }: { onReset: () => void }) {
  const [peekState, peekForm, peeking] = useActionState<PeekState, FormData>(peekAction, {});
  const [collectState, collectForm, collecting] = useActionState<CollectState, FormData>(collectAction, {});

  // ── collected ───────────────────────────────────────────────
  if (collectState.ok) {
    return (
      <CodeShell>
        <div role="status" className="mt-4 rounded-2xl border border-ok/30 bg-ok/10 px-4 py-4 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-ok text-white">
            <CheckIcon className="h-6 w-6" />
          </span>
          <p className="mt-2 text-[15px] font-extrabold text-charcoal">{collectState.ok.label}</p>
          <p className="mt-0.5 font-mono text-[12px] font-semibold text-ok">
            {collectState.ok.code} · collecté
          </p>
        </div>
        <button type="button" onClick={onReset} className={`${ghostBtn} mt-3`}>
          Nouveau code
        </button>
      </CodeShell>
    );
  }

  // ── looked up: show it, then collect or not ─────────────────
  const peek = peekState.peek;
  if (peek) {
    const valid = peek.status === "valid";
    return (
      <CodeShell>
        <div
          className={`mt-4 rounded-2xl px-4 py-4 text-center ${
            valid ? "o-inset" : "border border-seal/30 bg-seal-soft"
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate">
            {peek.kind === "win" ? "Gain à la roue" : peek.kind === "stamp" ? "Carte pleine" : "Récompense"}
          </p>
          <p className={`mt-1 text-[18px] font-extrabold ${valid ? "text-royal" : "text-seal"}`}>
            {peek.label}
          </p>
          <p className="mt-0.5 font-mono text-[12px] font-semibold text-slate">{peek.code}</p>
          {!valid && (
            <p className="mt-1.5 text-[12.5px] font-semibold text-seal">
              {STATUS_MSG[peek.status as "expired" | "claimed"]}
            </p>
          )}
        </div>

        {valid ? (
          <div className="mt-3 space-y-2">
            <form action={collectForm}>
              <input type="hidden" name="code" value={peek.code} />
              <button type="submit" disabled={collecting} className="o-btn">
                {collecting ? "· · ·" : "Collecter ✦"}
              </button>
            </form>
            <button type="button" onClick={onReset} className={ghostBtn}>
              Annuler
            </button>
          </div>
        ) : (
          <button type="button" onClick={onReset} className={`${ghostBtn} mt-3`}>
            Nouveau code
          </button>
        )}

        {collectState.error && (
          <p role="alert" className="mt-2 rounded-xl bg-seal-soft px-3.5 py-2.5 text-[13px] font-semibold text-seal">
            {collectState.error}
          </p>
        )}
      </CodeShell>
    );
  }

  // ── initial: enter a code and look it up ────────────────────
  return (
    <CodeShell>
      <p className="mt-1 text-[12px] text-slate">
        Le client montre son code — vérifiez-le, puis collectez-le.
      </p>
      <form action={peekForm} className="mt-3 space-y-2.5">
        <input
          name="code"
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          maxLength={6}
          required
          placeholder="A1B2C3"
          className={codeField}
        />
        <button type="submit" disabled={peeking} className={`${ghostBtn} border-royal/40 text-royal`}>
          {peeking ? "· · ·" : "Vérifier"}
        </button>
      </form>

      {peekState.error && (
        <p role="alert" className="mt-2 rounded-xl bg-seal-soft px-3.5 py-2.5 text-[13px] font-semibold text-seal">
          {peekState.error}
        </p>
      )}
    </CodeShell>
  );
}
