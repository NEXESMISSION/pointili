"use client";

import { useActionState, useState } from "react";
import { METHODS, OFFERS, PLACEHOLDER, tnd, type MethodId, type OfferId } from "@/lib/billing";
import { submitRenewalAction, type RenewState } from "./actions";

/**
 * One screen, four decisions, in the order an owner makes them: how long, how
 * they pay, where they send it, what the receipt looks like.
 *
 * NOT A WIZARD. Three steps behind Next buttons would hide the total from the
 * screen where they choose the method, and hide the account number from the
 * screen where they upload the proof — which is exactly when they want to check
 * it again. Everything stays visible; the page is short enough.
 */
export function RenewForm() {
  const [chosen, setChosen] = useState<OfferId>("12m");
  const [how, setHow] = useState<MethodId>("d17");
  const [proof, setProof] = useState<string | null>(null);
  const [imgErr, setImgErr] = useState("");
  const [state, action, pending] = useActionState<RenewState, FormData>(
    submitRenewalAction,
    {},
  );

  const total = OFFERS.find((o) => o.id === chosen)!.price;
  const detail = METHODS.find((m) => m.id === how)!;

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgErr("");
    try {
      setProof(await shrinkReceipt(file));
    } catch {
      setImgErr("Impossible de lire cette image.");
    }
  }

  if (state.ok) {
    return (
      <section className="a-card p-5 text-center">
        <p className="text-[28px]">✓</p>
        <p className="mt-1 text-[16px] font-extrabold text-charcoal">{state.ok}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-slate">
          Vous pouvez fermer cette page — on vous prolonge sans rien vous demander
          de plus.
        </p>
      </section>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {/* ── 1 · how long ─────────────────────────────────────────────── */}
      <section className="a-card p-4">
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate">
          Votre formule
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {OFFERS.map((o) => {
            const on = o.id === chosen;
            return (
              <label
                key={o.id}
                className={`cursor-pointer rounded-2xl px-3 py-3 text-center transition ${
                  on
                    ? "bg-[#5b3fd1]/12 ring-2 ring-[#5b3fd1]"
                    : "bg-[var(--o-inset)] ring-1 ring-transparent"
                }`}
              >
                <input
                  type="radio"
                  name="offer"
                  value={o.id}
                  checked={on}
                  onChange={() => setChosen(o.id)}
                  className="sr-only"
                />
                <span className={`block text-[12px] font-semibold ${on ? "text-[#5b3fd1]" : "text-slate"}`}>
                  {o.label}
                  {o.best ? " · le plus choisi" : ""}
                </span>
                <span className="mt-0.5 block font-display text-[24px] font-extrabold leading-none text-charcoal">
                  {o.price} <span className="text-[12px] font-bold text-slate">TND</span>
                </span>
                <span className="mt-0.5 block text-[10px] text-slate">{o.perMonth}</span>
              </label>
            );
          })}
        </div>

        {/* the one number they are about to transfer, said once, plainly */}
        <div className="mt-3 flex items-baseline justify-between border-t border-[var(--o-edge)] pt-3">
          <span className="text-[13px] font-semibold text-slate">Total à payer</span>
          <span className="font-display text-[26px] font-extrabold leading-none text-charcoal">
            {tnd(total)}
          </span>
        </div>
      </section>

      {/* ── 2 · how they pay ─────────────────────────────────────────── */}
      <section className="a-card p-4">
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate">
          Comment payez-vous ?
        </p>
        <div className="grid grid-cols-3 gap-2">
          {METHODS.map((m) => {
            const on = m.id === how;
            return (
              <label
                key={m.id}
                className={`cursor-pointer rounded-xl px-2 py-2.5 text-center text-[12.5px] font-bold transition ${
                  on ? "bg-[#5b3fd1] text-white" : "bg-[var(--o-inset)] text-slate"
                }`}
              >
                <input
                  type="radio"
                  name="method"
                  value={m.id}
                  checked={on}
                  onChange={() => setHow(m.id)}
                  className="sr-only"
                />
                {m.label}
              </label>
            );
          })}
        </div>

        <p className="mt-3 text-[12.5px] leading-relaxed text-slate">{detail.how}</p>

        {/*
          ── THE COORDINATES ───────────────────────────────────────────
          While lib/billing says PLACEHOLDER, this block is built to be
          impossible to mistake for a real account: a warning above it, a
          hatched panel, "EXEMPLE" beside every value, and no copy button —
          a copy button is an instruction, and the instruction here is DO NOT
          PAY. Setting PLACEHOLDER to false removes all four at once.
        */}
        {PLACEHOLDER && (
          <p className="mt-3 rounded-2xl bg-[#e5484d]/10 px-3.5 py-3 text-[12.5px] font-semibold leading-relaxed text-[#e5484d]">
            ⚠ Coordonnées de démonstration — ne faites aucun virement. Les vraies
            coordonnées seront affichées ici avant l&apos;ouverture des paiements.
          </p>
        )}

        <dl
          className={`mt-2 space-y-2 rounded-2xl px-3.5 py-3 ${
            PLACEHOLDER ? "bg-[repeating-linear-gradient(135deg,var(--o-inset),var(--o-inset)10px,transparent_10px,transparent_20px)] ring-1 ring-dashed ring-[var(--o-edge)]" : "bg-[var(--o-inset)]"
          }`}
        >
          {detail.lines.map((l) => (
            <div key={l.label} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-[11.5px] font-semibold text-slate">{l.label}</dt>
              <dd className="min-w-0 text-right">
                <span
                  className={`break-all font-mono text-[13px] font-bold ${
                    PLACEHOLDER ? "text-slate line-through decoration-[#e5484d]/50" : "text-charcoal"
                  }`}
                >
                  {l.value}
                </span>
                {PLACEHOLDER && (
                  <span className="ml-2 inline-block rounded-full bg-[#e5484d]/12 px-2 py-0.5 align-middle text-[9.5px] font-bold uppercase tracking-wider text-[#e5484d]">
                    exemple
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── 3 · the receipt ──────────────────────────────────────────── */}
      <section className="a-card p-4">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate">
          Preuve de paiement
        </p>
        <p className="mb-2.5 text-[12.5px] leading-relaxed text-slate">
          La capture d&apos;écran du transfert, ou la photo du reçu. C&apos;est ce
          que nous regardons pour vous prolonger.
        </p>

        <input type="hidden" name="proof" value={proof ?? ""} />

        {proof ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- owner-picked, a data URI */}
            <img
              src={proof}
              alt="Votre reçu"
              className="max-h-[280px] w-full rounded-2xl object-contain ring-1 ring-[var(--o-edge)]"
            />
            <button
              type="button"
              onClick={() => setProof(null)}
              className="w-full rounded-2xl border border-[var(--o-edge)] py-2.5 text-[12.5px] font-bold text-slate"
            >
              Choisir une autre image
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-[var(--o-edge)] bg-[var(--o-inset)] px-4 py-7 text-center">
            <span className="text-[22px]">🧾</span>
            <span className="text-[13.5px] font-bold text-charcoal">
              Ajouter la photo du reçu
            </span>
            <span className="text-[11.5px] text-slate">JPG ou PNG · depuis la galerie</span>
            <input type="file" accept="image/*" onChange={pick} className="sr-only" />
          </label>
        )}
        {imgErr && <p className="mt-2 text-[12px] font-semibold text-[#e5484d]">{imgErr}</p>}

        <label className="mt-3 block">
          <span className="text-[11.5px] font-semibold text-slate">
            Une précision ? (optionnel)
          </span>
          <input
            name="note"
            maxLength={300}
            placeholder="Référence du virement, nom sur le compte…"
            className="mt-1 w-full rounded-2xl bg-[var(--o-inset)] px-3.5 py-3 text-[14px] text-charcoal outline-none placeholder:text-slate"
          />
        </label>
      </section>

      {state.error && (
        <p
          role="alert"
          className="rounded-2xl bg-[#e5484d]/12 px-4 py-3 text-[13px] font-semibold text-[#e5484d]"
        >
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending || !proof} className="a-btn !min-h-[52px]">
        {pending ? "Envoi…" : `Envoyer ma demande · ${tnd(total)}`}
      </button>
      <p className="px-1 pb-2 text-center text-[11.5px] leading-relaxed text-slate">
        Rien n&apos;est prélevé ici. Nous vérifions le paiement, puis votre
        abonnement est prolongé de {OFFERS.find((o) => o.id === chosen)!.label.toLowerCase()}.
      </p>
    </form>
  );
}

/**
 * A receipt is a photograph of a phone screen, which is 3–6 MB and 3000px wide
 * for a document somebody will glance at once. Downscale to 1200px WebP in the
 * browser: ~80 KB, still readable enough to check an amount and a date, and
 * small enough to live in a row (0035 refuses anything over ~500 KB).
 */
async function shrinkReceipt(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const MAX = 1200;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  let uri = canvas.toDataURL("image/webp", 0.82);
  if (!uri.startsWith("data:image/webp")) uri = canvas.toDataURL("image/jpeg", 0.85);
  return uri;
}
