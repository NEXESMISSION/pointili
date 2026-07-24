"use client";

import { useState } from "react";

/**
 * The three things an owner wants to do with their QR: print it, copy the link
 * (to put in a bio / WhatsApp), and see exactly what a customer sees.
 */
export function QrActions({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the link is visible on the card anyway */
    }
  };

  return (
    <div className="space-y-2.5 print:hidden">
      <button type="button" onClick={() => window.print()} className="o-btn">
        Imprimer le QR ✦
      </button>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={copy} className="o-btn o-btn--ghost !text-[13px]">
          {copied ? "Lien copié ✓" : "Copier le lien"}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="o-btn o-btn--ghost !text-[13px] text-center"
        >
          Voir comme un client
        </a>
      </div>
    </div>
  );
}
