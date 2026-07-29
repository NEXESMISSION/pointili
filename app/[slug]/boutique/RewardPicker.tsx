"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { GiftIcon } from "@/components/icons";
import type { Reward } from "@/lib/types";
import { redeemAction, type RedeemState } from "./actions";

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
}: {
  slug: string;
  rewards: Reward[];
  balance: number;
}) {
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

  /* The issued code must OUTLIVE the next run of useActionState, which replaces
     its whole value — a later rejection would otherwise erase a code the diner
     genuinely paid for. */
  const [issued, setIssued] = useState<{ code: string; label: string; expiryHours: number } | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.ok) setIssued({ code: state.ok.code, label: state.ok.label, expiryHours: state.ok.expiryHours });
  }, [state.ok]);

  // A buy changed the balance — re-read so every row's affordability is honest.
  useEffect(() => {
    if (state.ok) startRefresh(() => router.refresh());
  }, [state.ok, router]);

  const busy = pending || refreshing;
  const chosen = rewards.find((r) => r.id === picked) ?? null;
  const canBuy = Boolean(chosen) && balance >= (chosen?.pointsCost ?? Infinity);

  if (issued) {
    return <CodeReveal issued={issued} onAgain={() => setIssued(null)} />;
  }

  return (
    <form action={formAction}>
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
                className={`flex w-full items-center gap-3.5 rounded-2xl border px-3.5 py-3 text-left transition active:scale-[0.99] ${
                  on
                    ? "border-[#8b6bff] bg-[#6d4ae6]/18 shadow-[0_0_0_1px_rgba(139,107,255,.5)]"
                    : "border-white/12 bg-white/[0.05]"
                }`}
              >
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
                  <img src={r.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white/10">
                    <GiftIcon className="h-6 w-6 text-white/80" />
                  </span>
                )}

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-white">{r.label}</span>
                  <span
                    className={`mt-0.5 block text-[13px] font-extrabold ${
                      affordable ? "text-[#b9a3ff]" : "text-white/45"
                    }`}
                  >
                    {r.pointsCost} points
                  </span>
                  {!affordable && (
                    <>
                      <span className="mt-1.5 block h-[4px] w-full overflow-hidden rounded-full bg-white/12">
                        <span
                          className="block h-full rounded-full bg-[#8b6bff]/70"
                          style={{ width: `${Math.min(100, Math.round((balance / r.pointsCost) * 100))}%` }}
                        />
                      </span>
                      <span className="mt-1 block text-[11px] text-white/40">
                        Encore {r.pointsCost - balance} points
                      </span>
                    </>
                  )}
                </span>

                {/* the selection dot, mirroring the mockup */}
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${
                    on ? "border-[#8b6bff] bg-[#6d4ae6]" : "border-white/25"
                  }`}
                >
                  {on && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden>
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
          className="mt-4 rounded-2xl border border-[#ff6b6b]/35 bg-[#ff6b6b]/12 px-4 py-3 text-[13px] font-semibold text-[#ff9a9a]"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !canBuy}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6d4ae6] py-4 text-[15.5px] font-bold text-white shadow-[0_16px_36px_-14px_rgba(109,74,230,.9)] transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
      >
        {busy
          ? "· · ·"
          : !chosen
            ? "Choisis une récompense"
            : canBuy
              ? `Échanger ${chosen.pointsCost} points`
              : `Encore ${chosen.pointsCost - balance} points`}
      </button>
    </form>
  );
}

/* ── the code, once it exists ─────────────────────────────────────────── */

function CodeReveal({
  issued,
  onAgain,
}: {
  issued: { code: string; label: string; expiryHours: number };
  onAgain: () => void;
}) {
  return (
    <div className="text-center">
      <p className="inline-flex items-center gap-2 rounded-full bg-[#7ff0b0]/12 px-3.5 py-1.5 text-[12.5px] font-bold text-[#7ff0b0]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
          <path d="m5 12.5 4.5 4.5L19 7" />
        </svg>
        Récompense réservée
      </p>

      <p className="mt-5 text-[14px] text-white/60">Voici ton code :</p>

      {/*
        Deliberately the largest thing on the screen. This is read aloud across a
        counter, often in a queue, sometimes by someone holding a coffee — the
        old version printed it at 15px in a chip.
      */}
      <div className="mt-3 rounded-2xl border-2 border-[#8b6bff] bg-[#6d4ae6]/12 px-4 py-6 shadow-[0_0_28px_-6px_rgba(139,107,255,.8),inset_0_0_22px_-10px_rgba(139,107,255,.9)]">
        <p className="font-mono text-[34px] font-bold leading-none tracking-[0.18em] text-white [text-shadow:0_0_18px_rgba(185,163,255,.9)]">
          {issued.code}
        </p>
      </div>

      <p className="mt-3 text-[15px] font-bold text-white">{issued.label}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-white/55">
        Montre-le au comptoir pour en profiter.
      </p>
      {/* The clock belongs HERE, where the points were actually spent. */}
      <p className="mt-1.5 text-[12.5px] font-bold text-[#ffd27a]">
        À utiliser sous {issued.expiryHours} h
      </p>

      <button
        type="button"
        onClick={onAgain}
        className="mt-6 w-full rounded-2xl border border-white/14 bg-white/[0.06] py-3.5 text-[14px] font-bold text-white active:scale-[0.99]"
      >
        Échanger autre chose
      </button>
    </div>
  );
}
