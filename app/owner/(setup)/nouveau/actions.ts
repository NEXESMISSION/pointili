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

  /*
    ALREADY HAVE ONE? THEN THIS IS A SECOND SUBMIT, NOT A SECOND SHOP.

    The page redirects an owner who has a café (page.tsx), and a page guard is
    not a guard: a server action is a public endpoint, and a form left open in
    another tab posts to it just as well. getOwnedCafe() returns the OLDEST
    café, so the extra one was invisible to the person who made it while
    holding its slug for ever and showing in the console as a real shop.

    v1 is one café per owner. That rule now lives where the write happens.
  */
  /*
    ALREADY HAS ONE → NOTHING TO DO HERE. This is also what keeps the endpoint
    harmless once the staff gate exists: it sits outside the layout that renders
    that gate, so anybody holding the counter phone can POST to it — and this
    line is why the worst they achieve is a redirect.
  */
  const { ownerCafe } = await import("@/lib/auth/owner");
  if (await ownerCafe()) redirect("/owner");

  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const rawSlug = String(formData.get("slug") ?? "").trim().toLowerCase();

  if (name.length < 2) return { error: "Le nom de votre café est requis." };

  const slug = slugify(rawSlug || name);
  if (!slug) return { error: "Adresse invalide — utilisez des lettres et des chiffres." };

  /*
    TWO SHOPS MAY HAVE THE SAME NAME. TUNISIA HAS MORE THAN ONE CAFÉ CENTRAL.

    The address is derived from the name, so the second owner to type a common
    one was stopped by « cafe-central » est déjà pris — a string they never
    typed, naming a field folded away inside "Adresse et téléphone · facultatif".
    To get in, they had to work out that the shop has a URL, that the URL can be
    edited, where that control is, and what to put in it — on the first screen
    of the product, before anything of theirs existed.

    A DERIVED address steps aside on its own: cafe-central, cafe-central-2,
    cafe-central-3. The owner keeps the name they wanted and finds out what
    their address is on the next screen, where changing it is one tap.

    A TYPED address still refuses, and it must: somebody who opened that panel
    and chose their address is asking for that one, and silently handing them a
    different one would put a number on the sticker they are about to print.
  */
  let claimed = slug;
  let res = await createCafe(owner.id, name, claimed);
  if (!res.ok && res.reason === "slug_taken" && !rawSlug) {
    for (let n = 2; n <= 40; n += 1) {
      claimed = `${slug}-${n}`;
      res = await createCafe(owner.id, name, claimed);
      if (res.ok || res.reason !== "slug_taken") break;
    }
  }

  if (!res.ok) {
    if (res.reason === "slug_taken") {
      return { error: `« ${claimed} » est déjà pris. Essayez autre chose.` };
    }
    if (res.reason === "slug_reserved") {
      return { error: `« ${claimed} » est réservé. Choisissez un autre nom.` };
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
