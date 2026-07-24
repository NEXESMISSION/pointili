/**
 * Instant, quiet loader for the diner app.
 *
 * A single centred spinner rather than pulsing skeleton blocks — the skeletons
 * read as broken layout for the split second they show. This just says "loading"
 * and gets out of the way when the real content arrives.
 */
export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-28">
      <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/20 border-t-white" />
    </div>
  );
}
