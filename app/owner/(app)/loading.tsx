/** Instant skeleton for the owner app — see app/[slug]/loading.tsx. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-40 rounded-lg bg-white" />
      <div className="h-32 rounded-2xl bg-white" />
      <div className="h-32 rounded-2xl bg-white" />
    </div>
  );
}
