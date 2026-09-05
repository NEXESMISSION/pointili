"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { GiftIcon } from "@/components/icons";
import type { Reward } from "@/lib/types";
import { redeemAction, type RedeemState } from "./actions";
import { translator, type Lang, type T } from "@/lib/dict";
import { fmtPoints } from "@/lib/points";

/*
  Pick a reward, then take the code.

  The old page put an "Échanger" button on every row, so the screen offered as
  many decisions as there were rewards and the outcome — a six-character code
  you have to show a cashier — was a chip the size of a price tag.

  This is one decision and one outcome. You select a reward (the row itself is
  the control), a single button commits it, and the code then takes over the
  screen, because reading it out at a counter is the whole point of the
  transaction and it is on a clock.

  A reward is NEVER used up: it stays selectable and can be bought again, since
  each purchase debits its own points and issues its own code.
*/

export function RewardPicker({
  slug,
  rewards,
  balance,
  lang = "fr",
}: {
  slug: string;
  rewards: Reward[];
  balance: number;
  /** The reader's language — a translator cannot cross the server boundary. */
  lang?: Lang;
}) {
  const t = translator(lang);
  const router = useRouter();
  const action = redeemAction.bind(null, slug);
  const [state, formAction, pending] = useActionState<RedeemState, FormData>(action, {});
  const [refreshing, startRefresh] = useTransition();

  /*
    Preselect the CHEAPEST reward they can afford, not the dearest.

    A default that spends as much as possible is a default that spends the
    diner's points for them. `rewards` arrives sorted by cost, so the first
    affordable one is the cautious choice — and it is the answer to the question
    the screen actually raises, "what can I have right now?".
  */
  const [picked, setPicked] = useState<string | null>(
    rewards.find((r) => balance >= r.pointsCost)?.id ?? null,
  );

  /*
    NOTHING IS SPENT WITHOUT A SECOND TAP.

    Échanger debited the balance on one press. Points are a month of coffees and
    the transaction has no undo on the customer's side — the code is minted, the
    points are gone, and if they picked the wrong row they find out on the next
    screen. The confirmation names the reward, the cost and what is left after,
    which is the arithmetic somebody would otherwise be doing in their head at
    a counter.
  */
  const [confirming, setConfirming] = useState(false);

  /* The issued code must OUTLIVE the next run of useActionState, which replaces
     its whole value — a later rejection would otherwise erase a code the diner
     genuinely paid for. */
  const [issued, setIssued] = useState<{ code: string; label: string; qr: string } | null>(null);
  useEffect(() => {
    if (!state.ok) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIssued({ code: state.ok.code, label: state.ok.label, qr: state.ok.qr });
    /*
      AND CLOSE THE QUESTION. It is answered.

      The submit button cannot close it (removing itself mid-click cancels the
      submit — see below), so the success has to. Without this, "Échanger autre
      chose" came back to the list with the previous purchase's confirmation
      still open over it, swallowing every tap on the reward rows.
    */
    setConfirming(false);
  }, [state.ok]);

  /*
    ── THE COUNTER TOOK IT: STEP OUT OF THE WAY ────────────────────────────

    This screen is one instruction — "fais scanner ça" — and the moment it has
    been scanned the instruction is spent. It used to stay up regardless, so the
    customer was left holding a code that no longer existed, reading a sentence
    telling them to do a thing that had already happened.

    A beat first, not a slam: LivePoints raises its celebration over the top of
    this, and a screen that vanishes in the same frame reads as a glitch rather
    than as the reward being handed over. Same 700ms the ticket sheet uses.
  */
  useEffect(() => {
    if (!issued) return;
    const onCollected = (e: Event) => {
      const code = (e as CustomEvent<{ code?: string }>).detail?.code;
      if (code && code !== issued.code) return;
      setTimeout(() => setIssued(null), 700);
    };
    window.addEventListener("pointili:collected", onCollected);
    return () => window.removeEventListener("pointili:collected", onCollected);
  }, [issued]);

  // A buy changed the balance — re-read so every row's affordability is honest.
  useEffect(() => {
    if (state.ok) startRefresh(() => router.refresh());
  }, [state.ok, router]);

  const busy = pending || refreshing;
  const chosen = rewards.find((r) => r.id === picked) ?? null;
  const canBuy = Boolean(chosen) && balance >= (chosen?.pointsCost ?? Infinity);

  if (issued) {
    return <CodeReveal issued={issued} onAgain={() => setIssued(null)} t={t} />;
  }

  return (
    /* data-redeem so a suite can name THIS form. The store page grew a second
       one (WheelPlayer) and `form button[type="submit"]` silently started
       matching the spin button instead of the redeem button. */
    <form action={formAction} data-redeem>
      <input type="hidden" name="rewardId" value={picked ?? ""} />

      <ul className="space-y-2.5">
        {rewards.map((r) => {
          const affordable = balance >= r.pointsCost;
          const on = r.id === picked;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setPicked(r.id)}
                aria-pressed={on}
                className="d-card flex w-full items-center gap-3.5 px-3.5 py-3 text-left transition active:scale-[0.99]"
                /* Selection is the shop's colour, not a fixed purple — this row
                   is the one control on the screen and it has to belong to the
                   same card the customer just came from. */
                style={
                  on
                    ? {
                        borderColor: "var(--cafe)",
                        background: "var(--cafe-soft)",
                        boxShadow: "0 0 0 1px var(--cafe)",
                      }
                    : undefined
                }
              >
                {/*
                  A photograph fills the plate; the tint is what a shop without
                  one gets. White when the row is selected, because the selected
                  row is painted in that same tint and a tinted plate on a tinted
                  row is no plate at all — the icon floated with nothing under it.
                */}
                <span
                  className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl"
                  style={{
                    background: on ? "#fff" : "var(--cafe-soft)",
                    color: "var(--cafe-text)",
                  }}
                >
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
                    <img src={r.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <GiftIcon className="h-6 w-6" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-charcoal">
                    {t(r.label)}
                  </span>
                  <span
                    className="mt-0.5 block text-[13px] font-extrabold"
                    style={{ color: affordable ? "var(--cafe-text)" : "var(--muted)" }}
                  >
                    {t.n(r.pointsCost, "point")}
                  </span>
                  {!affordable && (
                    <>
                      <span className="mt-1.5 block h-[4px] w-full overflow-hidden rounded-full bg-[var(--track)]">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.min(100, Math.round((balance / r.pointsCost) * 100))}%`,
                            background: "var(--cafe)",
                          }}
                        />
                      </span>
                      <span className="mt-1 block text-[11px] text-slate">
                        {t("Encore {n}", { n: t.n(r.pointsCost - balance, "point") })}
                      </span>
                    </>
                  )}
                </span>

                {/* the selection dot, mirroring the mockup */}
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition"
                  style={
                    on
                      ? { borderColor: "var(--cafe)", background: "var(--cafe)", color: "var(--cafe-ink)" }
                      : { borderColor: "var(--line-strong)" }
                  }
                >
                  {on && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden>
                      <path d="m5 12.5 4.5 4.5L19 7" />
                    </svg>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {state.error && (
        <p
          role="alert"
          className="mt-4 rounded-2xl border border-seal/25 bg-seal-soft px-4 py-3 text-[13px] font-semibold text-seal"
        >
          {state.error}
        </p>
      )}

      {/* type=button: it opens the question, it does not submit the form */}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={busy || !canBuy}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-[14.5px] font-bold transition active:scale-[0.98] disabled:opacity-40"
        style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
      >
        {busy
          ? "· · ·"
          : !chosen
            ? t("Choisis une récompense")
            : canBuy
              ? t("Échanger {n}", { n: t.n(chosen.pointsCost, "point") })
              : t("Encore {n}", { n: t.n(chosen.pointsCost - balance, "point") })}
      </button>

      {confirming && chosen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Confirmer l'échange")}
          className="d-veil fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-3 pb-3 backdrop-blur-sm lg:items-center lg:pb-3"
          onClick={() => !busy && setConfirming(false)}
        >
          {/* Rises on a phone, appears on a laptop — see .d-sheet. This is the
              screen where weeks of points get spent; it should not arrive
              between two frames like an error. */}
          <div
            className="d-sheet d-card w-full max-w-[420px] px-5 py-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-slate">
              {t("Confirmer")}
            </p>
            <p className="mt-2 text-[19px] font-extrabold leading-snug text-charcoal">
              {t("Échanger {n} contre {reward} ?", {
                n: t.n(chosen.pointsCost, "point"),
                reward: t(chosen.label),
              })}
            </p>

            {/* the arithmetic, done for them */}
            {/*
              dir="ltr" IS LOAD-BEARING, not a leftover.

              Arithmetic is written left to right in Arabic exactly as it is in
              French — ١٠٠ − ٤٠ = ٦٠, never the mirror. Inside the RTL subtree
              this flex row reversed, and the sum read "نقطة 60 = 40 − 100":
              the answer first and the operators pointing the wrong way, on the
              one screen where a customer is checking that the shop is about to
              take the right number of points off them.
            */}
            <div
              dir="ltr"
              className="mt-4 flex items-center justify-center gap-2 rounded-2xl px-4 py-3"
              style={{ background: "var(--cafe-soft)" }}
            >
              <span className="text-[13px] font-semibold text-slate">
                {fmtPoints(balance)}
              </span>
              <span className="text-[13px] text-slate">−</span>
              <span className="text-[13px] font-semibold text-slate">
                {chosen.pointsCost}
              </span>
              <span className="text-[13px] text-slate">=</span>
              <span
                className="text-[17px] font-extrabold"
                style={{ color: "var(--cafe-text)" }}
              >
                {t.n(balance - chosen.pointsCost, "point")}
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-snug text-slate">
              {t("Les points sont débités tout de suite. Le code, lui, n'expire jamais.")}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="d-card min-h-[50px] text-[14px] font-bold text-charcoal active:scale-[0.99]"
              >
                {t("Annuler")}
              </button>
              {/*
                NO onClick THAT CLOSES THIS DIALOG.

                It had one, and it swallowed the purchase: setConfirming(false)
                unmounts the button inside its own click handler, and a submit
                button removed from the DOM mid-click never submits its form.
                The screen simply went back to the list and nothing was bought.
                The dialog does not need closing — a successful redeem replaces
                the whole picker with the code.
              */}
              <button
                type="submit"
                disabled={busy}
                className="min-h-[50px] rounded-2xl text-[14px] font-extrabold transition active:scale-[0.98] disabled:opacity-50"
                style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
              >
                {busy ? "· · ·" : t("Oui, échanger")}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

/* ── the code, once it exists ─────────────────────────────────────────── */

function CodeReveal({
  issued,
  onAgain,
  t,
}: {
  issued: { code: string; label: string; qr: string };
  onAgain: () => void;
  t: T;
}) {
  /*
    The code the diner just paid for goes ON SCREEN, not somewhere below it.

    This panel replaces the picker in place — and when the shop runs the wheel,
    the picker starts a wheel's height down the page, so the reward you have
    just bought can open entirely below the fold. Mounting is the only moment
    this is needed, hence the empty deps.
  */
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({
      block: "center",
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, []);

  return (
    <div ref={ref} className="text-center">
      <p className="inline-flex items-center gap-2 rounded-full bg-ok/10 px-3.5 py-1.5 text-[12.5px] font-bold text-ok">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
          <path d="m5 12.5 4.5 4.5L19 7" />
        </svg>
        {t("Récompense réservée")}
      </p>

      <p className="mt-5 text-[14px] text-slate">{t("Fais scanner ça :")}</p>

      {/*
        THE PICTURE FIRST, THE CHARACTERS UNDER IT.

        This panel used to be six glowing characters and nothing else, because
        reading them aloud was the only way to spend the code. It is not any
        more — the till has a camera pointed at this exact screen — and a
        counter goes faster when nobody has to spell "B, not 8" over a grinder.

        The QR keeps its own white plate even here: the page is white already,
        but the plate is what guarantees the quiet zone around the modules that
        decoders need, and this is the one screen where a failed read costs a
        queue.
      */}
      <div
        className="mt-3 rounded-3xl px-4 py-5"
        style={{ background: "var(--cafe-soft)", border: "1px solid var(--cafe-line)" }}
      >
        <div className="mx-auto w-[168px] rounded-2xl bg-white p-3.5">
          <div
            className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: issued.qr }}
          />
        </div>
        {/* Still large: the fallback for a lens that will not focus, and the
            thing a cashier types when the shop's phone is in a pocket. */}
        {/* dir=ltr: the code is a Latin-and-digits string read out loud at a
            counter. Left in the RTL flow its characters keep their order but
            the trailing punctuation and the tracking flip, and a cashier
            comparing it to their own screen should never have to wonder. */}
        <p
          dir="ltr"
          className="mt-4 font-mono text-[30px] font-extrabold leading-none tracking-[0.18em]"
          style={{ color: "var(--cafe-text)" }}
        >
          {issued.code}
        </p>
      </div>

      <p className="mt-3 text-[14px] font-bold text-charcoal">{t(issued.label)}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-slate">
        {t("Le serveur scanne le QR — ou tape le code.")}
      </p>
      {/* The clock belongs HERE, where the points were actually spent. */}
      <p className="mt-1.5 text-[12.5px] font-bold text-gold-deep">
        {t("Pas de date limite")}
      </p>

      <button
        type="button"
        onClick={onAgain}
        className="d-card mt-6 w-full py-3.5 text-[14px] font-bold text-charcoal active:scale-[0.99]"
      >
        {t("Échanger autre chose")}
      </button>
    </div>
  );
}
