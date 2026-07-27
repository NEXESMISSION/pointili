/** Quiet loader for the owner app — one spinner, no skeleton blocks. */
export default function Loading() {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/12 border-t-royal" />
    </div>
  );
}
