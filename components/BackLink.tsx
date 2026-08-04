"use client";

import { useRouter } from "next/navigation";

/**
 * The way out of a sub-screen.
 *
 * Only /cartes ever had one. Everywhere else — the rewards list, the history, the
 * codes, the QR kit — the way back was the browser's own button, and INSTALLED TO
 * A HOME SCREEN THERE IS NO BROWSER BUTTON. A customer who tapped "Offres" in a
 * standalone window had exactly one exit: the bottom tab bar, which does not
 * appear on every screen. On the owner side there is not even that on a laptop.
 *
 * router.back() FIRST, `fallback` second, and the order matters. Going back is
 * what the person means — it returns them to the scroll position and the state
 * they left. But a screen opened directly (a shared link, a QR, a fresh PWA
 * launch) has no history to pop, and back() would either do nothing or throw
 * them out of the app entirely. `window.history.length <= 1` is the honest test
 * for "we are the first page in this tab".
 */
export function BackLink({
  /** Where to go when there is no history to return to. */
  fallback,
  label = "Retour",
  className = "",
}: {
  fallback: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className={`-ml-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate transition hover:bg-[#eceaf1] active:scale-[0.95] ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>
  );
}
