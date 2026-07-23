"use server";

import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/auth/owner";
import { createCafe, slugify } from "@/lib/db";

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

  redirect("/owner");
}
