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

export function CreateCafeForm() {
  const [state, formAction, pending] = useActionState<CreateState, FormData>(
    createCafeAction,
    {},
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  // The slug follows the name until the owner takes control of it.
  const effective = preview(slug || name);

  return (
    <form action={formAction} className="space-y-3">
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
        <span className="mt-1.5 block text-[11.5px] leading-snug text-white/50">
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
          className={`${field} font-mono !text-[14px]`}
        />
        <span className="mt-1.5 block break-all font-mono text-[11px] text-white/50">
          pointili.online/
          <b className="text-[#b9a3ff]">{effective || "…"}</b>
        </span>
        <span className="mt-1 block text-[11.5px] leading-snug text-white/50">
          C&apos;est ce que vos clients ouvrent en scannant. Laissez vide pour
          reprendre le nom.
        </span>
      </label>

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
