"use client";

import { useActionState, useState } from "react";
import { createCafeAction, type CreateState } from "./actions";

const field =
  "w-full rounded-xl border border-line bg-white px-4 py-3.5 text-[16px] font-medium text-ink outline-none transition-colors placeholder:font-normal placeholder:text-slate/60 focus:border-royal focus:ring-2 focus:ring-royal/15";

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
        <span className="ticket-label mb-1 block">Nom du café</span>
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

      <label className="block">
        <span className="ticket-label mb-1 block">Adresse de votre carte</span>
        <input
          name="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder={preview(name) || "chez-karim"}
          maxLength={40}
          className={`${field} font-mono text-[14px]`}
        />
        <span className="mt-1.5 block break-all font-mono text-[11px] text-mut">
          pointili.online/
          <b className="text-brand">{effective || "…"}</b>
        </span>
        <span className="mt-1 block text-[11.5px] leading-snug text-mut">
          C&apos;est ce que vos clients ouvrent en scannant. Laissez vide pour
          reprendre le nom.
        </span>
      </label>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-seal/40 bg-seal-soft px-3.5 py-2.5 text-[13px] font-semibold text-seal"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="!mt-4 w-full rounded-xl bg-brand py-4 text-[12px] font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
      >
        {pending ? "· · ·" : "Créer mon café ✦"}
      </button>
    </form>
  );
}
