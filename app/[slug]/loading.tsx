/**
 * Instant skeleton for the diner app.
 *
 * The pages read live data from Zurich, so a navigation used to sit blank until
 * the round-trip returned — which reads as "slow / frozen". This renders the
 * moment you tap, so the app always feels responsive; the real content swaps in
 * when it arrives.
 */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4 px-5 pt-6">
      <div className="h-14 rounded-2xl bg-white/10" />
      <div className="h-52 rounded-3xl bg-white/10" />
      <div className="h-16 rounded-2xl bg-white/[0.07]" />
      <div className="h-16 rounded-2xl bg-white/[0.07]" />
    </div>
  );
}
