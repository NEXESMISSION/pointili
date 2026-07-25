"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
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
  const [refreshing, startRefresh] = useTransition();

  /*
    The last code this row issued, remembered OUTSIDE the action state.

    useActionState replaces its whole value on the next run, so a later rejection
    ("il te manque X points" after a stale affordability) used to erase a code the
    diner had genuinely earned. The code is theirs — it must survive. A ref, not
    state: state.ok changing already re-renders us, so this only has to remember.
  */
  const [lastCode, setLastCode] = useState<string | null>(null);
  useEffect(() => {
    /* Copying an async action result into state we own: the code must outlive
       the next run of useActionState, which replaces its whole value. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.ok) setLastCode(state.ok.code);
  }, [state.ok]);

  /*
    A successful buy changed the balance — re-fetch so the rest of the shop
    (header total, every reward's affordability) reflects it. The button stays
    disabled until it lands so this row can't act on a stale balance; the server
    re-checks atomically anyway, so other rows can only ever get a clear refusal.
  */
  useEffect(() => {
    if (state.ok) startRefresh(() => router.refresh());
  }, [state.ok, router]);

  const busy = pending || refreshing;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      {lastCode && (
        <div className="rounded-xl bg-white px-3 py-1.5 text-center">
          <p className="text-[8.5px] font-bold uppercase tracking-[0.08em] text-slate">Code · comptoir</p>
          <p className="font-mono text-[15px] font-bold tracking-[0.16em] text-charcoal">{lastCode}</p>
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-right text-[10px] font-semibold text-[#ff9a9a]">
          {state.error}
        </p>
      )}

      {affordable ? (
        /*
          One explicit click — no window.confirm().

          Browsers suppress repeated native dialogs, and a suppressed confirm()
          returns false, which silently killed the button on exactly the
          repeat-buy flow this component exists for. The cost is in the label
          instead, so the tap is unambiguous without a second step.
        */
        <form action={formAction}>
          <input type="hidden" name="rewardId" value={reward.id} />
          <button
            type="submit"
            disabled={busy}
            className="whitespace-nowrap rounded-xl bg-white px-3.5 py-2 text-[10.5px] font-bold text-charcoal active:scale-95 disabled:opacity-60"
          >
            {busy ? "· · ·" : `Échanger −${reward.pointsCost}`}
          </button>
        </form>
      ) : (
        <span className="whitespace-nowrap font-mono text-[11px] text-white/55">encore {missing}</span>
      )}
    </div>
  );
}
