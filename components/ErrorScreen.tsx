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
}: {
  title: string;
  message: string;
  reset?: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-6 text-center">
      <div className="w-full max-w-sm">
        <span
          aria-hidden
          className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-lilac text-[22px] font-black text-royal"
        >
          !
        </span>
        <h1 className="mt-4 text-[21px] font-extrabold text-charcoal">{title}</h1>
        <p className="mx-auto mt-2 max-w-[32ch] text-[14px] leading-relaxed text-slate">
          {message}
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          {reset && (
            <button
              type="button"
              onClick={reset}
              className="w-full rounded-2xl bg-royal py-3.5 text-[14.5px] font-bold text-white active:scale-[0.99]"
            >
              Réessayer
            </button>
          )}
          {homeHref && (
            <Link
              href={homeHref}
              className="w-full rounded-2xl border border-hair bg-white py-3.5 text-[14px] font-bold text-charcoal active:scale-[0.99]"
            >
              {homeLabel ?? "Retour"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
