"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { QrScanner } from "@/components/QrScanner";
import { CheckIcon } from "@/components/icons";
import { DoneSheet, type Done } from "./DoneSheet";
import type { Activity } from "@/lib/db";
import { fmtDinars, fmtPoints } from "@/lib/points";
import {
  adjustByCodeAction,
  resetPinAction,
  collectAction,
  giveAction,
  historyByCodeAction,
  peekAction,
  resolveCustomerAction,
  setStampsByCodeAction,
  type PeekState,
  type ResolveState,
} from "./actions";

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
/*
  TWO VIEWS, AND ONE OF THEM IS THE WHOLE TILL.

  There were five: a home of two buttons, an amount screen, an identify screen,
  a voucher screen, and the customer lookup. Four of them were one act split up.
  A counter has one question — who is in front of me and what are they owed —
  and it is answered by pointing the camera at whatever they are holding.
*/
type View = "till" | "lookup";

/**
 * What is about to be given, decided BEFORE anyone is identified.
 *
 * Held as a value rather than as "the amount box has something in it": the
 * stamp has no amount, and a screen that infers the act from an empty field is
 * the ambiguity this flow exists to remove.
 */
/*
  `key` is the ACT's identity, and it is minted here rather than at submit time
  on purpose. A credit whose answer is lost leaves the cashier on the same
  screen with the sale intact, and the only sane thing to do in front of a
  waiting customer is tap again — so the retry has to carry the key the first
  attempt used, or the customer is credited twice (0049).

  Composing a NEW sale mints a NEW key, which is what keeps two identical
  coffees a minute apart from being mistaken for one. That distinction is the
  whole reason this is a key and not a "same amount, same customer" rule.
*/
type Intent =
  | { kind: "credit"; amount: number; key: string }
  | { kind: "stamp"; key: string };

/** A key per composed act. randomUUID needs a secure context; the till is
    HTTPS in production and localhost in development, both of which qualify —
    but a stray http:// origin would throw mid-sale, so it falls back. */
function newOpKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

/**
 * A voucher that arrived already read — from the camera, or from a field
 * somebody typed it into — together with the lookup the till did for it.
 *
 * The LOOKUP TRAVELS WITH THE CODE on purpose. The alternative was handing the
 * validate panel a bare code and letting it peek itself on mount, which is the
 * same request one render later and puts a setState in an effect for no gain.
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
    /* 44px keys, not 58, and a tighter gutter — the minimum a thumb wants,
       and not a pixel more. The pad gave up 56px of height so that the amount,
       the stamps, the viewfinder and the code field all fit one screen with
       nothing to scroll, which is the whole point of this layout. */
    <div className="grid grid-cols-3 gap-1.5">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onKey(k)}
          className={`h-[44px] rounded-xl text-[20px] font-bold tabular-nums transition active:scale-95 ${
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
  compact = false,
  onRead,
  onUnavailable,
}: {
  /** Bumped by the caller after every read — see the note where it lives. */
  nonce: number;
  label: string;
  busy: boolean;
  /** Shares the screen with something else — see QrScanner's `aspect`. */
  compact?: boolean;
  onRead: (text: string) => void;
  onUnavailable: () => void;
}) {
  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-[var(--o-edge)]">
        {/* no camera on this device → drop straight back to the field */}
        <QrScanner
          key={nonce}
          onScan={onRead}
          onUnavailable={onUnavailable}
          aspect={compact ? "aspect-[21/9]" : "aspect-[4/5]"}
        />
      </div>
      <p className={`text-center text-[12.5px] font-semibold text-slate ${compact ? "mt-1.5" : "mt-3"}`}>
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
  /** Omitted on the counter itself — there is nothing above it to go back to. */
  onBack?: () => void;
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
        {onBack && (
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
        )}
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
}) {
  /*
    ?client=1 OPENS THE CUSTOMER LOOKUP.

    "Chercher un client" left this screen when the till went down to two acts;
    it lives in the floating menu, which is a global component and knows nothing
    about this file's `view` state. An address is the one thing they can both
    speak. It is also better than the button was: the lookup is now reachable
    from Réglages or the client list, not only from the till.

    Read once, on arrival, and only to choose the STARTING view — after that the
    screen is the cashier's. Treating it as live state would drag them back here
    every time they pressed the back arrow.
  */
  const router = useRouter();
  const openLookup = useSearchParams().get("client") === "1";
  const [view, setView] = useState<View>(openLookup ? "lookup" : "till");

  /*
    AND IT HAS TO REACT, not just start.

    Reading the param into useState's initial value only worked on a cold load.
    Arriving from the menu is a client navigation from /owner to /owner?client=1
    — same route, same component, no remount — so the initial value was never
    computed again and the link did nothing at all. It looked like the menu item
    was dead.

    Adjusting state during render is React's own answer to "a prop changed and
    some state should follow": it re-renders before anything is painted, so the
    lookup is the first thing drawn rather than a flash of the till. An effect
    would paint the wrong screen first, and would fight the cashier every time
    they pressed the back arrow.
  */
  const [lastLookupParam, setLastLookupParam] = useState(openLookup);
  if (openLookup !== lastLookupParam) {
    setLastLookupParam(openLookup);
    /* Only ever OPENS. Losing the param — which is what the back arrow out of
       the lookup does — must not slam the screen back to the till under them. */
    if (openLookup) setView("lookup");
  }
  const [intent, setIntent] = useState<Intent | null>(null);

  /*
    ── THE SALE, RESOLVED BUT NOT YET DONE ─────────────────────────────────

    A scan on the amount screen no longer credits. It identifies, and then this
    holds who it found until somebody says yes.

    The old flow spent a whole screen on identification — key the amount, press
    Créditer, arrive somewhere new, scan, and the points were gone the instant
    the camera decoded, with no moment in between. That is a sale committed by a
    reflex of the lens rather than a decision of the cashier, and the only thing
    standing between a customer's card drifting into frame and a real credit was
    that the camera had not been switched on yet.

    So the camera is on from the start — there is nothing to press to reach it —
    and the pause moved to the end, where it is worth something: the amount, the
    points, and WHO, on one card, with a yes and a no. A cashier reads that in
    the second they were already spending on pressing Créditer.
  */
  const [pending, setPending] = useState<
    NonNullable<ResolveState["customer"]> | null
  >(null);

  /** How many stamps ride along with this act. 0 = a plain sale. */
  const [stamps, setStamps] = useState(0);

  /*
    THE PROGRAMME, AS OF THE LAST TIME WE ASKED.

    Seeded from the server render, then corrected by every resolve. A counter
    phone sits on this screen all day: if the owner switches the stamp card off
    from another device, the props here are simply out of date, and the till
    went on offering a stepper for an act the server would refuse — with the
    refusal arriving AFTER the cashier had confirmed, in front of the customer.
  */
  const [liveStamps, setLiveStamps] = useState(stampsEnabled);

  /*
    What happened, held until somebody says OK.

    Deliberately not a timed flash: a confirmation that removes itself while the
    cashier is counting out change is a confirmation they never received.
  */
  const [result, setResult] = useState<
    { ok: boolean; title: string; detail?: string; earned?: number; stampsAdded?: number; balance?: number } | null
  >(null);
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
  /** Back to the counter with nothing half-typed left behind. */
  function home() {
    setIntent(null);
    setAmount("");
    setStamps(0);
    setCustomer(null);
    setPending(null);
    setVoucher(null);
    go("till");
  }

  /**
   * The act, said once, and used everywhere it has to be said: under the lens,
   * on the confirmation, and in the refusal when there is nothing to give.
   */
  const givingLine = [
    valid ? `${fmtDinars(n)} DT · +${fmtPoints(earned)} points` : null,
    stamps > 0 ? `${stamps} tampon${stamps > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /** What the pending act is, in the words the cashier used to choose it. */

  /** Hand the keyed amount to the second step. */
  /**
   * A card was read (or a code typed) while an amount was on screen.
   *
   * Identifies only. It resolves the customer, mints the key for THIS sale, and
   * hands both to the confirmation — which is the thing that credits.
   */
  function offer(raw: string) {
    const code = extractCode(raw);
    if (!code || sending.current || pending) return;

    /*
      The amount is the gate, not a button. The lens runs from the moment the
      screen opens — a cashier should never have to arm a camera — so a card
      that drifts into frame before anything is keyed has to be refused, and
      refused in words, or it reads as a camera that does not work.
    */
    /*
      ── ONE CAMERA, BOTH KINDS OF CODE ────────────────────────────────────

      A voucher used to be refused here and the cashier sent to a second screen
      with a second camera — for a code the first camera had just read
      perfectly well. The two are already told apart by their shape (isVoucher,
      which is careful never to claim an 8-digit phone), so the machine can do
      the routing the human was being asked to do.

      A reward needs no amount, which is why this test comes before the amount
      gate: somebody holding up a free coffee is not a sale in progress.
    */
    if (isVoucher(code)) {
      setError("");
      start(async () => {
        const fd = new FormData();
        fd.set("code", code.toUpperCase());
        const res = await peekAction({}, fd);
        if (res.error || !res.peek) {
          setError(res.error ?? "Code introuvable.");
          setScanNonce((k) => k + 1);
          return;
        }
        setVoucher({ code: code.toUpperCase(), n: 0, peek: res.peek, error: "" });
      });
      return;
    }

    /* From here it is a customer, so there has to be something to give them. */
    if (!valid && stamps === 0) {
      setError(
        amount.trim() === ""
          ? "Entrez un montant ou un tampon, puis pointez la carte."
          : "Montant invalide — de 0,01 à 10 000 DT.",
      );
      return;
    }
    if (amount.trim() !== "" && !valid) {
      setError("Montant invalide — de 0,01 à 10 000 DT.");
      return;
    }

    setError("");
    start(async () => {
      const res = await resolveCustomerAction(code);
      if (res.error || !res.customer) {
        setError(res.error ?? "Client introuvable — vérifiez le code.");
        return;
      }
      /* Minted HERE, with the customer: this pairing is the act. A retry of the
         same confirmation carries it; cancelling and scanning somebody else
         mints a new one (0049). */
      /*
        CORRECT THE SCREEN BEFORE ASKING THE CASHIER TO COMMIT.

        The resolve carries the programme as it is right now. If the stamp card
        has been switched off since this screen loaded, the stepper was offering
        something the server will refuse — so it is dropped HERE, with a word,
        rather than after a confirmation the cashier gave in front of a
        customer. Same for a paused programme.
      */
      const live = res.program;
      if (live) {
        setLiveStamps(live.stampsEnabled);
        if (stamps > 0 && !live.stampsEnabled) {
          setStamps(0);
          setError("La carte à tampons vient d'être désactivée — les tampons ont été retirés.");
          setScanNonce((k) => k + 1);
          if (!valid) return;
        }
        if (valid && !live.active) {
          setError("Programme de fidélité désactivé.");
          setScanNonce((k) => k + 1);
          return;
        }
      }

      setIntent({ kind: "credit", amount: n, key: newOpKey() });
      setPending(res.customer);
      setTyped("");
    });
  }

  /**
   * The yes. One act, points and stamps together (giveAction).
   *
   * Everything it can say is said in two lines, because a counter has a queue.
   * The one thing it says at length is a FAILURE: "impossible" tells a cashier
   * nothing about whether to try again, and the two reasons behave completely
   * differently — a phone that has lost its signal wants the same tap in a
   * moment, a refusal from the shop's own settings never will.
   */
  function commit(ref: string) {
    if (sending.current) return;
    sending.current = true;
    setError("");
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("customer", ref);
        if (valid) fd.set("amount", String(n));
        if (stamps > 0) fd.set("stamps", String(stamps));
        if (intent) fd.set("opKey", intent.key);

        const res = await giveAction({}, fd);

        if (res.error || !res.ok) {
          setResult({
            ok: false,
            title: "Rien n'a été donné",
            detail:
              res.error ??
              "Le serveur n'a pas répondu. Rien n'a été enregistré — réessayez.",
          });
          return;
        }

        const g = res.ok;
        const bits = [
          g.points ? `+${fmtPoints(g.points.earned)} points` : null,
          g.points && g.points.welcome > 0
            ? `+${fmtPoints(g.points.welcome)} de bienvenue`
            : null,
          g.stamps ? `${g.stamps.added} tampon${g.stamps.added > 1 ? "s" : ""}` : null,
        ].filter(Boolean);

        setResult({
          ok: true,
          earned: g.points?.earned ?? 0,
          stampsAdded: g.stamps?.added ?? 0,
          balance: g.points?.balance ?? g.who.balance,
          title: `${g.who.label} · ${bits.join(" · ")}`,
          detail:
            g.partial ??
            [
              /* On EVERY receipt, including a stamp-only one. "Et mes points ?"
                 is asked at the counter whatever was just given, and making the
                 cashier open a fiche to answer it is the slow way. */
              `Solde ${fmtPoints(g.points?.balance ?? g.who.balance)}`,
              /*
                THE ONE LINE WORTH THE SPACE ON A WALK-IN.

                Everything else here was cut for being noise at a counter, and
                this survived the cut because it is the only thing on the screen
                a cashier can ACT on: the customer is still standing there, and
                "pas encore inscrit" is the moment their card gets created. The
                receipt that said it before also said the balance before, the
                balance after, what was unlocked and how far the next reward
                was — which is why nobody read the one line that mattered.
              */
              g.who.known ? null : "Pas encore inscrit — proposez-lui sa carte",
              /* A FILLED CARD IS SERVED NOW, so the code goes on the screen.
                 The customer's own phone shows it too, but the cashier is
                 holding the reward — making them wait for somebody to unlock a
                 phone is the slowest possible way to hand over a free coffee. */
              g.stamps
                ? g.stamps.completed
                  ? `Carte pleine${g.stamps.code ? ` — code ${g.stamps.code}` : ""}`
                  : `${g.stamps.count} / ${g.stamps.required} tampons`
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
        });

        /* The act is spent. Clear it so the next customer starts from zero
           rather than inheriting the last one's amount. */
        setPending(null);
        setIntent(null);
        setAmount("");
        setStamps(0);
        setTyped("");
        setScanNonce((k) => k + 1);
        router.refresh();
      } catch {
        /*
          The app never heard back. This is the shape a lost connection takes,
          and it is NOT the same as a refusal — the write may well have landed,
          so the honest thing is to say both halves of that rather than invite a
          retry that could double it.
        */
        setResult({
          ok: false,
          title: "Pas de réponse",
          detail:
            "Vérifiez la connexion, puis regardez la fiche du client avant de refaire — l'opération est peut-être passée.",
        });
      } finally {
        sending.current = false;
      }
    });
  }

  /** Back to the keypad with nothing spent. */
  function cancelOffer() {
    setPending(null);
    setIntent(null);
    setError("");
    /* Remount the lens: it stopped itself on the read that opened the dialog. */
    setScanNonce((k) => k + 1);
  }

  /* ── undo ─────────────────────────────────────────────────────────── */


  /* ── the act, applied to whoever this code turns out to be ────────── */

  

  /** Hand the reward over. The only thing that spends a voucher. */
  function collectVoucher() {
    if (!voucher?.peek) return;
    const label = voucher.peek.label;
    start(async () => {
      const fd = new FormData();
      fd.set("code", voucher.code);
      const res = await collectAction({}, fd);
      setVoucher(null);
      setScanNonce((k) => k + 1);
      if (res.error) {
        setResult({ ok: false, title: "Rien n'a été remis", detail: res.error });
        return;
      }
      setResult({ ok: true, title: `${label} — remis`, detail: "Bonne dégustation." });
      router.refresh();
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
      {view === "till" && (
        /*
          ── EVERYTHING ON ONE SCREEN, AND NOTHING TO SCROLL ────────────────

          This was two journeys. An amount, a "Créditer" button, a second screen
          to identify on — and, for a stamp, a THIRD path: its own button, its
          own identify screen, its own camera. A shop that runs both handed one
          customer two scans for one purchase and asked the cashier to remember
          the second.

          One screen now: what is being given at the top, who it is for
          underneath, and the camera live between them from the moment it opens.

          THE STAMP IS NOT A LESSER THING. It was a line at the bottom under an
          "ou", which said it was the alternative to a sale. For a shop that
          runs a stamp card it is the sale — so it sits in the same card as the
          amount, with a counter of its own, and both can go in one act.
        */
        <Step
          title="Caisse"
          hint={
            liveStamps
              ? `${pointsPerTnd} point par dinar · tampons · récompenses`
              : `${pointsPerTnd} point par dinar · récompenses`
          }
        >
          <div className="a-card p-3">
            <input
              name="amount"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError("");
              }}
              placeholder="0"
              /* inputMode="none": the keypad below is the only way in. As a
                 decimal input this raised the phone's own keyboard over the top
                 of the pad drawn for it. */
              inputMode="none"
              aria-label="Montant en dinars"
              className="w-full rounded-xl bg-[var(--o-inset)] px-4 py-1.5 text-center text-[26px] font-extrabold leading-none tabular-nums text-charcoal outline-none placeholder:text-slate"
            />
            <p
              className={`mt-1 text-center text-[12px] font-semibold ${
                amount.trim() !== "" && !valid ? "text-[#e5484d]" : "text-slate"
              }`}
            >
              {amount.trim() === ""
                ? "Montant en dinars"
                : !valid
                  ? "Montant invalide — de 0,01 à 10 000 DT"
                  : `${fmtDinars(n)} dinars · +${fmtPoints(earned)} points` +
                    (multiplier > 1 ? ` · ×${multiplier}` : "")}
            </p>

            <div className="mt-2">
              <Keypad
                onKey={(k) => {
                  setError("");
                  if (k === "⌫") return setAmount(amount.slice(0, -1));
                  if (k === "," && /[.,]/.test(amount)) return;
                  if (amount.replace(/[.,]/, "").length >= 7) return;
                  setAmount(amount + k);
                }}
              />
            </div>

            {liveStamps && (
              /*
                MORE THAN ONE, because a customer who buys two coffees has
                earned two. The old button could only ever add one, so the
                cashier scanned the same card twice — which is two entries in
                the journal for one purchase, and two chances to scan the wrong
                person on the second go.
              */
              <div className="mt-2 flex items-center gap-3 rounded-xl bg-[var(--o-inset)] px-3 py-2">
                <span className="min-w-0 flex-1 text-[13.5px] font-bold text-charcoal">
                  Tampons
                </span>
                <button
                  type="button"
                  aria-label="Un tampon de moins"
                  onClick={() => {
                    setError("");
                    setStamps((s) => Math.max(0, s - 1));
                  }}
                  disabled={stamps === 0}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--o-panel)] text-[20px] font-bold text-charcoal active:scale-95 disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-6 shrink-0 text-center text-[17px] font-extrabold tabular-nums text-charcoal">
                  {stamps}
                </span>
                <button
                  type="button"
                  aria-label="Un tampon de plus"
                  onClick={() => {
                    setError("");
                    setStamps((s) => Math.min(10, s + 1));
                  }}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--o-panel)] text-[20px] font-bold text-charcoal active:scale-95"
                >
                  +
                </button>
              </div>
            )}
          </div>

          {/* the camera, already open — nothing to arm */}
          {!lensDown && !pending && !result && !voucher && (
            <div className="mt-2.5">
              <Lens
                compact
                nonce={scanNonce}
                busy={busy}
                label={givingLine ? `Pointez — ${givingLine}` : "Pointez la carte ou le code cadeau"}
                onRead={(text) => {
                  setScanNonce((k) => k + 1);
                  offer(text);
                }}
                onUnavailable={() => setLensDown(true)}
              />
            </div>
          )}

          <div className="a-card mt-2.5 p-2.5">
            <div className="flex gap-2">
              <input
                name="customer"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && offer(typed)}
                placeholder="Code client, numéro, ou code cadeau"
                inputMode="text"
                autoCapitalize="characters"
                className="min-w-0 flex-1 rounded-xl bg-[var(--o-inset)] px-3 py-2.5 text-center text-[16px] font-extrabold tracking-[0.05em] text-charcoal outline-none placeholder:text-[13px] placeholder:font-semibold placeholder:tracking-normal placeholder:text-slate"
              />
              {/*
                NOT DISABLED WHEN THE FIELD IS EMPTY.

                It was, and a disabled button here is a button nobody can see:
                on a white card the faded state reads as decoration, so the one
                control on this row disappeared exactly when a cashier was
                looking for it. It is solid at all times and answers in words
                instead — "entrez d'abord le montant" is information; a greyed
                rectangle is a puzzle.
              */}
              <button
                type="button"
                onClick={() => {
                  if (!typed.trim()) return setError("Scannez la carte, ou tapez le code du client.");
                  offer(typed);
                }}
                disabled={busy}
                className="a-btn !w-auto shrink-0 px-5"
              >
                {busy ? "· · ·" : "Donner"}
              </button>
            </div>
          </div>
          {errorLine}

          {/*
            ── A REWARD READ BY THE SAME CAMERA ──────────────────────────────

            Same shape as the sale's confirmation, because it is the same
            moment: something is about to be handed over and somebody has to
            say yes. What it needs to show is different — a voucher has no
            amount and no balance, only what it is and whether it can still be
            served.
          */}
          {voucher?.peek && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Récompense"
              className="d-veil fixed inset-0 z-50 flex items-center justify-center bg-[#14101f]/55 px-4 backdrop-blur-sm"
              onClick={() => !busy && (setVoucher(null), setScanNonce((k) => k + 1))}
            >
              <div
                className="d-pop a-card w-full max-w-[360px] px-5 py-6 text-center"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate">
                  {voucher.peek.kind === "stamp" ? "Carte pleine" : "Récompense"}
                </p>
                <p className="mt-1.5 text-[20px] font-extrabold leading-tight text-charcoal">
                  {voucher.peek.label}
                </p>
                <p className="k-num mt-0.5 text-[12.5px] text-slate">{voucher.code}</p>

                {voucher.peek.status === "valid" ? (
                  <div className="mt-4 grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setVoucher(null);
                        setScanNonce((k) => k + 1);
                      }}
                      disabled={busy}
                      className="a-btn a-btn--ghost !min-h-[52px]"
                    >
                      Non
                    </button>
                    <button
                      type="button"
                      onClick={collectVoucher}
                      disabled={busy}
                      className="a-btn !min-h-[52px]"
                    >
                      {busy ? "· · ·" : "Remettre"}
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Already served, or expired. Say which — "invalide" sends
                        a cashier looking for a fault that is not there. */}
                    <p className="mt-3 text-[13.5px] font-bold text-[#e5484d]">
                      {voucher.peek.status === "claimed"
                        ? "Déjà remise."
                        : "Ce code n'est plus valable."}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setVoucher(null);
                        setScanNonce((k) => k + 1);
                      }}
                      className="a-btn mt-4 !min-h-[52px]"
                    >
                      OK
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── the yes, and what it is agreeing to ──────────────────────── */}
          {pending && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Confirmer"
              /* CENTRED, not a bottom sheet. It is a question, and a question
                 belongs where the eyes already are — a sheet clinging to the
                 bottom edge reads as a notification that arrived, rather than
                 as something waiting for an answer. */
              className="d-veil fixed inset-0 z-50 flex items-center justify-center bg-[#14101f]/55 px-4 backdrop-blur-sm"
              onClick={() => !busy && cancelOffer()}
            >
              <div
                className="d-pop a-card w-full max-w-[360px] px-5 py-6 text-center"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[20px] font-extrabold leading-tight text-charcoal">
                  {pending.name ?? pending.code ?? "Client"}
                </p>
                {/* THE CODE, because this is the second in which a wrong card is
                    caught. The receipt used to carry it — but the receipt comes
                    after the points are gone, and this comes before. */}
                {pending.code && (
                  <p className="k-num mt-0.5 text-[12.5px] text-slate">
                    {pending.code}
                    {pending.enrolled ? " · Client de la maison" : ""}
                  </p>
                )}
                <p className="mt-2 text-[16px] font-extrabold text-charcoal">{givingLine}</p>
                {n > 0 && (
                  <p className="mt-0.5 text-[12.5px] font-semibold text-slate">
                    Solde {fmtPoints(pending.balance)} → {fmtPoints(pending.balance + earned)}
                  </p>
                )}
                {!pending.enrolled && (
                  <p className="mt-1.5 text-[12px] font-semibold text-[#8a5a00]">
                    Première visite ici.
                  </p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={cancelOffer}
                    disabled={busy}
                    className="a-btn a-btn--ghost !min-h-[52px]"
                  >
                    Non
                  </button>
                  <button
                    type="button"
                    onClick={() => commit(pending.ref)}
                    disabled={busy}
                    className="a-btn !min-h-[52px]"
                  >
                    {busy ? "· · ·" : "Oui"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/*
            ── WHAT HAPPENED, IN ONE LINE, AND IT WAITS ────────────────────

            The receipt this replaces was a full sheet — the customer's name, the
            balance before, the balance after, what they had just unlocked, how
            far the next reward was, and an undo — and it took itself off the
            screen after four seconds. A cashier with a queue read none of it.

            There are two things worth knowing at a counter: did it go through,
            and if not, why. So that is what this says. It does NOT disappear on
            its own: a confirmation that vanishes while you are handing over
            change is a confirmation you did not get.

            No undo. That was here because a scan used to credit the instant the
            lens decoded, with nothing in between — the undo was the only pause
            in the whole flow. The pause moved to the confirmation above, which
            carries the customer's name; a second one afterwards is the kind
            cashiers learn to tap through.
          */}
          {result && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={result.ok ? "C'est donné" : "Rien n'a été donné"}
              className="d-veil fixed inset-0 z-50 flex items-center justify-center bg-[#14101f]/55 px-4 backdrop-blur-sm"
              onClick={() => setResult(null)}
            >
              <div
                /* Still the receipt, so everything that reads one still can —
                   it is simply two lines and a button now instead of a sheet. */
                data-receipt
                /* What it actually gave, for anything reading the receipt
                   rather than its prose. */
                data-earned={result.earned ?? undefined}
                data-stamps={result.stampsAdded ?? undefined}
                data-balance={result.balance ?? undefined}
                className="d-pop a-card w-full max-w-[360px] px-5 py-6 text-center"
                onClick={(e) => e.stopPropagation()}
              >
                <span
                  aria-hidden
                  className={`mx-auto grid h-12 w-12 place-items-center rounded-full text-[26px] ${
                    result.ok ? "bg-[#2f9e6e]/14 text-[#2f9e6e]" : "bg-[#e5484d]/12 text-[#e5484d]"
                  }`}
                >
                  {result.ok ? "✓" : "✕"}
                </span>
                <p className="mt-2.5 text-[17px] font-extrabold leading-tight text-charcoal">
                  {result.title}
                </p>
                {result.detail && (
                  <p className="mt-1.5 text-[13px] font-semibold leading-snug text-slate">
                    {result.detail}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="a-btn mt-4 !min-h-[52px]"
                >
                  OK
                </button>
              </div>
            </div>
          )}
        </Step>
      )}

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
      if (res.ok) {
        setDone(res.ok);
        /*
          CLEAR THE VOUCHER THE MOMENT IT IS COLLECTED.

          The code stayed on screen after being served, with its QR and its
          "Récupérer" button, describing a voucher that no longer exists. The
          next customer walked up to somebody else's reward still showing — and
          the button under it now refuses, which reads as a broken till rather
          than as a code already spent.

          onReset remounts the panel empty, so the screen goes back to asking
          for a code while the receipt is still being read over the top of it.
        */
        onReset();
      }
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
