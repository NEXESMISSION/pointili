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
    <form action={formAction} className="space-y-4">
      {/* the logo travels with the create: the café does not exist yet, so there
          is nothing to attach it to afterwards */}
      <input type="hidden" name="logo" value={logo ?? ""} />

      {/*
        THE CARD, WHILE IT IS BEING MADE.

        Signup used to be text fields and a button, and the first time an owner
        saw their own card was after it existed. Showing it here is not
        decoration — it is what makes "nom", "logo" and "type" read as parts of
        one object instead of three unrelated questions.

        The subtitle is the ADDRESS, always. It used to flip to the phone number
        the moment one was typed, so the same line meant two different things
        depending on a field further down the page.
      */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#2a1263] to-[#150a33] p-4">
        <div className="flex items-center gap-3">
          <label className="group relative grid h-14 w-14 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl bg-white/12 text-[22px]">
            <input type="file" accept="image/*" onChange={pickLogo} className="hidden" />
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-white/70">+</span>
            )}
            <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/45 text-[10px] font-bold uppercase tracking-[0.06em] text-white opacity-0 transition group-hover:opacity-100">
              logo
            </span>
          </label>
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-extrabold text-white">
              {name.trim() || "Votre commerce"}
            </span>
            <span className="block truncate font-mono text-[12px] text-white/50">
              pointili.online/{effective || "…"}
            </span>
          </span>
        </div>
      </div>

      {/*
        TWO QUESTIONS, NOT FIVE.

        This asked for a name, a type, a URL slug, a logo and a phone number
        before anything could be created — and the slug is the worst of them: a
        technical idea, in a monospace box, with two sentences explaining it, on
        the first screen a café owner ever sees. It is derived from the name and
        the server re-derives it anyway.

        So the form asks the two things it cannot guess, and everything
        optional or derivable folds away. The logo moved onto the card preview,
        where tapping the square that shows it is the obvious way to change it.
      */}
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-white">
          Le nom de votre commerce
        </span>
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
        <span className="mb-1.5 block text-[13px] font-semibold text-white">
          Ce que vous vendez
        </span>
        <BusinessTypePicker defaultValue="cafe" />
      </div>

      {/*
        <details>, so it costs no JavaScript and no state — and so the form is
        two fields tall until somebody asks for more.
      */}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 py-1.5 text-[13px] font-semibold text-white/50 transition hover:text-white/80 [&::-webkit-details-marker]:hidden">
          <span className="text-[15px] leading-none transition group-open:rotate-90">›</span>
          Adresse et téléphone
          <span className="text-white/30">· facultatif</span>
        </summary>

        <div className="mt-2 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-white">
              Adresse de la carte
            </span>
            <input
              name="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={preview(name) || "chez-karim"}
              maxLength={40}
              /* no shrinking below 16px: iOS zooms the page on any smaller field */
              className={`${field} font-mono`}
            />
            <span className="mt-1.5 block text-[12px] leading-snug text-white/45">
              Laissez vide pour reprendre le nom.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-white">
              Téléphone
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
            <span className="mt-1.5 block text-[12px] leading-snug text-white/45">
              Affiché sur la carte de vos clients.
            </span>
          </label>

          {logo && (
            <button
              type="button"
              onClick={() => setLogo(null)}
              className="text-[12.5px] font-semibold text-white/45 hover:text-white/75"
            >
              Retirer le logo
            </button>
          )}
        </div>
      </details>

      {logoErr && <p className="text-[12.5px] text-[#ff9a9a]">{logoErr}</p>}

      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-[#ff6b6b]/35 bg-[#ff6b6b]/12 px-3.5 py-2.5 text-[13px] font-semibold text-[#ff9a9a]"
        >
          {state.error}
        </p>
      )}

      {/* 16px, not 12: the primary action on the page was set smaller than the
          body text explaining the fields above it */}
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="!mt-5 w-full rounded-2xl bg-[#6d4ae6] py-4 text-[16px] font-bold text-white shadow-[0_16px_36px_-16px_rgba(109,74,230,1)] transition active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
      >
        {pending ? "· · ·" : "Créer ma carte"}
      </button>
    </form>
  );
}
