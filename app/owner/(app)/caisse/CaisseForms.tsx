"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QrScanner } from "@/components/QrScanner";
import { CheckIcon, StampIcon } from "@/components/icons";
import { DoneSheet, type Done } from "./DoneSheet";
import type { Activity } from "@/lib/db";
import { fmtDinars, fmtPoints } from "@/lib/points";
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
import { signOutAction } from "../equipe/actions";

/*
  THE TILL IS A MENU OF TWO ACTS, NOT A DASHBOARD OF FIELDS.

  It used to open on everything at once: an amount box, a scanner button, a
  client field, a voucher field, the day's figures. Five things asking to be
  read before a cashier could do the one thing they came to do, with a queue
  waiting. Nothing on that screen said which of them to touch first, because
  the screen did not know what the cashier had come to do.

  So it asks. Two buttons:

      DONNER DES POINTS      →  what  →  who  →  done
      VALIDER UNE RÉCOMPENSE →  code or QR    →  done

  and one quiet line for the third thing (a client's fiche: corrections, the
  history, the secret code) that is not a sale and does not belong beside one.

  ── WHAT, THEN WHO ────────────────────────────────────────────────────────

  A cashier knows the total before they know who is paying: the coffee is rung
  up, then the phone comes out. So the first screen is the money — an amount on
  a keypad, or a stamp — and the second is the person: a scan button and a
  field, and whichever answers first, the points land. There is no confirm step
  and no fiche in between, because the only fact a cashier could not already
  check is WHO the card belongs to, and a name they have never seen is not
  something they can check. The receipt does that job afterwards, where it can
  also carry an undo.

  ── AND IT COMES BACK WITH SOMETHING TO SAY ───────────────────────────────

  The receipt names them, prints their code, says whether they hold a card here
  at all, and shows the balance before and after. That is the question every
  cashier is asked out loud ("j'ai combien ?") and the answer used to require
  closing the confirmation and searching the same person again.

  ── ONE LENS, TWO KINDS OF QR ─────────────────────────────────────────────

  A client card is 4 characters and a reward voucher is 6 (0019 / 0003), drawn
  from the same alphabet, and they look identical in someone's hand. Each
  screen therefore says so when the wrong one arrives, by name, instead of
  refusing with "code introuvable" — which is what sent owners hunting for a
  signup bug that did not exist.
*/

type Customer = NonNullable<ResolveState["customer"]>;

/** Which of the till's screens is up. Exactly one at a time — it is a terminal. */
type View = "home" | "give" | "who" | "reward" | "lookup";

/**
 * What is about to be given, decided BEFORE anyone is identified.
 *
 * Held as a value rather than as "the amount box has something in it": the
 * stamp has no amount, and a screen that infers the act from an empty field is
 * the ambiguity this flow exists to remove.
 */
type Intent = { kind: "credit"; amount: number } | { kind: "stamp" };

/**
 * A voucher that arrived already read — from the camera, or from a field
 * somebody typed it into — together with the lookup the till did for it.
 *
 * The LOOKUP TRAVELS WITH THE CODE on purpose. The alternative was handing the
 * validate panel a bare code and letting it peek itself on mount, which is the
 * same request one render later and puts a setState in an effect for no gain.
 */
type Scanned = { code: string; n: number; peek: PeekState["peek"] | null; error: string };

/**
 * A finished action, still reversible, on the till's own status line.
 *
 * THE UNDO BELONGS TO THE MESSAGE, never to the screen. An undo held in its own
 * state outlives the line that earned it, and the next tap reverses something
 * the cashier is no longer looking at: stamp the wrong card, read "carte pleine
 * 🎉", press the only button under it and silently reverse the PREVIOUS
 * customer's points, reported as "Annulé" — which reads as success. One object,
 * so a message that did not earn an undo is structurally incapable of showing
 * one.
 */
type Flash = {
  text: string;
  undo?: { ref: string; points: number; amount: number };
};

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
 * (pointili_gen_code, 0003_rpcs.sql), drawn from the same alphabet.
 */
function isVoucher(code: string): boolean {
  const c = code.toUpperCase().trim();
  /*
    EIGHT DIGITS IS A PHONE NUMBER. It is the walk-in path — the cashier types
    the number of somebody who has not signed up yet — and it is the one input
    this test must never claim. The range says 6 TO 8 because peekAction accepts
    that much, and a local number is exactly 8 characters from the same class.
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

/* ── the keypad, on the one screen that has room for it ─────────────────
   It went away when the till carried four cards at once: its height was
   exactly what forced that screen to scroll. The amount now has a screen of
   its own, where a till's own keys are what the hand expects and the phone's
   keyboard is the thing that would be in the way. */

/*
  A COMMA, because the rest of the screen writes one.

  The keypad typed "12.5" into a box whose own caption read "12,5 dinars · +12,5
  points" one line below — the same number, spelled two ways, in the same glance.
  Nothing downstream cares (every parse here does .replace(",", ".") first), so
  the only thing the full stop was doing was contradicting the caption.
*/
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"];

function Keypad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((k) => (
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
      ))}
    </div>
  );
}

/**
 * The viewfinder, shared by both scanning screens.
 *
 * A COMPONENT, not a function called during render. It was the latter, and the
 * `react-hooks/refs` rule is right to refuse it: the callback handed in reads
 * the submit lock, so a plain call during render is indistinguishable from
 * reading that ref while rendering. As a prop it is invoked from an event,
 * which is where a ref is meant to be read.
 */
function Lens({
  nonce,
  label,
  busy,
  onRead,
  onUnavailable,
}: {
  /** Bumped by the caller after every read — see the note where it lives. */
  nonce: number;
  label: string;
  busy: boolean;
  onRead: (text: string) => void;
  onUnavailable: () => void;
}) {
  return (
    <div>
      <div className="overflow-hidden rounded-3xl border border-[var(--o-edge)]">
        {/* no camera on this device → drop straight back to the field */}
        <QrScanner key={nonce} onScan={onRead} onUnavailable={onUnavailable} />
      </div>
      <p className="mt-3 text-center text-[13px] font-semibold text-slate">
        {busy ? "Un instant…" : label}
      </p>
    </div>
  );
}

/** Every screen but the home one: a way back, a title, and the work. */
function Step({
  title,
  hint,
  onBack,
  children,
}: {
  title: string;
  hint?: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    /*
      A div, not a section. As a <section> wrapping the screen's own <h2> it
      matched `section:has(h2:has-text(...))` — which is how three suites scope
      the voucher panel — and every one of those selectors then resolved to two
      elements instead of one.
    */
    <div className="mx-auto w-full max-w-[520px]">
      {/*
        THE TITLE IS THE MIDDLE OF THE SCREEN; THE WAY BACK IS THE EDGE.

        They used to be a row — arrow, then title, both pushed left — which reads
        as a toolbar, two controls of equal weight, when only one of them is what
        the screen is about. Taking the arrow out of the flow lets the title sit
        on the centre line everything below it already shares: the amount, the
        keypad, the button.

        px-12 on the text so a long title wraps before it reaches the arrow
        rather than under it. `start-0`, not `left-0`, because the shell flips.
      */}
      <div className="relative mb-4 flex min-h-[44px] items-center justify-center">
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour"
          className="absolute start-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-[var(--o-inset)] text-charcoal active:scale-95"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M19 12H5m6-6-6 6 6 6" />
          </svg>
        </button>
        <div className="min-w-0 px-12 text-center">
          <h2 className="text-[19px] font-extrabold leading-tight text-charcoal">{title}</h2>
          {hint && <p className="mt-0.5 text-[12px] font-semibold text-slate">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */

export function CaisseDesk({
  pointsPerTnd,
  multiplier,
  stampsEnabled,
  stampsRequired,
  today,
  onDuty,
}: {
  pointsPerTnd: number;
  /**
   * An active "points doublés" event, read shop-wide by the page.
   *
   * The preview has to be the number that LANDS, and it is shown before anyone
   * is identified — so it cannot be looked up per customer. It does not have to
   * be: the multiplier is a property of the shop and the hour
   * (pointili_active_multiplier), and the per-customer half of the old preview
   * has been a constant 0 since 0027.
   */
  multiplier: number;
  stampsEnabled: boolean;
  stampsRequired: number;
  /*
    THE SHIFT, RENDERED BY THE PAGE AND HANDED IN.

    This is a Client Component and the day's figures come from a server read
    (lib/db ownerToday), so the page renders <Today> and passes the finished
    element down. Fetching it from here would put a loading state and an effect
    on the one screen that must be instant.
  */
  today: React.ReactNode;
  /**
   * Who is signed in at the counter, when the shop asks (0048).
   *
   * null covers both "this shop has not switched staff codes on" and "nobody
   * has said who they are" — and the second cannot reach this screen, because
   * the layout renders the sign-in gate instead of the app.
   */
  onDuty: { name: string; role: string } | null;
}) {
  const [view, setView] = useState<View>("home");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [amount, setAmount] = useState("");
  const [typed, setTyped] = useState("");
  /*
    THE LENS IS ON UNLESS IT CANNOT BE.

    It used to be behind a "Scanner le QR" button, which cost a tap on the most
    repeated action in the product — and the tap bought nothing: by the time
    this screen is up the cashier has already chosen the act, keyed the amount
    and pressed Créditer. They are holding the phone at a customer's card. There
    is no version of "yes, really open the camera" worth asking for.

    So this flag is only ever set by the two things that make a live lens wrong:
    a device with no camera (the back-office laptop), and a read that failed —
    because the scanner remounts after every decode, and a card the shop cannot
    resolve sitting in the frame would otherwise refuse itself once a second,
    forever. Both land the cashier on the field, which is the way out of both.
  */
  const [lensDown, setLensDown] = useState(false);
  /*
    Bumped after every successful read, to REMOUNT the scanner.

    QrScanner stops its MediaStream once it decodes something — it has to, or it
    would fire again on the same frame. But its effect only depends on `facing`,
    so nothing ever restarted it: the camera read customer #1 and then showed a
    frozen frame for the rest of the shift, with no error to explain why.
  */
  const [scanNonce, setScanNonce] = useState(0);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [voucher, setVoucher] = useState<Scanned | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [error, setError] = useState("");
  const [busy, start] = useTransition();

  /*
    THE LOCK IS A REF, NOT `busy`.

    `busy` is transition state: it is not true on the line after start(), so two
    reads arriving in the same tick both pass a `if (busy) return` and the
    customer is served twice. That is not hypothetical — a held Enter key
    repeats, and a card left in front of the lens is decoded by the remounted
    scanner on its very first frame. A ref flips synchronously, which is the
    only thing that can refuse the second one.
  */
  const sending = useRef(false);

  const n = Number(amount.replace(",", "."));
  const valid = amount.trim() !== "" && Number.isFinite(n) && n > 0 && n <= 10_000;
  /*
    The same arithmetic the server does — rate × event, rounded at the hundredth,
    exactly as credit_points (0027). A cashier reads this out loud before the
    customer's card is even out of their pocket, so it has to be the figure the
    receipt will show.
  */
  const earned = Math.round(n * pointsPerTnd * multiplier * 100) / 100;

  /**
   * Leave for another screen. Everything SCREEN-LOCAL goes with it.
   *
   * Deliberately not the receipt: a finished act sets the receipt and then sends
   * the till home, so clearing `done` in here wiped the confirmation of every
   * sale one line after it was created. A stale receipt cannot get in the way
   * either — it is a full-screen veil, so nothing underneath can be pressed
   * while it is up, and it takes itself down after four seconds.
   */
  function go(next: View) {
    setError("");
    setTyped("");
    /* Every screen re-tries the camera: a permission granted since the last
       failure should not need the app restarting to take effect. */
    setLensDown(false);
    setView(next);
  }

  /** Back to the two buttons, with nothing half-typed left behind. */
  function home() {
    setIntent(null);
    setAmount("");
    setCustomer(null);
    go("home");
  }

  /** What the pending act is, in the words the cashier used to choose it. */
  const intentLine =
    intent?.kind === "credit"
      ? `${fmtDinars(intent.amount)} DT · +${fmtPoints(
          Math.round(intent.amount * pointsPerTnd * multiplier * 100) / 100,
        )} points`
      : intent?.kind === "stamp"
        ? "+1 tampon"
        : "";

  /** Hand the keyed amount to the second step. */
  function toWho() {
    if (!valid) return setError("Montant invalide — de 0,01 à 10 000 DT.");
    setIntent({ kind: "credit", amount: n });
    go("who");
  }

  /* ── undo ─────────────────────────────────────────────────────────── */

  function undo(u: NonNullable<Flash["undo"]>) {
    // drop the offer immediately — a double tap must not reverse twice
    setFlash({ text: `Annulation de ${fmtPoints(u.points)} points…` });
    start(async () => {
      // negative dinars too, so Analyses subtracts the sale and not only the
      // points it derived from it (0025)
      const r = await adjustByCodeAction(u.ref, -u.points, -u.amount);
      if (r.ok && typeof r.balance === "number") {
        setFlash({ text: `Annulé : −${fmtPoints(u.points)} points · solde ${fmtPoints(r.balance)}` });
      } else {
        // put the offer back: the reversal did not happen
        setFlash({ text: `+${fmtPoints(u.points)} points`, undo: u });
        setError(r.error ?? "Échec.");
      }
    });
  }

  /* ── the act, applied to whoever this code turns out to be ────────── */

  /**
   * No confirmation step, on purpose.
   *
   * A step here could only ask "is this the right person?", which is a question
   * the cashier cannot answer: a scanned card shows a name they have never
   * seen. A prompt nobody can evaluate is a prompt that gets tapped through,
   * and it costs a second on every sale of the day. The receipt confirms
   * afterwards — where it can name them AND carry an undo.
   */
  function apply(raw: string) {
    const code = extractCode(raw);
    if (!code || !intent) return;
    /* One act per read — see `sending`. */
    if (sending.current) return;

    /*
      SHUT THE LENS BEFORE THE ROUND TRIP, not after it. The scanner is
      remounted on every read, and a card still sitting in the frame decodes
      again on its first frame — which, now that a read spends money, is a
      second sale nobody keyed.
    */
    setLensDown(true);
    setError("");
    setDone(null);

    /*
      A VOUCHER IS NOT A CUSTOMER, and here it cannot be quietly re-routed: a
      sale is half done. Name it, and name the button that collects it.
    */
    if (isVoucher(code)) {
      setError(
        `${code.toUpperCase()} est un code de récompense, pas une carte client. ` +
          `Terminez la vente, puis passez par « Valider une récompense ».`,
      );
      return;
    }

    sending.current = true;
    setFlash({ text: intent.kind === "stamp" ? "Tampon en cours…" : "Crédit en cours…" });
    setTyped("");

    start(async () => {
      try {
        const fd = new FormData();
        fd.set("customer", code);
        if (intent.kind === "credit") fd.set("amount", String(intent.amount));

        const res =
          intent.kind === "credit"
            ? await creditAction({}, fd)
            : await addStampAction({}, fd);

        if (res.error) {
          /* Stay on the who screen with the act intact: "client introuvable"
             means the CODE was wrong, not the sale. Making the cashier key the
             total again punishes them for a smudged screen. */
          setFlash(null);
          setError(res.error);
          return;
        }
        if (!res.ok) return;

        if ("earned" in res.ok) {
          const c = res.ok;
          // only the earned points are reversible — a one-time welcome bonus is
          // not part of the mistake and taking it back would be a second one
          const back =
            c.earned > 0 ? { ref: code, points: c.earned, amount: c.amount } : undefined;
          setDone({
            kind: "credit",
            who: c.who,
            before: c.before,
            earned: c.earned,
            welcome: c.welcome,
            balance: c.balance,
            amount: c.amount,
            unlocked: c.unlocked,
            next: c.next,
            onUndo: back ? () => undo(back) : undefined,
          });
          setFlash({
            undo: back,
            text:
              `${c.who.label} · +${fmtPoints(c.earned)} points` +
              (c.welcome > 0 ? ` · +${fmtPoints(c.welcome)} de bienvenue` : "") +
              ` · solde ${fmtPoints(c.balance)}`,
          });
        } else {
          const st = res.ok;
          setDone({
            kind: "stamp",
            who: st.who,
            // the RPC resets the card to 0 on completion, so show it FULL here —
            // "0/10" as the confirmation of filling it reads as a failure
            count: st.completed ? st.required : st.count,
            required: st.required,
            completed: st.completed,
            code: st.code,
            label: st.label,
          });
          setFlash({
            text: st.completed
              ? `${st.who.label} · carte pleine 🎉 ${st.label} — code ${st.code}`
              : `${st.who.label} · ${st.count} / ${st.required} tampons`,
          });
        }
        home();
      } catch {
        /* A dropped connection must not leave the lock on: the till would
           refuse every later read in silence for the rest of the shift. */
        setFlash(null);
        setError("Connexion perdue. Réessayez.");
      } finally {
        sending.current = false;
      }
    });
  }

  /* ── the reward door ──────────────────────────────────────────────── */

  function peek(raw: string) {
    const code = extractCode(raw).toUpperCase();
    if (!code) return;
    setLensDown(true);
    setDone(null);
    if (!isVoucher(code)) {
      setError("Ce QR est une carte client — passez par « Donner des points ».");
      return;
    }
    setError("");
    start(async () => {
      // Read-only: peek says WHAT the code is. Nothing is claimed until the
      // cashier presses Collecter, exactly as when they type it by hand.
      const fd = new FormData();
      fd.set("code", code);
      const res = await peekAction({}, fd);
      setVoucher((v) => ({
        code,
        n: (v?.n ?? 0) + 1,
        peek: res.peek ?? null,
        error: res.error ?? "",
      }));
    });
  }

  /* ── the fiche door ───────────────────────────────────────────────── */

  function look(raw: string) {
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

  const errorLine = error && (
    <p role="alert" className="mt-3 rounded-2xl bg-[#e5484d]/12 px-4 py-3 text-center text-[13px] font-semibold leading-snug text-[#e5484d]">
      {error}
    </p>
  );

  /* ══════════════════════════════════════════════════════════════════ */

  return (
    <div data-owner-wide className="space-y-4">
      {view === "home" && (
        /*
          SEVEN AND FIVE, NOT SIX AND SIX.

          The two halves are not equals. The left is the till — what a cashier
          touches — and the right is the day, which is read. Splitting them
          evenly made the working half narrower than it needed to be while the
          reading half had more room than it could use.
        */
        <div className="space-y-4 lg:grid lg:grid-cols-12 lg:items-start lg:gap-5 lg:space-y-0">
          {/*
            THE ACTS DO NOT GROW WITH THE SCREEN.

            At lg they had seven columns — about 880px — which turned two
            buttons into two banners, with their contents adrift in the middle of
            all that width. A till is worked with one hand and its controls want
            a hand's width wherever they are shown, so they keep 520px and sit in
            the middle of the space instead of filling it. The day beside them is
            the thing that actually wanted the room.
          */}
          <div className="mx-auto w-full max-w-[520px] space-y-3 lg:col-span-7">
            {/*
              TWO ACTS, AT THE SIZE OF THE HAND THAT PRESSES THEM.

              Not a grid of equal tiles: giving points happens on every sale and
              collecting a reward happens on a few, so the first is the tall one
              and the second is plainly second. Each says what it opens, because
              a cashier who has to guess which button hides the QR reader will
              type six characters by hand instead.

              CENTRED, ICON AND WORDS TOGETHER. They were left-aligned rows, and
              a left-aligned row is the shape of a LIST — something you read down
              before choosing. These are the two things this screen does; centring
              the pair puts them on the same vertical line as everything they lead
              to, so pressing one does not move the eye sideways.
            */}
            <button
              type="button"
              onClick={() => {
                setIntent(null);
                setAmount("");
                go("give");
              }}
              className="a-btn flex w-full flex-col items-center justify-center gap-2 !min-h-[132px] px-5 text-center"
            >
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/20">
                <StampIcon className="h-7 w-7" />
              </span>
              <span>
                <span className="block text-[19px] font-extrabold leading-tight">Donner des points</span>
                <span className="block text-[12px] font-semibold opacity-80">
                  {stampsEnabled ? "un achat, ou un tampon" : "un achat"}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setVoucher(null);
                go("reward");
              }}
              className="a-btn a-btn--dark flex w-full flex-col items-center justify-center gap-1.5 !min-h-[112px] px-5 text-center"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--o-panel)]">
                <span className="text-[22px] leading-none">🎁</span>
              </span>
              <span>
                <span className="block text-[17px] font-extrabold leading-tight">Valider une récompense</span>
                <span className="block text-[12px] font-semibold text-slate">un code ou un QR</span>
              </span>
            </button>

            {/*
              THE THIRD THING IS NOT A SALE, so it is not a button beside them.

              Corrections, the history and the secret-code reset are what an
              owner does a few times a week, standing still. Giving them equal
              weight is what made this screen a form to read instead of a
              terminal to press.
            */}
            <button
              type="button"
              onClick={() => go("lookup")}
              className="w-full py-2 text-center text-[13px] font-bold text-slate underline decoration-[var(--o-edge)] underline-offset-4"
            >
              Chercher un client
            </button>

            {/*
              THE LINE THAT OUTLIVES THE RECEIPT.

              The receipt takes itself off the screen after four seconds, usually
              while the cashier is bagging the order. Without this the undo for a
              mis-scan would go with it.
            */}
            {flash && (
              <div
                role="status"
                className="flex items-center justify-between gap-3 rounded-2xl bg-[#2f9e6e]/12 px-4 py-3"
              >
                <p className="min-w-0 text-[13px] font-bold leading-snug text-[#2f9e6e]">{flash.text}</p>
                {flash.undo && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => undo(flash.undo!)}
                    className="shrink-0 rounded-full bg-[var(--o-inset)] px-3.5 py-1.5 text-[12px] font-bold text-charcoal active:scale-95"
                  >
                    Annuler
                  </button>
                )}
              </div>
            )}
            {errorLine}

            {/*
              THE WAY OUT, AND IT IS RED ON PURPOSE.

              One phone lives behind a counter and it gets handed over. Without
              this, everything the next person does carries the last person's
              name — which is worse than no record at all, because it is a
              record that reads as true.

              So leaving is one tap from the screen they are already looking at,
              it says whose name is on the till right now, and it is the colour
              of a thing you press deliberately. Anything quieter and nobody
              presses it; anything further away and nobody finds it.

              The session also expires after twelve hours, for the evening
              somebody forgets — but an expiry is not a substitute for a button,
              because the handover happens mid-shift.
            */}
            {onDuty && <LeaveButton name={onDuty.name} role={onDuty.role} />}
          </div>

          <div className="lg:col-span-5">{today}</div>
        </div>
      )}

      {/* ── 1 · what is being given ───────────────────────────────────── */}
      {view === "give" && (
        <Step title="Donner des points" hint={`${pointsPerTnd} point par dinar`} onBack={home}>
          <div className="a-card p-4">
            <input
              name="amount"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && toWho()}
              placeholder="0"
              /*
                inputMode="none": the KEYPAD below is the only way in.

                As a decimal input this raised the phone's own keyboard on focus
                — over the top of the keypad drawn for it — so the screen offered
                two number pads, and the one the OS supplied pushed Créditer off
                the bottom. It is still a real input (a caret, a value, something
                a test can fill); it simply stops asking the OS for help it
                already has on screen.
              */
              inputMode="none"
              aria-label="Montant en dinars"
              className="w-full rounded-2xl bg-[var(--o-inset)] px-4 py-4 text-center text-[34px] font-extrabold tabular-nums text-charcoal outline-none placeholder:text-slate"
            />
            {/*
              THE UNIT NEVER LEAVES THE SCREEN — «12,5 dinars · +12,5 points»,
              two facts in the order they happen. This line used to swap to the
              points alone the moment anything was typed, which took the one word
              saying DINARS off the screen at exactly the keystroke where it
              matters.
            */}
            <p
              className={`mt-2 text-center text-[13px] font-semibold ${
                amount.trim() !== "" && !valid ? "text-[#e5484d]" : "text-slate"
              }`}
            >
              {amount.trim() === ""
                ? "Montant en dinars"
                : !valid
                  ? "Montant invalide — de 0,01 à 10 000 DT"
                  : `${fmtDinars(n)} dinars · +${fmtPoints(earned)} points` +
                    (multiplier > 1 ? ` · ×${multiplier} en cours` : "")}
            </p>
            <div className="mt-3">
              <Keypad
                onKey={(k) => {
                  setError("");
                  if (k === "⌫") return setAmount(amount.slice(0, -1));
                  /* Either separator, because the field is typeable too — a
                     phone keyboard offers a full stop and this box accepts it. */
                  if (k === "," && /[.,]/.test(amount)) return;
                  if (amount.replace(/[.,]/, "").length >= 7) return;
                  setAmount(amount + k);
                }}
              />
            </div>
            <button
              type="button"
              onClick={toWho}
              disabled={!valid}
              className="a-btn mt-3 !min-h-[56px] !text-[17px] disabled:opacity-50"
            >
              Créditer
            </button>
          </div>

          {stampsEnabled && (
            <>
              <p className="my-3 text-center text-[12px] font-bold uppercase tracking-[0.08em] text-slate">
                ou
              </p>
              {/*
                A STAMP NEEDS NO CONFIRMATION HERE ANY MORE.

                It used to ask before it wrote, because it was one tap on an open
                fiche and at 9/10 that tap hands out the free coffee. It is now
                three deliberate acts — this screen, this button, then a scan —
                and the identification step IS the pause. A second "are you
                sure?" on top of that is the kind cashiers learn to tap through.
              */}
              <button
                type="button"
                onClick={() => {
                  setIntent({ kind: "stamp" });
                  go("who");
                }}
                className="a-btn a-btn--dark flex !min-h-[56px] items-center justify-center gap-2"
              >
                <StampIcon className="h-5 w-5" /> +1 tampon
              </button>
            </>
          )}
          {errorLine}
        </Step>
      )}

      {/* ── 2 · who it is for ─────────────────────────────────────────── */}
      {view === "who" && intent && (
        <Step
          title={intent.kind === "stamp" ? "Pour qui ?" : "Qui paie ?"}
          hint={intentLine}
          onBack={() => {
            setIntent(null);
            go("give");
          }}
        >
          {!lensDown && (
            <Lens
              nonce={scanNonce}
              busy={busy}
              label={`Pointez la carte — ${intentLine}`}
              onRead={(text) => {
                setScanNonce((k) => k + 1);
                apply(text);
              }}
              onUnavailable={() => setLensDown(true)}
            />
          )}

          {/*
            AND THE FIELD IS ALREADY THERE, under the lens.

            Not behind an "ou", not behind a second button. Both doors on one
            screen means the cashier never chooses a mode — they point the phone,
            or they type, and whichever happens first is the answer. It is also
            what a laptop with no camera gets, without anything having to fail
            first.
          */}
          <div className="a-card mt-3 p-4">
                <div className="flex gap-2">
                  <input
                    name="customer"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && apply(typed)}
                    placeholder="Code client ou numéro"
                    inputMode="text"
                    autoCapitalize="characters"
                    className="min-w-0 flex-1 rounded-2xl bg-[var(--o-inset)] px-4 py-3.5 text-center text-[18px] font-extrabold tracking-[0.05em] text-charcoal outline-none placeholder:text-[14px] placeholder:font-semibold placeholder:tracking-normal placeholder:text-slate"
                  />
                  <button
                    type="button"
                    onClick={() => apply(typed)}
                    disabled={busy || !typed.trim()}
                    className="a-btn !w-auto shrink-0 px-5"
                  >
                    {busy ? "· · ·" : "Confirmer"}
                  </button>
                </div>
                <p className="mt-2 text-center text-[12px] leading-snug text-slate">
                  Ou tapez son code à 4 caractères, ou son numéro.
                </p>
          </div>
          {errorLine}
        </Step>
      )}

      {/* ── the other act ─────────────────────────────────────────────── */}
      {view === "reward" && (
        <Step title="Valider une récompense" onBack={home}>
          {/*
            The lens goes the moment there is something to ACT on. Once a
            voucher has been read the screen is about one decision — collect it
            or not — and a live camera above that decision is only a way to
            replace the thing being decided.
          */}
          {!lensDown && !voucher && (
            <Lens
              nonce={scanNonce}
              busy={busy}
              label="Pointez le QR de la récompense"
              onRead={(text) => {
                setScanNonce((k) => k + 1);
                peek(text);
              }}
              onUnavailable={() => setLensDown(true)}
            />
          )}
          <div className={!lensDown && !voucher ? "mt-3" : ""}>
            <ValidateForm scanned={voucher} />
          </div>
          {errorLine}
        </Step>
      )}

      {/* ── and the thing that is not a sale ──────────────────────────── */}
      {view === "lookup" && (
        <Step
          title="Chercher un client"
          hint="corriger un solde, lire l'historique, remettre le code secret"
          onBack={home}
        >
          <div className="a-card p-4">
            <div className="flex gap-2">
              <input
                name="customer"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && look(typed)}
                placeholder="Code client ou numéro"
                inputMode="text"
                autoCapitalize="characters"
                className="min-w-0 flex-1 rounded-2xl bg-[var(--o-inset)] px-4 py-3.5 text-center text-[18px] font-extrabold tracking-[0.05em] text-charcoal outline-none placeholder:text-[14px] placeholder:font-semibold placeholder:tracking-normal placeholder:text-slate"
              />
              <button
                type="button"
                onClick={() => look(typed)}
                disabled={busy || !typed.trim()}
                className="a-btn !w-auto shrink-0 px-5"
              >
                {busy ? "· · ·" : "Chercher"}
              </button>
            </div>
          </div>
          {errorLine}
        </Step>
      )}

      {/*
        The receipt, over the top of everything.

        onNext and onClose do the same thing here and that is not an oversight:
        the till is already back on its two buttons — apply() sent it there
        before the receipt went up — so there is no customer still bound to a
        screen for "Client suivant" to release. That binding was the failure the
        two handlers existed to tell apart.
      */}
      {done && <DoneSheet done={done} onClose={() => setDone(null)} onNext={() => setDone(null)} />}

      {customer && (
        <CustomerSheet
          key={customer.ref}
          customer={customer}
          stampsEnabled={stampsEnabled}
          stampsRequired={stampsRequired}
          onClose={() => setCustomer(null)}
        />
      )}
    </div>
  );

}

/** "C'est Sami qui tient la caisse" — and the tap that ends that. */
function LeaveButton({ name, role }: { name: string; role: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() =>
        start(async () => {
          await signOutAction();
          /* The layout renders the gate again the moment the cookie is gone —
             same URL, different screen. There is nothing to navigate to. */
          router.refresh();
        })
      }
      className="flex w-full items-center justify-center gap-3 rounded-2xl border border-[#e5484d]/35 bg-[#e5484d]/[0.07] px-4 py-3 text-center active:scale-[0.99] disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-extrabold text-[#e5484d]">
          {busy ? "À bientôt…" : `Quitter — ${name}`}
        </span>
        <span className="block text-[11.5px] font-semibold text-[#e5484d]/80">
          {role} · les opérations sont à votre nom
        </span>
      </span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 text-[#e5484d]">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
      </svg>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  THE FICHE — everything about one customer that is NOT a sale          */
/* ══════════════════════════════════════════════════════════════════════ */

/**
 * It used to be the middle of every sale: scan, wait, read this, type an
 * amount, press Créditer. Selling moved to its own two steps, so what is left
 * here is the work this screen was always better at — reading what happened and
 * putting it right.
 *
 * The sale controls are gone from it deliberately. Two places to credit the
 * same customer is two places to credit the WRONG customer, and the one that
 * survived is the one with a receipt and an undo.
 */
function CustomerSheet({
  customer,
  stampsEnabled,
  stampsRequired,
  onClose,
}: {
  customer: Customer;
  stampsEnabled: boolean;
  stampsRequired: number;
  onClose: () => void;
}) {
  const [balance, setBalance] = useState(customer.balance);
  const [stamps, setStamps] = useState(customer.stamps);
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  const [history, setHistory] = useState<Activity[] | null>(null);
  const [delta, setDelta] = useState("");
  const [flash, setFlash] = useState("");
  const [newPin, setNewPin] = useState("");
  const [stampSet, setStampSet] = useState(String(customer.stamps));

  /*
    The activity loads WITH the fiche, not behind a second tap.

    It sat under a "Corriger / Historique" toggle back when this screen's job
    was to take a payment and the history was a detour. Now it is the reason the
    screen exists: nobody opens a fiche without wanting to know what happened.
  */
  useEffect(() => {
    let live = true;
    historyByCodeAction(customer.ref).then((h) => live && setHistory(h));
    return () => {
      live = false;
    };
  }, [customer.ref]);

  return (
    /*
      A WASH ON A PHONE, A CARD IN THE MIDDLE OF ANYTHING BIGGER.

      It was a full-bleed white panel at every width, which is right on the
      device it was designed for and wrong on the one an owner reads it on: a
      1900px screen going entirely white to show four short rows about one
      customer, with the app it came from gone. A dialog should look like
      something laid ON the screen, and the screen should still be there.

      m-auto rather than items-center, for the reason the receipt gives in its
      own file: a centred flex child that outgrows its parent crops at BOTH ends
      and no scroll can reach the cropped part. Auto margins centre it while it
      is short and collapse the moment it is not.
    */
    <div
      className="sheet-in fixed inset-0 z-50 flex overflow-y-auto bg-[#ffffff]/97 backdrop-blur-sm md:bg-[#14101f]/45 md:p-6"
      onClick={(e) => {
        /* The veil dismisses — but only the veil. Without the target test, a tap
           anywhere inside the card closes the fiche mid-correction. */
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Fiche client"
        className="m-auto flex min-h-dvh w-full max-w-[520px] flex-col bg-[var(--o-panel)] md:min-h-0 md:max-h-[86vh] md:rounded-[28px] md:border md:border-[var(--o-edge)] md:shadow-[0_30px_80px_-30px_rgba(23,18,31,.5)]"
      >
      <header className="relative flex w-full flex-col items-center gap-1 px-5 pb-3 pt-5 text-center">
        <p className="max-w-full truncate text-[24px] font-extrabold leading-tight text-charcoal">
          {customer.name ?? "Client"}
        </p>
        {customer.enrolled ? (
          <p className="font-mono text-[13px] font-bold tracking-[0.14em] text-slate">
            {customer.code}
          </p>
        ) : (
          <p className="text-[12px] font-semibold text-[#a06e00]">
            {/* "enrolled" means "has a card HERE" — they may well be a
                Pointili member already, just not yours yet. */}
            Première visite ici — ses points l&apos;attendent
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute end-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-[var(--o-inset)] text-[20px] leading-none text-charcoal active:scale-95"
        >
          ×
        </button>
      </header>

      <div className="min-h-0 w-full flex-1 overflow-y-auto px-5 pb-6">
        <p className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5 text-[13px] font-semibold text-slate">
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
          <p role="status" className="mt-3 rounded-2xl bg-[#2f9e6e]/12 px-4 py-3 text-[13px] font-bold text-[#2f9e6e]">
            {flash}
          </p>
        )}
        {err && (
          <p role="alert" className="mt-3 rounded-2xl bg-[#e5484d]/12 px-4 py-3 text-[13px] font-semibold text-[#e5484d]">
            {err}
          </p>
        )}

        <p className="mt-4 text-center text-[12px] font-bold uppercase tracking-[0.06em] text-slate">
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
              const d = Number(delta.replace(",", "."));
              if (!Number.isFinite(d) || d === 0) return;
              setErr("");
              start(async () => {
                const r = await adjustByCodeAction(customer.ref, d);
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
            <p className="mt-3 text-center text-[12px] font-bold uppercase tracking-[0.06em] text-slate">
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
                  const c = Number(stampSet);
                  if (!Number.isFinite(c) || c < 0) return;
                  setErr("");
                  start(async () => {
                    const r = await setStampsByCodeAction(customer.ref, c);
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

          pin_hash is written in exactly one other place — account creation — so
          before this, forgetting the code meant losing every card at every shop,
          permanently, with nobody able to help. It belongs at the counter
          because the hard part of a reset is proving who you are, and that is
          already solved by standing in front of someone.
        */}
        {customer.enrolled && (
          <>
            <p className="mt-4 text-center text-[12px] font-bold uppercase tracking-[0.06em] text-slate">
              Code secret oublié
            </p>
            <p className="mt-1 text-center text-[12px] leading-snug text-slate">
              Le client choisit un nouveau code à 4 chiffres et vous le tapez ici.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                name="newPin"
                value={newPin}
                /* /\D/g, not /D/g — the missing backslash stripped the letter D
                   and left every other letter in place, so any four characters
                   armed the button and the refusal came back from the server,
                   during the one flow whose whole job is getting a locked-out
                   customer back in. */
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
                onClick={() => {
                  setErr("");
                  start(async () => {
                    const r = await resetPinAction(customer.ref, newPin);
                    if (r.ok) {
                      setNewPin("");
                      setFlash(r.message ?? "Code réinitialisé.");
                    } else setErr(r.error ?? "Échec.");
                  });
                }}
                className="a-btn a-btn--dark !w-auto shrink-0 px-4 !text-[12px]"
              >
                Réinitialiser
              </button>
            </div>
          </>
        )}

        <p className="mt-4 text-center text-[12px] font-bold uppercase tracking-[0.06em] text-slate">Activité</p>
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
      </section>
    </div>
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
 * `scanned` is a code that arrived from the camera — already read and already
 * looked up, so this panel does not ask the cashier to key in six characters
 * they are holding a picture of.
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
      {/* No heading: this panel now lives on a screen whose title already says
          "Valider une récompense", one line above it. */}
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
          <div className="mt-3 flex gap-2">
            <input
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && check()}
              maxLength={8}
              autoCapitalize="characters"
              placeholder="A1B2C3"
              className="min-w-0 flex-1 rounded-2xl bg-[var(--o-inset)] px-4 py-3.5 text-center text-[18px] font-extrabold uppercase tracking-[0.16em] text-charcoal outline-none placeholder:text-slate"
            />
            <button type="button" onClick={check} disabled={busy} className="a-btn !w-auto shrink-0 px-5">
              {busy ? "· · ·" : "Vérifier"}
            </button>
          </div>
          <p className="mt-2 text-center text-[12px] text-slate">
            Les 6 caractères imprimés sur le code du client.
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
