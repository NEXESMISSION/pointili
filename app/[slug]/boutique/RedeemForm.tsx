"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import type { Reward } from "@/lib/types";
import { redeemAction, type RedeemState } from "./actions";

/**
 * One reward, buyable as many times as the diner can afford. A reward NEVER
 * disappears after a purchase — it stays in the list; the button just becomes
 * "Échanger encore". Each buy debits points and issues its own counter code, so
 * a diner can stack several codes. After each buy we refresh so the header
 * balance and every reward's affordability update to the new total.
 */
export function RedeemForm({
  slug,
  reward,
  affordable,
  missing,
}: {
  slug: string;
  reward: Reward;
  affordable: boolean;
  missing: number;
}) {
  const router = useRouter();
  const action = redeemAction.bind(null, slug);
  const [state, formAction, pending] = useActionState<RedeemState, FormData>(action, {});

  // A successful buy changed the balance — re-fetch so the rest of the shop
  // (header total, other rewards' affordability) reflects it.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      {state.ok && (
        <div className="rounded-xl bg-white px-3 py-1.5 text-center">
          <p className="text-[8.5px] font-bold uppercase tracking-[0.08em] text-slate">Code · comptoir</p>
          <p className="font-mono text-[15px] font-bold tracking-[0.16em] text-charcoal">{state.ok.code}</p>
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-right text-[10px] font-semibold text-[#ff9a9a]">
          {state.error}
        </p>
      )}

      {affordable ? (
        <form action={formAction}>
          <input type="hidden" name="rewardId" value={reward.id} />
          <button
            type="submit"
            disabled={pending}
            onClick={(e) => {
              if (!confirm(`Échanger ${reward.pointsCost} points contre « ${reward.label} » ?`)) {
                e.preventDefault();
              }
            }}
            className="rounded-xl bg-white px-3.5 py-2 text-[10.5px] font-bold text-charcoal active:scale-95 disabled:opacity-60"
          >
            {pending ? "· · ·" : state.ok ? "Échanger encore" : "Échanger"}
          </button>
        </form>
      ) : (
        <span className="whitespace-nowrap font-mono text-[11px] text-white/55">encore {missing}</span>
      )}
    </div>
  );
}
