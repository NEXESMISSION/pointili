"use client";

import { useState } from "react";

/*
  The QR page as a PRINT KIT.

  Before, there was exactly one thing to print — a table tent — and the buttons
  under it were guesses about what an owner wanted. But a shop needs different
  objects in different places: a card that stands on a table, an A5 for the
  window, a small square for the counter, an image for a story. Same code, four
  shapes.

  So: pick a format, see it AT ITS REAL PROPORTIONS, then print or download that
  exact thing. The preview is the artwork — no separate "and here's what it will
  look like". Sizing is in container units (cqw), so one layout is correct on a
  phone preview and on the printed page without a second set of styles.
*/

export type Format = "tent";

/**
 * Four objects, named by WHERE THEY GO and sized in centimetres a Tunisian print
 * shop quotes on.
 *
 * The hints are the important part. An owner does not know what A6 is; they know
 * they want something that stands on a table and something for the window. So
 * the label is the object, the hint is the place, and the size is spelled out
 * because that is what gets read down the phone to the printer.
 *
 * "Affiche 20×30" replaced an A5. A5 is 14.8×21 — fine on a counter, too small
 * on a wall across the room, and 20×30 is what the owner asked for and what
 * every print shop stocks as a standard cut.
 */
/*
  ONE format. There were four — Chevalet, Autocollant, Affiche, Story — as a
  four-tile picker above the artwork, and choosing between them was the first
  decision this screen asked of somebody who had come to print a sticker for
  their table. A café prints the table tent. The other three were options for a
  choice nobody had come to make.

  Kept as a one-entry list rather than inlined, so adding a size back is a line
  here and not a rewrite of everything that reads `fmt`.
*/
const FORMATS: {
  id: Format;
  label: string;
  hint: string;
  ratio: number;
  page: string | null;
  px: number;
}[] = [
  { id: "tent", label: "Chevalet", hint: "Table · 10×15", ratio: 3 / 4, page: "A6 portrait", px: 1240 },
];

export function PrintKit({
  url,
  svg,
  name,
  logoUrl,
  promise,
}: {
  url: string;
  svg: string;
  name: string;
  logoUrl: string | null;
  promise: string;
}) {
  const [saving, setSaving] = useState(false);
  const fmt = FORMATS[0];



  /**
   * Rasterise the artwork at the chosen ratio. Composed on a canvas rather than
   * exporting the QR alone: what an owner sends to a print shop — or posts as a
   * story — is the whole card, not a bare code.
   */
  const download = async () => {
    setSaving(true);
    try {
      const W = fmt.px;
      const H = Math.round(W / fmt.ratio);
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("canvas");

      ctx.fillStyle = "#140d24";
      ctx.fillRect(0, 0, W, H);

      const u = (n: number) => (n / 100) * W; // percentages of the width
      const centre = (text: string, y: number, px: number, weight = "800", colour = "#fff") => {
        ctx.fillStyle = colour;
        ctx.textAlign = "center";
        ctx.font = `${weight} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        ctx.fillText(text, W / 2, y);
      };

      // QR on white so it always scans, whatever the background is
      const qrSide = u(46);
      const qrTop = H * 0.4;
      const pad = qrSide * 0.09;
      ctx.fillStyle = "#fff";
      const box = qrSide + pad * 2;
      roundRect(ctx, (W - box) / 2, qrTop - pad, box, box, box * 0.06);
      ctx.fill();

      const img = new Image();
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const src = URL.createObjectURL(blob);
      await new Promise<void>((ok, ko) => {
        img.onload = () => ok();
        img.onerror = () => ko(new Error("img"));
        img.src = src;
      });
      ctx.drawImage(img, (W - qrSide) / 2, qrTop, qrSide, qrSide);
      URL.revokeObjectURL(src);

      centre(name, H * 0.14, u(6.5));
      centre("CARTE DE FIDÉLITÉ", H * 0.2, u(2.8), "700", "rgba(255,255,255,.55)");
      wrapped(ctx, promise, W / 2, H * 0.27, W * 0.8, u(6), u(7.2));
      centre("Scannez pour commencer", qrTop + qrSide + u(9), u(4));
      centre("Sans application · en 10 secondes", qrTop + qrSide + u(14), u(2.9), "600", "rgba(255,255,255,.6)");
      centre(url.replace(/^https?:\/\//, ""), H - u(6), u(2.6), "500", "rgba(255,255,255,.45)");

      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = `pointili-${fmt.id}-${slug(name)}.png`;
      a.click();
    } catch {
      window.print(); // last resort: the browser can still produce a PDF
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* the printed page follows the chosen format */}
      {fmt.page && (
        <style>{`@media print { @page { size: ${fmt.page}; margin: 0 } }`}</style>
      )}


      {/*
        The artwork, at its real proportions — this IS what prints.

        THE CONTAINER AND THE CARD MUST BE THE SAME BOX. Everything inside is
        sized in `cqw`, so whatever element carries `@container` decides the
        scale of the whole design, and the width cap has to live on that same
        element or the two disagree.

        Both ways of getting it wrong are already on the record here:

        1. Container on a full-width wrapper, cap on the card. `cqw` measured
           the owner's 680px column while the card was 380px, so the contents
           came out ~1.8× too large, overflowed, and `overflow-hidden` with
           `justify-center` sliced the top and bottom off symmetrically — the
           shop name and "Scannez pour commencer" gone, the QR surviving only
           because it sat in the middle. It looked right on a phone for the
           worst possible reason: there the wrapper is ~350px, under the cap,
           so the two widths coincided. And it was not just the preview —
           print measured 680px too, so an owner would have paid a print shop
           for a card with its head and feet cut off.

        2. Container on the card itself. Tempting, and wrong in a quieter way:
           an element cannot query its own size, so the card's OWN
           `px-[7cqw]/py-[6cqw]` fell back to the viewport. At 1440 that is
           100.8px of padding on a 380px card — the artwork stopped being
           clipped and became a stamp in the middle of an empty box.

        So: the cap and `@container` both sit on the wrapper, and the card is
        simply `w-full` inside it. At print the cap lifts, the wrapper becomes
        the page, and the same one layout fills it.
      */}
      <div className="@container mx-auto w-full max-w-[380px] print:max-w-none">
        <div
          style={{ aspectRatio: String(fmt.ratio) }}
          className="flex w-full flex-col items-center justify-center overflow-hidden rounded-3xl bg-[#140d24] px-[7cqw] py-[6cqw] text-center text-charcoal print:h-screen print:rounded-none"
        >
          <div className="flex items-center justify-center gap-[2.5cqw]">
            {/* Logo when the shop has one; NOTHING when it does not. The old
                fallback was the business-type emoji in a tile, which put a ✨
                on every sticker of every shop that skipped the logo step. An
                absent logo is not information a customer needs. */}
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
              <img src={logoUrl} alt="" className="h-[9cqw] w-[9cqw] rounded-[2.5cqw] object-cover" />
            )}
            <span className="text-[6cqw] font-extrabold leading-none">{name}</span>
          </div>

          <p className="mt-[6cqw] text-[2.8cqw] font-bold uppercase tracking-[0.14em] text-slate">
            Carte de fidélité
          </p>
          <p className="mt-[1.5cqw] max-w-[20ch] text-[6.4cqw] font-extrabold leading-tight">
            {promise}
          </p>

          {/* always on white — a code on a dark tile does not scan reliably */}
          <div
            className="mt-[6cqw] w-[48cqw] rounded-[3cqw] bg-white p-[2.5cqw]"
          >
            <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          </div>

          <p className="mt-[4cqw] text-[4cqw] font-bold">Scannez pour commencer</p>
          <p className="mt-[0.8cqw] text-[2.9cqw] text-slate">Sans application · en 10 secondes</p>
          <p className="mt-[4cqw] break-all font-mono text-[2.4cqw] tracking-[0.04em] text-slate">
            {url.replace(/^https?:\/\//, "")}
          </p>
        </div>
      </div>

      <div className="space-y-2.5 print:hidden">
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!fmt.page}
            className="a-btn !text-[13px]"
            title={fmt.page ? undefined : "Une story se télécharge, elle ne s'imprime pas"}
          >
            Imprimer
          </button>
          <button type="button" onClick={download} disabled={saving} className="a-btn a-btn--ghost !text-[13px]">
            {saving ? "· · ·" : "Télécharger"}
          </button>
        </div>
        {/*
          Partager, Copier le lien and "Voir ce que voit un client" all lived
          here too. The QR screen above this panel already carries the last two
          as its only two buttons, and Partager is the OS sheet that the browser
          offers anyway. What is left is the pair you cannot get anywhere else.
        */}
      </div>
    </>
  );
}

/* ── canvas helpers ───────────────────────────────────────────────────── */

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "qr";
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Centre-aligned word wrap — the promise is owner-written and can be long. */
function wrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  px: number,
  lineHeight: number,
) {
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = `800 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const words = text.split(" ");
  let line = "";
  let row = 0;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, cx, y + row * lineHeight);
      line = word;
      row++;
    } else {
      line = next;
    }
  }
  if (line) ctx.fillText(line, cx, y + row * lineHeight);
}
