"use client";

import { useRouter } from "next/navigation";
import { signalNavigation } from "@/components/RouteProgress";

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
  exact = false,
}: {
  fallback: string;
  label?: string;
  className?: string;
  /**
   * Always go to `fallback`, never to whatever the browser remembers.
   *
   * For most screens "back" means back — you return to the scroll position you
   * left. But two screens have ONE right parent whatever route you arrived by:
   * the profile belongs above the shop (its way out is the wallet), and the
   * big-code screen is only reachable from the profile. Popping history there
   * lands people somewhere that merely happens to be behind them.
   */
  exact?: boolean;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        if (!exact && typeof window !== "undefined" && window.history.length > 1) router.back();
        else { signalNavigation(); router.push(fallback); }
      }}
      className={`-ml-1.5 grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate transition hover:bg-[var(--track)] active:scale-[0.95] ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        /* An arrow is a picture of a direction, and dir="rtl" does not turn
           pictures round — this one kept pointing at the left edge on the
           Tunisian side, where "back" is to the right. */
        className="h-5 w-5 rtl:-scale-x-100"
        aria-hidden
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>
  );
}
