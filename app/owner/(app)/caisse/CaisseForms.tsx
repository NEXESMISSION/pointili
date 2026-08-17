"use client";

import { useState, useTransition } from "react";
import { QrScanner } from "@/components/QrScanner";
import { CheckIcon, QrIcon, StampIcon } from "@/components/icons";
import { DoneSheet, type Done } from "./DoneSheet";
import type { Activity } from "@/lib/db";
import { fmtPoints } from "@/lib/points";
import {
  addStampAction,
  adjustByCodeAction,
  resetPinAction,
  collectAction,
  creditAction,
  historyByCodeAction,
  peekAction,
  resolveCustomerAction,
  setStampsByCodeAction,
  type PeekState,
  type ResolveState,
} from "./actions";

/*
  The till, on one screen.

  Behind a counter you do one of two things: identify a customer, or validate a
  code they show you. Both are PRESENT at once now — a scanner button, the
  client field, and the voucher field, with nothing to scroll and no tab to
  guess. (They used to be two tabbed modes with a drawn keypad; the keypad is
  gone because the phone's own keyboard is better and its height is exactly
  what forced the scroll.)

  The camera still opens only when asked. Lighting the lens the moment someone
  opens the till drains the battery through a whole shift, and on the very
  first visit it throws a permission prompt at a cashier who was only trying
  to type a number.

  Once identified, the customer takes over the whole screen: at arm's length,
  mid-service, a small inline panel is not readable.
*/

type Customer = NonNullable<ResolveState["customer"]>;
type Stage = "scan" | "keypad";

/**
 * A voucher that arrived already read — from the camera, or from the client
 * field somebody typed it into — together with the lookup the till did for it.
 *
 * The LOOKUP TRAVELS WITH THE CODE on purpose. The alternative was handing the
 * validate panel a bare code and letting it peek itself on mount, which is the
 * same request one render later and puts a setState in an effect for no gain.
 * Scanning is what triggers the lookup, so the lookup belongs at the scan.
 */
type Scanned = { code: string; n: number; peek: PeekState["peek"] | null; error: string };

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

/**
 * Is this a REWARD VOUCHER rather than a customer?
 *
 * Length is the whole distinction and it is not a guess: account codes are 4
 * characters (0019_resolve_by_account_code.sql) and vouchers are 6
 * (pointili_gen_code, 0003_rpcs.sql), drawn from the same alphabet. A phone
 * number is 8 digits here and never reaches this shape.
 *
 * The server says the same thing from the other side — resolveCustomer answers
 * a 6-character lookup with "c'est un code de récompense" — which is exactly
 * the sentence this replaces. Naming the mistake was the best a text field
 * could do; a scanner can simply DO THE RIGHT THING instead, and now does,
 * whether the code arrived through the lens or through the wrong field.
 */
function isVoucher(code: string): boolean {
  const c = code.toUpperCase().trim();
  /*
    EIGHT DIGITS IS A PHONE NUMBER. It is the walk-in path — the cashier types
    the number of somebody who has not signed up yet — and it is the one input
    this test must never claim.

    The range above says 6 TO 8 because peekAction accepts that much, and a
    local number is exactly 8 characters drawn from the same [A-Z0-9] class. So
    every walk-in lookup was answered with "Code introuvable.", from the
    voucher panel, about a code the cashier never typed.
  */
  if (/^\d{8}$/.test(c)) return false;
  return /^[A-Z0-9]{6,8}$/.test(c);
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
  spin: "Roue",
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
              k === "⌫" ? "bg-[var(--o-inset)] text-slate" : "bg-[var(--o-inset)] text-charcoal"
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
  today,
}: {
  pointsPerTnd: number;
  stampsEnabled: boolean;
  stampsRequired: number;
  /*
    THE SHIFT, RENDERED BY THE PAGE AND HANDED IN.

    This is a Client Component and the day's figures come from a server read
    (lib/db ownerToday), so the page renders <Today> and passes the finished
    element down. The alternative — fetching it from here — would put a
    loading state and an effect on the one screen that must be instant.

    It replaces the QR card that used to sit in this column. The QR has its own
    tab now, which is where a thing that creates every card in the shop
    belongs; leaving a copy here would have been the third place it appears.
  */
  today: React.ReactNode;
}) {
  /* No `mode` any more — see the note where the tabs used to be. */
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
  /*
    A voucher handed to the validate panel, with its own nonce.

    The nonce REMOUNTS that panel. Without it, scanning a second voucher while
    the first one's result is still on screen would change a prop the panel had
    already consumed, and the cashier would be looking at the previous
    customer's reward with a live Collecter button under it.
  */
  const [voucher, setVoucher] = useState<Scanned | null>(null);

  function find(raw: string) {
    const code = extractCode(raw);
    if (!code) return;
    setError("");

    /*
      A REWARD CODE GOES TO THE REWARD PANEL. It does not matter which door it
      came through — the camera, or the client field somebody typed it into by
      mistake. Six characters is a voucher, and the only thing anyone ever
      wants to do with a voucher is collect it.
    */
    if (isVoucher(code)) {
      const c = code.toUpperCase();
      setTyped("");
      setStage("keypad"); // the panel lives on the till screen, not the viewfinder
      start(async () => {
        // Read-only: peek says WHAT the code is. Nothing is claimed until the
        // cashier presses Collecter, exactly as when they type it by hand.
        const fd = new FormData();
        fd.set("code", c);
        const res = await peekAction({}, fd);
        setVoucher((v) => ({
          code: c,
          n: (v?.n ?? 0) + 1,
          peek: res.peek ?? null,
          error: res.error ?? "",
        }));
      });
      return;
    }

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
    /*
      data-owner-wide (globals.css) — but ONLY the cap moves.

      The till is a one-handed terminal and every phone pixel of it stays where
      it is. What changed is the laptop on the back counter: a 680px ribbon of
      small cards with seven hundred pixels of empty screen beside it. At lg the
      till keeps the left seven columns and the shop's own day takes the five it
      never wanted — so the width finally carries something, and the thing it
      carries is the one thing a terminal cannot tell you.
    */
    <div data-owner-wide className="space-y-4">
      {/*
        NO TABS AND NO KEYPAD — the whole till on one screen.

        The tabs made the cashier CHOOSE before they could act: "Ajouter des
        points" or "Valider une récompense", two names for screens that each
        held one field. Guess wrong and the error blamed the customer, in front
        of a queue. With both fields simply present, there is nothing to guess
        — the 4-character code goes in the top one, the 6-character voucher in
        the bottom one, and each says which it is.

        The drawn keypad went with them. It existed to LOOK like a till, but
        the phone already has a keyboard — a better one, with letters for the
        codes that contain letters — and the fake pad cost the exact screen
        height that forced this page to scroll. The field alone brings the
        phone's own keyboard up, which is the tool the cashier already knows.
      */}
      {stage === "scan" ? (
        <section>
          <div className="overflow-hidden rounded-3xl border border-[var(--o-edge)]">
            {/* no camera on this device → drop straight back to the field */}
            <QrScanner
              key={scanNonce}
              onScan={(text) => {
                setScanNonce((n) => n + 1);
                find(text);
              }}
              onUnavailable={() => setStage("keypad")}
            />
          </div>
          {/* ONE lens, TWO jobs — say so, or half the shop never points it at a
              reward and keeps typing six characters by hand. */}
          <p className="mt-3 text-center text-[13px] text-slate">
            {busy ? "Recherche…" : "Pointez le QR — carte client ou récompense"}
          </p>
          <button type="button" onClick={() => setStage("keypad")} className="a-btn a-btn--ghost mt-3">
            Fermer la caméra
          </button>
        </section>
      ) : (
        /*
          SEVEN AND FIVE, NOT SIX AND SIX.

          The two halves of this screen are not equals. The left is the till —
          what a cashier touches — and the right is the day, which is read.
          Splitting them evenly made the working half narrower than it needed to
          be while the reading half had more room than it could use.
        */
        <div className="space-y-4 lg:grid lg:grid-cols-12 lg:items-start lg:gap-5 lg:space-y-0">
          <div className="space-y-4 lg:col-span-7">
            {/*
              THE SCANNER SITS ABOVE BOTH JOBS, because it now does both.

              It used to live inside the "Ajouter des points" card, which was
              true when the only scannable thing was a customer's card. A reward
              code is scannable too — so a button buried under that heading was
              a button the cashier collecting a reward had no reason to read,
              and they went on typing six characters while the queue waited.

              ── AND IT IS NOT THE LOUDEST THING ON A LAPTOP ─────────────────

              On a phone at the counter the camera IS the tool: full width,
              filled, first. On the laptop in the back office there is usually
              no usable camera at all, and this was a 56px violet slab spanning
              seven columns above a search field rendered in pale lilac — the
              screen shouted the one control that would not work and whispered
              the one that would.

              Filled and full-height below md; outlined and compact from md up,
              where the field beneath it is what actually gets used. The switch
              is `.a-scan` in globals.css — a Tailwind breakpoint variant cannot
              apply a plain class, which is worth knowing before trying.
            */}
            <button
              type="button"
              onClick={() => setStage("scan")}
              className="a-btn a-scan flex items-center justify-center gap-2"
            >
              <QrIcon className="h-5 w-5" /> Scanner le QR
            </button>

            {/* ── this person is paying ─────────────────────────────── */}
            <section className="a-card p-4">
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate">
                Ajouter des points
              </p>
              {/* field + button on ONE row — the height the keypad used to eat
                  is what lets both jobs fit one screen */}
              <div className="flex gap-2">
                <input
                  name="customer"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && find(typed)}
                  placeholder="Code client ou numéro"
                  inputMode="text"
                  autoCapitalize="characters"
                  className="min-w-0 flex-1 rounded-2xl bg-[var(--o-inset)] px-4 py-3.5 text-[18px] font-extrabold tracking-[0.05em] text-charcoal outline-none placeholder:text-[14px] placeholder:font-semibold placeholder:tracking-normal placeholder:text-slate"
                />
                <button
                  type="button"
                  onClick={() => find(typed)}
                  disabled={busy || !typed.trim()}
                  className="a-btn !w-auto shrink-0 px-5"
                >
                  {busy ? "· · ·" : "Chercher"}
                </button>
              </div>
            </section>

            {error && (
              <p role="alert" className="rounded-2xl bg-[#e5484d]/12 px-4 py-3 text-[13px] font-semibold text-[#e5484d]">
                {error}
              </p>
            )}
            {/* ── this person is collecting ───────────────────────
                BOTH JOBS IN ONE COLUMN, because both are the till.

                Paying and collecting used to be left and right, which read as
                two equal halves of the screen and left the actual second half —
                how the day is going — with nowhere to be. They are the same job
                done by the same hands, one after the other; the day is the
                other thing in the room. */}
            <ValidateForm scanned={voucher} />
          </div>

          {/* ── and how the shift is going ────────────────────────── */}
          <div className="lg:col-span-5">{today}</div>
        </div>
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
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();

  /* The stamp button asks before it writes — see where it is rendered. */
  const [confirmStamp, setConfirmStamp] = useState(false);
  const [more, setMore] = useState(false);
  const [history, setHistory] = useState<Activity[] | null>(null);
  const [delta, setDelta] = useState("");
  /*
    THE MESSAGE OWNS ITS OWN UNDO.

    This was two states — a `flash` string and a separate `lastCredit` number —
    and nothing but a credit or a reversal ever touched the second one. So the
    button was gated on "a credit happened at some point", not on "the line
    above me is that credit". Stamp a card, correct a balance, set stamps, reset
    a PIN: each wrote a new flash and left the old undo sitting under it.

    The worst shape: a cashier stamps the wrong customer, reads "Carte pleine 🎉
    — code XJFP6Y", and the only button beneath it says Annuler. Pressing it
    cancels nothing about the card — it silently reverses the PREVIOUS
    customer's points, then reports "Annulé : −30 points", which reads as
    success. Balances drift down and nobody investigates.

    One object. The undo can only render on the line that earned it, and every
    other setFlash is structurally incapable of carrying one.
  */
  type Flash = {
    text: string;
    /** Points to hand back — presence of this is what renders Annuler. */
    undo?: number;
    /** The dinars of the sale being reversed, so Analyses nets it out (0025). */
    amount?: number;
  };
  const [flashState, setFlashState] = useState<Flash | null>(null);
  const setFlash = (f: Flash | string | null) =>
    setFlashState(f === null ? null : typeof f === "string" ? { text: f } : f);
  const flash = flashState;

  const [done, setDone] = useState<Done | null>(null);
  const [newPin, setNewPin] = useState("");
  const [stampSet, setStampSet] = useState(String(customer.stamps));

  /*
    The same arithmetic the server does, not an approximation of it.

    This used to be floor(montant × taux) — it ignored an active "points
    doublés" event, so the screen promised 174 and the receipt paid 348, and it
    ignored the fraction of a point the customer was already owed (0026), so it
    could also be a point short. A cashier reads this number out loud before
    pressing Créditer; it has to be the number that lands.
  */
  const earned =
    Math.round((Number(amount.replace(",", ".")) || 0) * pointsPerTnd * customer.multiplier * 100) / 100;

  function credit() {
    /*
      Guard the FUNCTION, not the button.

      `disabled={busy}` on Créditer stops a second tap, but the amount field
      calls credit() straight from onKeyDown — so a cashier who hits Enter twice,
      or whose phone repeats the key, posts the sale twice. Both requests are
      valid, so the customer is credited twice and the shop's takings gain a sale
      that never happened. The button was never the only way in.
    */
    if (busy) return;
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
        // only the earned points are reversible here — a one-time welcome bonus
        // is not part of the mistake and taking it back would be a second one
        setDone({
          kind: "credit",
          who: res.ok.label,
          earned: res.ok.earned,
          welcome: res.ok.welcome,
          balance: res.ok.balance,
          amount: res.ok.amount,
          unlocked: res.ok.unlocked,
          next: res.ok.next,
          onUndo: res.ok.earned > 0 ? () => undoCredit(res.ok!.earned, res.ok!.amount) : undefined,
        });
        setFlash({
          undo: res.ok.earned > 0 ? res.ok.earned : undefined,
          amount: res.ok.amount,
          text:
            `+${fmtPoints(res.ok.earned)} points` +
            (res.ok.welcome > 0 ? ` · +${res.ok.welcome} de bienvenue` : "") +
            ` · nouveau solde ${fmtPoints(res.ok.balance)} points`,
        });
      }
    });
  }

  /*
    One undo, two places to press it: the receipt sheet while it is up, and the
    flash line after it closes. Extracted rather than duplicated — a reversal
    that behaves differently depending on which button you found would be worse
    than having only one button.
  */
  function undoCredit(back: number, dinars?: number) {
    // drop the offer immediately — a double tap must not reverse twice
    setFlash({ text: `Annulation de ${fmtPoints(back)} points…` });
    start(async () => {
      // negative, so Analyses subtracts the sale instead of only the points
      const r = await adjustByCodeAction(customer.ref, -back, dinars === undefined ? undefined : -dinars);
      if (r.ok && typeof r.balance === "number") {
        setBalance(r.balance);
        setFlash(`Annulé : −${fmtPoints(back)} points · solde ${fmtPoints(r.balance)} points`);
      } else {
        // put the offer back: the reversal did not happen
        setFlash({ text: `+${fmtPoints(back)} points`, undo: back, amount: dinars });
        setErr(r.error ?? "Échec.");
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
        setDone({
          kind: "stamp",
          who: customer.name ?? customer.code ?? "Client",
          // the RPC resets the card to 0 on completion, so show it FULL here —
          // "0/10" as the confirmation of filling it reads as a failure
          count: res.ok.completed ? res.ok.required : res.ok.count,
          required: res.ok.required,
          completed: res.ok.completed,
          code: res.ok.code,
          label: res.ok.label,
        });
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
      className="sheet-in fixed inset-0 z-50 flex flex-col bg-[#ffffff]/97 backdrop-blur-sm"
    >
      {/* The receipt, over the top of everything, closing itself after 4s. */}
      {/*
        onNext is NOT onClose. The sheet's primary button says "Client suivant"
        and used to call the dismiss handler, which only hid the receipt — the
        till stayed bound to the same person, showing an empty amount box and a
        live Créditer. The cashier types the next customer's total and credits
        the previous one, which is the exact failure the receipt exists to
        prevent, reintroduced by its own label. Tapping the veil still just
        dismisses.
      */}
      {done && (
        <DoneSheet
          done={done}
          onClose={() => setDone(null)}
          onNext={() => {
            setDone(null);
            onClose();
          }}
        />
      )}
      <header className="mx-auto flex w-full max-w-[520px] items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0">
          <p className="truncate text-[24px] font-extrabold leading-tight text-charcoal">
            {customer.name ?? "Client"}
          </p>
          {customer.enrolled ? (
            <p className="mt-0.5 font-mono text-[13px] font-bold tracking-[0.14em] text-slate">
              {customer.code}
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] font-semibold text-[#a06e00]">
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
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--o-inset)] text-[20px] leading-none text-charcoal active:scale-95"
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
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px] font-semibold text-slate">
          <span>
            Solde{" "}
            <b className="text-[15px] font-extrabold tabular-nums text-[#5b3fd1]">{fmtPoints(balance)}</b> points
          </span>
          {stampsEnabled && (
            <span>
              · <b className="text-[15px] font-extrabold tabular-nums text-charcoal">{stamps}</b>/
              {stampsRequired} tampons
            </span>
          )}
        </p>

        {flash && (
          <div
            role="status"
            className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-[#2f9e6e]/12 px-4 py-3"
          >
            <p className="min-w-0 text-[13px] font-bold text-[#2f9e6e]">{flash.text}</p>
            {flash.undo !== undefined && (
              <button
                type="button"
                disabled={busy}
                onClick={() => undoCredit(flash.undo!, flash.amount)}
                className="shrink-0 rounded-full bg-[var(--o-inset)] px-3.5 py-1.5 text-[12px] font-bold text-charcoal active:scale-95"
              >
                Annuler
              </button>
            )}
          </div>
        )}
        {err && (
          <p role="alert" className="mt-3 rounded-2xl bg-[#e5484d]/12 px-4 py-3 text-[13px] font-semibold text-[#e5484d]">
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
            className="w-full rounded-2xl bg-[var(--o-inset)] px-4 py-4 text-center text-[30px] font-extrabold tabular-nums text-charcoal outline-none placeholder:text-slate"
          />
          <p className="mt-1.5 text-center text-[12px] font-semibold text-slate">
            {/*
              THE UNIT NEVER LEAVES THE SCREEN.

              This used to swap: "Montant en dinars · 3 pt/DT" while the field was
              empty, then "+174 points" the moment anything was typed. So the one
              line telling a cashier they are entering DINARS vanished at exactly
              the keystroke where it matters, leaving a big "58" above a bigger
              "+174 points" and nothing at all saying which was which.

              At any rate above 1 pt/DT the preview is LARGER than the amount,
              which quietly suggests the typed figure is not the points — true,
              but only to someone who stops to reason about it. Nobody reasons at
              a counter with a queue.

              So the amount is echoed with its unit and the preview follows it:
              «58 dinars · +174 points». Two facts, in the order they happen.

              "+N points", not "→ N": beside "Solde 25 points" one line above, an
              arrow read as the NEW BALANCE rather than what this sale earns.
            */}
            {amount
              ? `${amount} dinars · +${fmtPoints(earned)} points` +
                (customer.multiplier > 1 ? ` · ×${customer.multiplier} en cours` : "")
              : `Montant en dinars · ${pointsPerTnd} pt/DT`}
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
          <button type="button" onClick={credit} disabled={busy || !amount} className="a-btn mt-3 !min-h-[56px] !text-[17px]">
            {busy ? "· · ·" : "Créditer"}
          </button>
        </div>

        {/*
          A STAMP ASKS FIRST.

          Crediting points is typed — an amount, then Créditer — so a slip is
          visible before it lands. A stamp is one tap that writes straight to a
          card, and a card is closer to its reward than points ever are: at 9/10
          an accidental tap hands out the free coffee. There is no undo for it
          either (the ledger has a reversal; a stamp does not).

          So the tap asks. Not a browser confirm() — that is a system dialog a
          cashier will learn to dismiss without reading — but the same two
          buttons in the app's own voice, naming what is about to happen and
          where the card stands.
        */}
        {stampsEnabled && (
          confirmStamp ? (
            <div className="mt-2.5 rounded-2xl border border-[#a06e00]/30 bg-[#a06e00]/10 p-3.5">
              <p className="text-[14px] font-bold leading-snug text-charcoal">
                Ajouter un tampon ?
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-slate">
                {customer.name ?? customer.code ?? "Ce client"} passera à{" "}
                <b className="font-extrabold text-charcoal">
                  {Math.min(stamps + 1, stampsRequired)} / {stampsRequired}
                </b>
                {stamps + 1 >= stampsRequired && " — la carte sera pleine"}.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmStamp(false)}
                  className="a-btn a-btn--ghost !min-h-[46px]"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setConfirmStamp(false);
                    stamp();
                  }}
                  className="a-btn !min-h-[46px]"
                >
                  {busy ? "· · ·" : "Oui, ajouter"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmStamp(true)}
              disabled={busy}
              className="a-btn a-btn--dark mt-2.5 flex !min-h-[52px] items-center justify-center gap-2"
            >
              <StampIcon className="h-5 w-5" /> +1 tampon
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => {
            setMore((v) => !v);
            if (history === null) start(async () => setHistory(await historyByCodeAction(customer.ref)));
          }}
          className="mt-4 w-full py-2 text-center text-[12px] font-bold text-slate"
        >
          {more ? "Masquer" : "Corriger / Historique"}
        </button>

        {more && (
          <div className="border-t border-[var(--o-edge)] pt-3">
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-slate">
              Corriger les points
            </p>
            <div className="mt-2 flex gap-2">
              <input
                /* named, so the suites stop hanging off placeholder copy —
                   renaming "+10 ou -5" to "+10 ou -2,5" broke test-owner */
                name="adjust"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                /* decimal, not numeric: the numeric keypad has no "," key, and
                   points have had fractions since 0027 */
                inputMode="decimal"
                placeholder="+10 ou -2,5"
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
                      setFlash(`Solde corrigé : ${fmtPoints(r.balance)}`);
                    } else setErr(r.error ?? "Échec.");
                  });
                }}
                className="a-btn a-btn--dark !w-auto shrink-0 px-4 !text-[12px]"
              >
                Appliquer
              </button>
            </div>

            {stampsEnabled && (
              <>
                <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.06em] text-slate">
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
                    className="a-btn a-btn--dark !w-auto shrink-0 px-4 !text-[12px]"
                  >
                    Définir
                  </button>
                </div>
              </>
            )}

            {/*
              The ONLY way a customer can recover a forgotten code.

              pin_hash is written in exactly one other place — account creation —
              so before this, forgetting the code meant losing every card at
              every shop, permanently, with nobody able to help. It belongs at
              the counter because the hard part of a reset is proving who you
              are, and that is already solved by standing in front of someone.
            */}
            {customer.enrolled && (
              <>
                <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.06em] text-slate">
                  Code secret oublié
                </p>
                <p className="mt-1 text-[12px] leading-snug text-slate">
                  Le client choisit un nouveau code à 4 chiffres et vous le tapez ici.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    name="newPin"
                    value={newPin}
                    /* /\D/g, not /D/g — the missing backslash stripped the
                       letter D and left every other letter in place, so any
                       four characters armed the button and the refusal came
                       back from the server, during the one flow whose whole
                       job is getting a locked-out customer back in. */
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="••••"
                    aria-label="Nouveau code secret"
                    className="a-field font-mono tracking-[0.4em]"
                  />
                  <button
                    type="button"
                    disabled={busy || newPin.length !== 4}
                    onClick={() =>
                      start(async () => {
                        const r = await resetPinAction(customer.ref, newPin);
                        if (r.ok) {
                          setNewPin("");
                          setFlash(r.message ?? "Code réinitialisé.");
                        } else setErr(r.error ?? "Échec.");
                      })
                    }
                    className="a-btn a-btn--dark !w-auto shrink-0 px-4 !text-[12px]"
                  >
                    Réinitialiser
                  </button>
                </div>
              </>
            )}

            <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.06em] text-slate">Activité</p>
            {history === null ? (
              <p className="mt-1 text-[12px] text-slate">Chargement…</p>
            ) : history.length === 0 ? (
              <p className="mt-1 text-[12px] text-slate">Aucune activité.</p>
            ) : (
              <ul className="mt-1 divide-y divide-[var(--o-edge)]">
                {history.slice(0, 8).map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate text-[12px] text-slate">
                      {a.reason === "collected" ? `Récupéré · ${a.label ?? ""}` : ACT[a.reason]}
                    </span>
                    <span className="shrink-0 text-[12px] text-slate">{ago(a.at)}</span>
                    {a.reason !== "collected" && (
                      <span
                        className={`w-10 shrink-0 text-right text-[12px] font-bold tabular-nums ${
                          a.delta > 0 ? "text-[#2f9e6e]" : "text-slate"
                        }`}
                      >
                        {a.delta > 0 ? "+" : ""}
                        {fmtPoints(a.delta)}
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

/**
 * `scanned` is a code that arrived from the camera (or from the client field,
 * mistyped there) — already read, so this panel looks it up on its own instead
 * of asking the cashier to key in six characters they are holding a picture of.
 *
 * Its nonce is part of the remount key: a second scan has to reset the panel
 * even when the FIRST one is still showing a result, or the new voucher lands
 * under the previous voucher's Collecter button.
 */
export function ValidateForm({ scanned }: { scanned?: Scanned | null }) {
  const [k, setK] = useState(0);
  return (
    <ValidateInner
      key={`${k}:${scanned?.n ?? 0}`}
      scanned={scanned}
      onReset={() => setK((n) => n + 1)}
    />
  );
}

function ValidateInner({ scanned, onReset }: { scanned?: Scanned | null; onReset: () => void }) {
  const [code, setCode] = useState(scanned?.code ?? "");
  /* Seeded from the scan, so a scanned voucher lands on the confirm-and-collect
     view directly — no second lookup, no six characters to retype. */
  const [peek, setPeek] = useState<PeekState["peek"] | null>(scanned?.peek ?? null);
  const [done, setDone] = useState<{ label: string; code: string } | null>(null);
  const [err, setErr] = useState(scanned?.error ?? "");
  const [busy, start] = useTransition();

  function check() {
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6,8}$/.test(c)) return setErr("Code invalide — 6 à 8 caractères.");
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
      {/* same label treatment as "Ajouter des points" above — the two blocks
          are siblings on one screen and their headings must say so */}
      <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate">
        Valider une récompense
      </h2>

      {done ? (
        <>
          <div role="status" className="mt-4 rounded-2xl bg-[#2f9e6e]/12 px-4 py-6 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#2f9e6e] text-white">
              <CheckIcon className="h-7 w-7" />
            </span>
            <p className="mt-3 text-[17px] font-extrabold text-charcoal">{done.label}</p>
            <p className="mt-0.5 font-mono text-[13px] font-bold text-[#2f9e6e]">{done.code} · collecté</p>
          </div>
          <button type="button" onClick={onReset} className="a-btn a-btn--ghost mt-3">
            Nouveau code
          </button>
        </>
      ) : peek ? (
        <>
          <div
            className={`mt-4 rounded-2xl px-4 py-5 text-center ${
              peek.status === "valid" ? "bg-[var(--o-inset)]" : "bg-[#e5484d]/12"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate">
              {peek.kind === "stamp" ? "Carte pleine" : peek.kind === "win" ? "Gain" : "Récompense"}
            </p>
            <p
              className={`mt-1.5 text-[20px] font-extrabold ${
                peek.status === "valid" ? "text-charcoal" : "text-[#e5484d]"
              }`}
            >
              {peek.label}
            </p>
            <p className="mt-1 font-mono text-[13px] font-bold tracking-[0.12em] text-slate">{peek.code}</p>
            {peek.status !== "valid" && (
              <p className="mt-2 text-[13px] font-semibold text-[#e5484d]">
                {STATUS_MSG[peek.status as "expired" | "claimed"]}
              </p>
            )}
          </div>
          {peek.status === "valid" ? (
            <div className="mt-3 space-y-2">
              <button type="button" onClick={collect} disabled={busy} className="a-btn !min-h-[56px] !text-[17px]">
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
          {/* same row shape as the search above — the two jobs are siblings on
              one screen now, and matching shapes is what says so */}
          <div className="mt-3 flex gap-2">
            <input
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && check()}
              maxLength={8}
              autoCapitalize="characters"
              placeholder="A1B2C3"
              className="min-w-0 flex-1 rounded-2xl bg-[var(--o-inset)] px-4 py-3.5 text-[18px] font-extrabold uppercase tracking-[0.16em] text-charcoal outline-none placeholder:text-slate"
            />
            <button type="button" onClick={check} disabled={busy} className="a-btn !w-auto shrink-0 px-5">
              {busy ? "· · ·" : "Vérifier"}
            </button>
          </div>
          {/* The camera is the fast path and it is one block up, so this line
              points at it instead of only describing the field it sits under. */}
          <p className="mt-2 text-[12px] text-slate">
            Scannez le QR du client — ou tapez son code ici.
          </p>
        </>
      )}

      {err && (
        <p role="alert" className="mt-3 rounded-2xl bg-[#e5484d]/12 px-4 py-3 text-[13px] font-semibold text-[#e5484d]">
          {err}
        </p>
      )}
    </section>
  );
}
