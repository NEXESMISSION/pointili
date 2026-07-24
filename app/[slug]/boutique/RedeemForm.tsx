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
      <div className="shrink-0 rounded-xl bg-white px-3 py-2 text-center">
        <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate">Code</p>
        <p className="font-mono text-[15px] font-bold tracking-[0.16em] text-charcoal">
          {state.ok.code}
        </p>
      </div>
    );
  }

  if (!affordable) {
    return (
      <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-white/55">
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
        className="rounded-xl bg-white px-3.5 py-2 text-[10.5px] font-bold text-charcoal active:scale-95 disabled:opacity-60"
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
