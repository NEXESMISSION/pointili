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
      /* One column at every width. A 430px card in the middle of a laptop is
         the right amount of screen for one code and two things to do with it. */
      className="mx-auto w-full max-w-[400px]"
    >
      {/*
        ── ONE FRAME, NOT THREE ───────────────────────────────────────────────

        This was a bordered card, holding a purple radial glow, holding a white
        plate with a 60px purple drop shadow. Three nested surfaces to present a
        square of black and white — and the glow and the shadow were doing the
        same job twice, both there to stop a white slab reading as a broken
        image. One hairline border does that, costs nothing, and does not put a
        coloured haze around the one thing on this screen a camera has to read.

        The plate stays white with dark modules: that is the polarity every
        scanner is built for, and it is not a style choice.
      */}
      <div className="rounded-[26px] border border-[var(--o-edge)] bg-white p-4">
        <div className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full">
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      </div>

      {/*
        The address, plain. It is what an owner reads out over the phone and
        types into another device, so it stays — but it is a fact, not a
        paragraph, and it does not need a box of its own to be one.
      */}
      <p className="k-num mt-3 break-all px-1 text-center text-[12.5px] text-slate">{url}</p>

      <div className="mt-4 space-y-2.5">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          /* No shadow. A flat fill is already the loudest thing on a white
             page; the glow under it only made the edge look soft. */
          className="flex w-full items-center justify-center rounded-[20px] bg-[#5b3fd1] py-3.5 text-[15px] font-bold text-white transition active:scale-[0.99]"
        >
          Voir la carte client
        </a>

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
          className="flex w-full items-center justify-center rounded-[20px] border border-[var(--o-edge)] py-3.5 text-[15px] font-bold text-charcoal transition active:scale-[0.99]"
        >
          {/*
            The icons went with the boxes. "Copier le lien" and "Voir la carte
            client" are four words each and neither is ambiguous; a chain link
            and an arrow-out beside them were decoration on a screen whose whole
            job is to be scanned and left.

            The confirmation stays, because a copy that says nothing is a copy
            you do twice.
          */}
          {copied ? "Lien copié" : "Copier le lien"}
        </button>
      </div>
    </div>
  );
}
