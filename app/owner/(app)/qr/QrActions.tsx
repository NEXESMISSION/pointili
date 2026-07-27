"use client";

import { useState } from "react";

/**
 * What an owner actually does with their QR: print it for the table, download
 * it to send to a printer or drop in a story, share it, and check what a
 * customer sees. Download is the one that was missing — most owners want the
 * PNG for a poster or for WhatsApp, not a browser print dialog.
 */
export function QrActions({ url, svg, name }: { url: string; svg: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the link is printed on the card anyway */
    }
  };

  /** Rasterise the QR SVG to a big PNG so it stays sharp on a printed poster. */
  const download = async () => {
    setSaving(true);
    try {
      const SIZE = 1200;
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const src = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((ok, ko) => {
        img.onload = () => ok();
        img.onerror = () => ko(new Error("img"));
        img.src = src;
      });
      const c = document.createElement("canvas");
      c.width = c.height = SIZE;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, SIZE, SIZE);
      const pad = SIZE * 0.08;
      ctx.drawImage(img, pad, pad, SIZE - pad * 2, SIZE - pad * 2);
      URL.revokeObjectURL(src);

      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = `qr-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`;
      a.click();
    } catch {
      /* fall back to printing */
      window.print();
    } finally {
      setSaving(false);
    }
  };

  const share = async () => {
    const data = { title: name, text: `Ma carte de fidélité ${name}`, url };
    try {
      if (navigator.share) await navigator.share(data);
      else await copy();
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="space-y-2.5 print:hidden">
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => window.print()} className="a-btn !text-[13.5px]">
          Imprimer
        </button>
        <button
          type="button"
          onClick={download}
          disabled={saving}
          className="a-btn a-btn--ghost !text-[13.5px]"
        >
          {saving ? "· · ·" : "Télécharger"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={share} className="a-btn a-btn--ghost !text-[13px]">
          Partager
        </button>
        <button type="button" onClick={copy} className="a-btn a-btn--ghost !text-[13px]">
          {copied ? "Copié ✓" : "Copier le lien"}
        </button>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block py-1 text-center text-[12.5px] font-bold text-[#b9a3ff] underline underline-offset-2"
      >
        Voir ce que voit un client →
      </a>
    </div>
  );
}
