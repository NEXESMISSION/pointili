"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ownerCafe } from "@/lib/auth/owner";
import { rewardArtFor } from "@/lib/rewardArt";
import { createClient } from "@/lib/supabase/server";

export type StarterState = { error?: string };

/**
 * The first reward ladder — EDITED, not appended.
 *
 * create_cafe already seeds a working ladder (Espresso, Cappuccino, Pâtisserie,
 * Brunch) so a brand-new café is never empty. The first version of this step
 * inserted the owner's answers alongside those, and a shop finished signup with
 * seven rewards and two of everything at position 0. The seeded rows ARE the
 * starting point; this screen is where they get changed.
 *
 * So: a row that arrives with an id updates that row. A row with no id is a new
 * one. A row whose label was cleared is deactivated rather than deleted —
 * loyalty_redemptions references rewards, and a reward someone has already
 * bought must not vanish out from under their code.
 *
 * All of it through the OWNER's session and RLS. Signup is not a special case
 * that gets to bypass the rule that a café's rows belong to its owner.
 */
export async function saveStarterRewardsAction(
  _prev: StarterState,
  formData: FormData,
): Promise<StarterState> {
  const cafe = await ownerCafe();
  if (!cafe) redirect("/owner/login");

  const db = await createClient();

  const updates: { id: string; label: string; points_cost: number; position: number }[] = [];
  const inserts: {
    business_id: string;
    label: string;
    points_cost: number;
    active: boolean;
    position: number;
    /** null when nothing in the drawn set fits — see lib/rewardArt. */
    image_url: string | null;
  }[] = [];
  const retire: string[] = [];
  let position = 0;

  for (let i = 0; i < 8; i++) {
    const id = String(formData.get(`id${i}`) ?? "");
    const label = String(formData.get(`label${i}`) ?? "").trim().slice(0, 60);

    if (!label) {
      if (id) retire.push(id); // cleared an existing one → switch it off
      continue;
    }

    const cost = Math.round(Number(formData.get(`cost${i}`)));
    if (!Number.isFinite(cost) || cost < 1 || cost > 1_000_000) {
      return { error: `« ${label} » : le coût doit être d'au moins 1 point.` };
    }

    if (id) updates.push({ id, label, points_cost: cost, position: position++ });
    else
      inserts.push({
        business_id: cafe.id,
        label,
        points_cost: cost,
        active: true,
        position: position++,
        /*
          A PICTURE, WITHOUT ASKING FOR ONE.

          A shop finishing signup used to land four rewards with an empty
          image_url, so its customers' first look at the card was four identical
          grey gift glyphs. Matching the label against the drawn set costs
          nothing and only ever fills a field that would otherwise be null — an
          owner who uploads a photo in Réglages overwrites it, and a label with
          no match (a barber's "coupe offerte") still gets null rather than a
          croissant.
        */
        image_url: rewardArtFor(label),
      });
  }

  for (const u of updates) {
    const { error } = await db
      .from("loyalty_rewards")
      .update({ label: u.label, points_cost: u.points_cost, position: u.position, active: true })
      .eq("id", u.id)
      .eq("business_id", cafe.id); // belt and braces; RLS enforces it too
    if (error) return { error: "Enregistrement impossible — réessayez." };
  }

  /*
    Fill the pictures of the seeded rows too — but ONLY where the field is
    still empty. The seeded ladder arrives with ids, so it takes the update
    path above and would otherwise be the one ladder that never gets art. The
    `is("image_url", null)` guard is what keeps this from ever overwriting a
    photo the owner uploaded.
  */
  for (const u of updates) {
    const art = rewardArtFor(u.label);
    if (!art) continue;
    await db
      .from("loyalty_rewards")
      .update({ image_url: art })
      .eq("id", u.id)
      .eq("business_id", cafe.id)
      .is("image_url", null);
  }

  if (inserts.length) {
    const { data, error } = await db.from("loyalty_rewards").insert(inserts).select("id");
    // An RLS refusal returns no error AND no rows, which reads as success.
    if (error || !data || data.length === 0) {
      return { error: "Enregistrement impossible — réessayez." };
    }
  }

  if (retire.length) {
    await db
      .from("loyalty_rewards")
      .update({ active: false })
      .in("id", retire)
      .eq("business_id", cafe.id);
  }

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}`);
  revalidatePath(`/${cafe.slug}/boutique`);
  redirect("/owner");
}
