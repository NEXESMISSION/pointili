"use client";

import { useActionState } from "react";
import type { Reward } from "@/lib/types";
import { redeemAction, type RedeemState } from "./actions";

/**
 * One form per reward. A confirm step is deliberate: redeeming spends points the
 * diner worked for and can't be undone from the app.
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
  const action = redeemAction.bind(null, slug);
  const [state, formAction, pending] = useActionState<RedeemState, FormData>(
    action,
    {},
  );

  if (state.ok) {
    return (
      <div className="rounded-xl border border-gold/50 bg-gold-soft/60 px-3 py-2 text-center">
        <p className="ticket-label">Code</p>
        <p className="font-mono text-[16px] font-bold tracking-[0.18em] text-ink">
          {state.ok.code}
        </p>
      </div>
    );
  }

  if (!affordable) {
    return (
      <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-mut">
        encore {missing}
      </span>
    );
  }

  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="rewardId" value={reward.id} />
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (
            !confirm(
              `Échanger ${reward.pointsCost} points contre « ${reward.label} » ?`,
            )
          ) {
            e.preventDefault();
          }
        }}
        className="rounded-xl bg-brand px-3.5 py-2 text-[10.5px] font-bold text-white active:scale-95 disabled:opacity-60"
      >
        {pending ? "· · ·" : "Échanger"}
      </button>
      {state.error && (
        <p role="alert" className="mt-1 text-right text-[10px] font-semibold text-seal">
          {state.error}
        </p>
      )}
    </form>
  );
}
