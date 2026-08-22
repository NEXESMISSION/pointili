"use client";

import { useState } from "react";

/**
 * Mon QR — the simplest version, kept simple on purpose.
 *
 * One code, two buttons. This page briefly became the printable sticker itself
 * (name, offer, address, all of it) and the owner sent it back: when you open
 * "Mon QR" you want the QR, not a poster.
 *
 * ── AND THE POSTER KIT IS GONE ────────────────────────────────────────────
 *
 * "Imprimer ou télécharger l'affiche" hid four generated objects — table tent,
 * A5, sticker, story — behind a row on the phone and opened them on a laptop.
 * The owner asked for it to go, and the shape of this screen was the argument:
 * every version of it has drifted back towards being a poster, and every time
 * the answer has been the same. A shop that wants a sign takes the link, or the
 * code, to whoever prints their menus.
 *
 * No logo badge and no ✨ up top either — the fallback emoji for an untyped
 * shop was a sparkle pretending to be branding.
 *
 * The glow is not decoration: it is what stops a white slab reading as a broken
 * image placeholder.
 *
 * ── IT IS A TAB, NOT A DETOUR ─────────────────────────────────────────────
 *
 * The BACK ARROW went when the QR got its own place in the navigation: it
 * pushed to /owner, which was right while this screen was only ever reached
 * from the till, but a back arrow on a top-level tab navigates to a SIBLING and
 * calls it a parent. The tab bar is the way out.
 */
export function QrScreen({
  url,
  svg,
}: {
  url: string;
  /** The QR as inline SVG — rendered server-side so there is no flash. */
  svg: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      data-owner-wide
      /* One column at every width now. The 12-column split existed to seat the
         print kit beside the code; with the kit gone, a 430px card in the middle
         of a laptop is the right amount of screen for one QR and two buttons. */
      className="mx-auto w-full max-w-[430px]"
    >
      {/* ── the code, which is the page ── */}
      <div className="rounded-[30px] border border-[var(--o-edge)] bg-[var(--o-inset)] px-5 py-5">
        <div className="relative mx-auto w-full max-w-[min(300px,46vh)]">
          <span
            aria-hidden
            className="absolute inset-[-9%] rounded-[36px]"
            style={{ background: "radial-gradient(closest-side, rgba(124,86,232,.85), transparent 78%)" }}
          />
          {/* White plate, dark modules — the polarity every scanner accepts. */}
          <div className="relative rounded-[26px] bg-white p-4 shadow-[0_20px_60px_-20px_rgba(124,86,232,.9)]">
            <div className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full">
              <div dangerouslySetInnerHTML={{ __html: svg }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── the two things you do with it ── */}
      <div className="mt-3 space-y-2.5">
        {/* The address, in full and selectable. It is what an owner reads out
            over the phone and types into another device, and the only place it
            appeared was inside the QR itself. */}
        <p className="k-num break-all rounded-[18px] border border-[var(--o-edge)] px-4 py-3 text-[13px] text-slate">
          {url}
        </p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(url).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              },
              () => {},
            );
          }}
          className="flex w-full items-center justify-center gap-2.5 rounded-[22px] border border-[var(--o-edge)] bg-[var(--o-inset)] py-3.5 text-[15px] font-bold text-charcoal transition active:scale-[0.99]"
        >
          {copied ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px] text-[#2f9e6e]">
                <path d="m5 13 4 4L19 7" />
              </svg>
              Lien copié
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="#5b3fd1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]">
                <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
                <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" />
              </svg>
              Copier le lien
            </>
          )}
        </button>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2.5 rounded-[22px] bg-[#5b3fd1] py-3.5 text-[15px] font-bold text-white shadow-[0_18px_40px_-16px_rgba(124,58,237,1)] transition active:scale-[0.99]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]">
            <path d="M15 3h6v6M10 14 21 3" />
            <path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
          </svg>
          Voir la carte client
        </a>

      </div>
    </div>
  );
}
