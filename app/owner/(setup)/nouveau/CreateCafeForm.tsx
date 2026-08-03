"use client";

import { useActionState, useState } from "react";
import { BusinessTypePicker } from "@/components/BusinessTypePicker";
import { createCafeAction, type CreateState } from "./actions";

const field = "a-field";

/**
 * Mirrors slugify() in lib/db.ts — preview only; the server always re-derives it.
 * Keep the two in step, or the URL shown here won't be the URL created.
 */
function preview(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/**
 * Downscale a chosen image to a small square logo, as a data URI.
 *
 * Same approach as Réglages' LogoUploader, and for the same reason: the logo is
 * stored IN the row, so there is no storage bucket, no upload endpoint and no
 * second thing that can fail while someone is signing up. 256px is far more
 * than a 44px avatar needs and keeps the encoded string small.
 */
async function fileToLogoDataUri(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(256, side);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  // centre-crop to a square so a wide photo does not arrive squashed
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function CreateCafeForm() {
  const [state, formAction, pending] = useActionState<CreateState, FormData>(
    createCafeAction,
    {},
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [logoErr, setLogoErr] = useState<string | null>(null);

  // The slug follows the name until the owner takes control of it.
  const effective = preview(slug || name);

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so re-picking the same file fires onChange again
    if (!file) return;
    setLogoErr(null);
    try {
      setLogo(await fileToLogoDataUri(file));
    } catch {
      setLogoErr("Image illisible — essayez une autre.");
    }
  }

  return (
    <form action={formAction} className="space-y-3">
      {/* the logo travels with the create: the café does not exist yet, so there
          is nothing to attach it to afterwards */}
      <input type="hidden" name="logo" value={logo ?? ""} />

      {/*
        THE CARD, WHILE IT IS BEING MADE.

        Signup used to be three text fields and a button, and the first time an
        owner saw their own card was after it existed. Showing it here is not
        decoration — it is what makes "nom", "logo" and "type" read as parts of
        one object instead of three unrelated questions.
      */}
      <div className="mb-4 rounded-2xl border border-white/10 bg-gradient-to-br from-[#2a1263] to-[#150a33] p-4">
        <div className="flex items-center gap-3">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/12 text-[20px]"
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-full w-full object-cover" />
            ) : (
              "☕"
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-extrabold text-white">
              {name.trim() || "Votre commerce"}
            </span>
            <span className="block truncate text-[12px] text-white/55">
              {phone.trim() || "pointili.online/" + (effective || "…")}
            </span>
          </span>
        </div>
      </div>

      <label className="block">
        <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-white/45 mb-1.5">Nom du café</span>
        <input
          name="name"
          required
          autoFocus
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Chez Karim"
          className={field}
        />
      </label>

      <div>
        <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-white/45 mb-1.5">Type de commerce</span>
        <BusinessTypePicker defaultValue="cafe" />
        <span className="mt-1.5 block text-[12px] leading-snug text-white/50">
          Vos clients le verront sur leur carte pour la reconnaître.
        </span>
      </div>

      <label className="block">
        <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-white/45 mb-1.5">Adresse de votre carte</span>
        <input
          name="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder={preview(name) || "chez-karim"}
          maxLength={40}
          /* no shrinking below 16px: iOS zooms the page on any smaller field */
          className={`${field} font-mono`}
        />
        <span className="mt-1.5 block break-all font-mono text-[12px] text-white/50">
          pointili.online/
          <b className="text-[#b9a3ff]">{effective || "…"}</b>
        </span>
        <span className="mt-1 block text-[12px] leading-snug text-white/50">
          C&apos;est ce que vos clients ouvrent en scannant. Laissez vide pour
          reprendre le nom.
        </span>
      </label>

      {/* ── the two optional ones, plainly marked ─────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-white/45 mb-1.5">
            Logo <span className="text-white/30">· optionnel</span>
          </span>
          <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/20 px-3 py-3 text-[12px] font-semibold text-white/70 transition hover:border-white/35 hover:text-white">
            <input type="file" accept="image/*" onChange={pickLogo} className="hidden" />
            {logo ? "Changer le logo" : "Choisir une image"}
          </label>
          {logo && (
            <button
              type="button"
              onClick={() => setLogo(null)}
              className="mt-1.5 text-[12px] font-semibold text-white/45 hover:text-white/75"
            >
              Retirer
            </button>
          )}
          {logoErr && <p className="mt-1.5 text-[12px] text-[#ff9a9a]">{logoErr}</p>}
        </div>

        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-white/45 mb-1.5">
            Téléphone <span className="text-white/30">· optionnel</span>
          </span>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            maxLength={24}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="25 123 456"
            className={field}
          />
          <span className="mt-1.5 block text-[12px] leading-snug text-white/50">
            Affiché sur la carte de vos clients.
          </span>
        </label>
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-[#ff6b6b]/35 bg-[#ff6b6b]/12 px-3.5 py-2.5 text-[13px] font-semibold text-[#ff9a9a]"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="!mt-4 w-full rounded-xl bg-[#6d4ae6] py-4 text-[12px] font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
      >
        {pending ? "· · ·" : "Créer mon café ✦"}
      </button>
    </form>
  );
}
