"use client";

import Link from "next/link";

/**
 * The branded fallback for a caught render error.
 *
 * Every segment that reads Supabase can throw on a transient DB/network blip.
 * Without a boundary that lands here, the diner or owner sees Next's raw error
 * screen — at the till, mid-service. This gives them a calm message and a way
 * back: retry first (most blips are momentary), then a safe destination.
 */
export function ErrorScreen({
  title,
  message,
  reset,
  homeHref,
  homeLabel,
  retryLabel,
  tone = "light",
}: {
  title: string;
  message: string;
  reset?: () => void;
  homeHref?: string;
  homeLabel?: string;
  /**
   * The retry button's wording. Optional and French by default: the owner app
   * and the console are French-only, so only the diner boundary passes it.
   */
  retryLabel?: string;
  /**
   * "dark" for the diner app, whose shell is a deep-purple gradient — the light
   * palette rendered charcoal-on-purple there, i.e. barely readable.
   */
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <div className="grid min-h-[70dvh] place-items-center px-6 text-center">
      <div className="w-full max-w-sm">
        <span
          aria-hidden
          className={`mx-auto grid h-12 w-12 place-items-center rounded-2xl text-[22px] font-black ${
            dark ? "bg-white/15 text-white" : "bg-lilac text-royal"
          }`}
        >
          !
        </span>
        <h1 className={`mt-4 text-[21px] font-extrabold ${dark ? "text-white" : "text-charcoal"}`}>
          {title}
        </h1>
        <p
          className={`mx-auto mt-2 max-w-[32ch] text-[14px] leading-relaxed ${
            dark ? "text-white/70" : "text-slate"
          }`}
        >
          {message}
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          {reset && (
            <button
              type="button"
              onClick={reset}
              className={`w-full rounded-2xl py-3.5 text-[14.5px] font-bold active:scale-[0.99] ${
                dark ? "bg-white text-charcoal" : "bg-royal text-white"
              }`}
            >
              {retryLabel ?? "Réessayer"}
            </button>
          )}
          {homeHref && (
            <Link
              href={homeHref}
              className={`w-full rounded-2xl border py-3.5 text-[14px] font-bold active:scale-[0.99] ${
                dark
                  ? "border-white/25 text-white/85"
                  : "border-hair bg-white text-charcoal"
              }`}
            >
              {homeLabel ?? "Retour"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
