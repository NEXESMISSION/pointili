"use server";

import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/auth/owner";
import { BUSINESS_TYPES } from "@/lib/businessTypes";
import { createCafe, setBusinessType, setCafeIdentity, slugify } from "@/lib/db";

const TYPE_KEYS = new Set(BUSINESS_TYPES.map((t) => t.key));

export type CreateState = { error?: string };

/**
 * Create the owner's café (§12 phase 2).
 *
 * Everything is derived server-side from the session — the owner id is never in
 * the form, so nobody can create a café under someone else's account. The RPC
 * validates the slug (format, reserved words, uniqueness) and seeds a working
 * program + rewards + wheel in one transaction.
 */
export async function createCafeAction(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const owner = await currentOwner();
  if (!owner) redirect("/owner/login");

  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const rawSlug = String(formData.get("slug") ?? "").trim().toLowerCase();

  if (name.length < 2) return { error: "Le nom de votre café est requis." };

  const slug = slugify(rawSlug || name);
  if (!slug) return { error: "Adresse invalide — utilisez des lettres et des chiffres." };

  const res = await createCafe(owner.id, name, slug);
  if (!res.ok) {
    if (res.reason === "slug_taken") {
      return { error: `« ${slug} » est déjà pris. Essayez autre chose.` };
    }
    if (res.reason === "slug_reserved") {
      return { error: `« ${slug} » est réservé. Choisissez un autre nom.` };
    }
    return { error: "Adresse invalide : 3 à 40 caractères, lettres et chiffres." };
  }

  // Category, validated against the known keys so nothing arbitrary is stored.
  const type = String(formData.get("businessType") ?? "");
  if (TYPE_KEYS.has(type) && type !== "other") await setBusinessType(res.id, type);

  /*
    The card's face. Both optional.

    The logo arrives as a data URI the browser already downscaled; it is capped
    here as well because a hidden field is a field like any other and the client
    is never the last word on a size limit. ~180 KB is far above what
    fileToLogoDataUri produces and far below anything that would bloat the row.
  */
  const logo = String(formData.get("logo") ?? "");
  const logoUrl = logo.startsWith("data:image/") && logo.length < 180_000 ? logo : null;

  const rawPhone = String(formData.get("phone") ?? "").trim().slice(0, 24);
  const phone = rawPhone.length >= 6 ? rawPhone : null;

  await setCafeIdentity(res.id, { logoUrl, phone });

  /*
    Then rewards — NOT the till.

    An owner who lands on the caisse with an empty reward ladder has a working
    card that gives customers nothing to aim at, and no reason to suspect it.
    Réglages holds the reward editor, but Réglages is a screen you go looking
    for once you already know it exists, and a new owner does not.
  */
  redirect("/owner/nouveau/recompenses");
}
