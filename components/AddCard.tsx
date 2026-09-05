"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrScanner } from "@/components/QrScanner";
import { translator, type Lang } from "@/lib/dict";
import { slugFrom } from "@/lib/qrLink";

/**
 * ADD A CARD BY POINTING AT THE SHOP'S QR.
 *
 * The wallet's empty state has always said "scanne le QR d'un commerce pour
 * ajouter ta première carte" — and then offered no way to scan anything. The
 * customer had to leave the app, find the phone's own camera, and point it at a
 * sticker they were already standing in front of. Every card after the first one
 * has the same problem, on the one screen that exists to collect them.
 *
 * What a scan is allowed to MEAN lives in lib/qrLink, on its own, because those
 * parsing rules are a security boundary: the text a camera read is never
 * followed, only mined for a slug that this component turns into a path on our
 * own origin.
 */
export function AddCard({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  /* Bumped to remount the reader: QrScanner stops its stream once it decodes,
     so a refused code has to restart it or the viewfinder freezes. */
  const [nonce, setNonce] = useState(0);

  const read = (text: string) => {
    const slug = slugFrom(text);
    if (!slug) {
      setNonce((n) => n + 1);
      setError(t("Ce QR n'est pas une carte Pointili."));
      return;
    }
    setOpen(false);
    router.push(`/${slug}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setNonce((n) => n + 1);
          setOpen(true);
        }}
        className="d-card flex w-full items-center justify-center gap-2.5 py-3.5 text-[14.5px] font-bold text-charcoal transition active:scale-[0.99]"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <path d="M14 17.5h7M17.5 14v7" />
        </svg>
        {t("Ajouter une carte")}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Ajouter une carte")}
          onClick={() => setOpen(false)}
          className="ticket-veil fixed inset-0 z-50 flex overflow-y-auto px-5 py-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ticket-sheet m-auto w-full max-w-[360px] overflow-hidden rounded-[26px] bg-white p-4 shadow-[0_30px_80px_-30px_rgba(23,18,31,.5)]"
          >
            <p className="text-center text-[17px] font-extrabold text-charcoal">
              {t("Ajouter une carte")}
            </p>
            <p className="mx-auto mt-1 max-w-[26ch] text-center text-[12.5px] leading-snug text-slate">
              {t("Pointe le QR posé au comptoir.")}
            </p>

            <div className="mt-3 overflow-hidden rounded-2xl">
              <QrScanner
                key={nonce}
                lang={lang}
                onScan={read}
                /* Fires only for a device with no lens now — a blocked or busy
                   camera says so inside the viewfinder, with the button that
                   fixes it. Repeating that here would be two messages for one
                   problem, and the wrong one would be the louder. */
                onUnavailable={() => setError(t("Pas de caméra sur cet appareil."))}
              />
            </div>

            {error && (
              <p role="alert" className="mt-3 rounded-2xl bg-[#e5484d]/12 px-4 py-2.5 text-center text-[12.5px] font-semibold text-[#e5484d]">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-3 w-full py-2.5 text-center text-[13px] font-bold text-slate"
            >
              {t("Fermer")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
