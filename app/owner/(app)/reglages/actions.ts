"use server";

import { revalidatePath } from "next/cache";
import { ownerCafe } from "@/lib/auth/owner";
import { BUSINESS_TYPES } from "@/lib/businessTypes";
import { createClient } from "@/lib/supabase/server";

const TYPE_KEYS = new Set(BUSINESS_TYPES.map((t) => t.key));

export type SettingsState = { error?: string; saved?: string };

/**
 * Owner settings writes.
 *
 * These deliberately use the owner's OWN cookie-bound session, not the
 * service-role key: the RLS policies (`*_owner_write`) then enforce that an
 * owner can only ever touch their own café's rows. Using service-role here would
 * work, but it would make the ownership check the app's job — and RLS is the
 * thing that can't be forgotten.
 *
 * ownerCafe() resolves the café from the session too, so no café id ever crosses
 * the wire for a caller to tamper with.
 */

/**
 * A write that touched no rows is NOT a success.
 *
 * Postgres returns no error when an UPDATE matches zero rows — and RLS or a
 * missing GRANT makes exactly that happen. This shipped once: the panel showed
 * "Enregistré ✦" while silently changing nothing, because `authenticated` had
 * lost its table grants. Never report saved without proof.
 */
function assertWrote(rows: unknown[] | null, error: unknown): SettingsState | null {
  if (error) return { error: "Enregistrement impossible." };
  if (!rows || rows.length === 0) {
    return { error: "Rien n'a été enregistré — vérifiez vos droits." };
  }
  return null;
}

/** Number field with a sane range — the DB has no opinion, the product does. */
function num(v: FormDataEntryValue | null, min: number, max: number): number | null {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export async function saveEarnAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  /*
    NEITHER THE RATE NOR THE CODE DEADLINE IS READ FROM THE FORM ANY MORE.

    Both fields are gone from the screen (0031), and this is the half that
    matters: a server action that still trusted `pointsPerTnd` from the body
    would let anyone who can post a form set their own rate, whatever the UI
    stopped offering. Removing the input is cosmetic; removing the read is the
    fix. The database now also carries a CHECK that the rate is 1.
  */
  const welcomePoints = num(formData.get("welcomePoints"), 0, 10_000);
  if (welcomePoints === null) return { error: "Bonus de bienvenue : entre 0 et 10 000." };

  const db = await createClient();
  const { data, error } = await db
    .from("loyalty_programs")
    .update({
      welcome_points: Math.round(welcomePoints),
      active: formData.get("loyaltyActive") === "on",
    })
    .eq("business_id", cafe.id)
    .select("business_id"); // see assertWrote()

  const failed = assertWrote(data, error);
  if (failed) return failed;

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}`);
  // The earn rate + welcome also drive the caisse preview and the revenue/net
  // figures on Analyses — refresh both, or they contradict the new setting.
  revalidatePath("/owner");
  revalidatePath("/owner/analyses");
  return { saved: "Gagner" };
}

/**
 * The stamp card ("tampons") — an optional mode that runs alongside points.
 * A café can turn it on, set how many stamps fill a card, and name the reward.
 */
export async function saveStampsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  const required = num(formData.get("stampsRequired"), 1, 100);
  const reward = String(formData.get("stampReward") ?? "").trim().slice(0, 80);
  const expiryDays = num(formData.get("stampExpiryDays"), 0, 3650);

  if (required === null) return { error: "Nombre de tampons : entre 1 et 100." };
  if (!reward) return { error: "Décrivez la récompense de la carte." };
  if (expiryDays === null) return { error: "Validité : entre 0 et 3650 jours." };

  const db = await createClient();
  const { data, error } = await db
    .from("loyalty_programs")
    .update({
      stamps_enabled: formData.get("stampsEnabled") === "on",
      stamps_required: Math.round(required),
      stamp_reward: reward,
      stamp_expiry_days: Math.round(expiryDays),
    })
    .eq("business_id", cafe.id)
    .select("business_id");

  const failed = assertWrote(data, error);
  if (failed) return failed;

  revalidatePath("/owner/reglages");
  revalidatePath("/owner"); // the caisse shows the stamp control when enabled
  revalidatePath(`/${cafe.slug}`);
  return { saved: "Tampons" };
}

/* -------------------------------------------------------------------------- */
/* Café identity — name, brand colour, and the shop logo                       */
/* -------------------------------------------------------------------------- */

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function saveCafeAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  const name = String(formData.get("name") ?? cafe.name).trim().slice(0, 60) || cafe.name;
  const rawColor = String(formData.get("primaryColor") ?? "").trim();
  const primaryColor = HEX.test(rawColor) ? rawColor.toLowerCase() : cafe.primaryColor;
  const rawType = String(formData.get("businessType") ?? "");
  const businessType = TYPE_KEYS.has(rawType) ? rawType : cafe.businessType;

  const db = await createClient();
  const { data, error } = await db
    .from("businesses")
    .update({
      name,
      primary_color: primaryColor,
      business_type: businessType,
      design_settings: {
        ...cafe.designSettings,
        showEngagement: formData.get("showEngagement") === "on",
      },
    })
    .eq("id", cafe.id)
    .select("id");

  const failed = assertWrote(data, error);
  if (failed) return failed;

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}`);
  return { saved: "Café" };
}

/**
 * The shop logo, stored as a compact data-URI in businesses.logo_url.
 *
 * The client downscales the image to a small square on a canvas before it ever
 * reaches here (a real logo lands at ~10-30 KB), so no object storage is needed
 * and the same code path works identically in dev and prod. We still validate
 * hard on the server — never trust the client did the shrinking:
 *   • only raster image types (png/jpeg/webp) — no SVG, which can carry script
 *   • a firm byte cap, so a crafted payload can't bloat the row or the card query
 */
const LOGO_PREFIX = /^data:image\/(png|jpe?g|webp);base64,/i;
const LOGO_MAX_CHARS = 500_000; // ~360 KB decoded — generous for a 256px logo

export async function saveLogoAction(dataUri: string): Promise<SettingsState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  if (typeof dataUri !== "string" || !LOGO_PREFIX.test(dataUri)) {
    return { error: "Image invalide (PNG, JPG ou WebP)." };
  }
  if (dataUri.length > LOGO_MAX_CHARS) {
    return { error: "Logo trop lourd — essayez une image plus petite." };
  }
  const b64 = dataUri.slice(dataUri.indexOf(",") + 1);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    return { error: "Image invalide." };
  }

  const db = await createClient();
  const { data, error } = await db
    .from("businesses")
    .update({ logo_url: dataUri })
    .eq("id", cafe.id)
    .select("id");

  const failed = assertWrote(data, error);
  if (failed) return failed;

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}`);
  return { saved: "Logo" };
}

export async function removeLogoAction(): Promise<SettingsState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  const db = await createClient();
  const { data, error } = await db
    .from("businesses")
    .update({ logo_url: null })
    .eq("id", cafe.id)
    .select("id");

  const failed = assertWrote(data, error);
  if (failed) return failed;

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}`);
  return { saved: "Logo retiré" };
}

/**
 * A photo for a reward, shown to diners in the boutique. Same hardened path as
 * the logo: the browser downscales to a small WebP before it ever reaches here,
 * and we still validate type + byte cap on the server.
 */
export async function saveRewardImageAction(rewardId: string, dataUri: string): Promise<SettingsState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };
  if (typeof dataUri !== "string" || !LOGO_PREFIX.test(dataUri)) {
    return { error: "Image invalide (PNG, JPG ou WebP)." };
  }
  if (dataUri.length > LOGO_MAX_CHARS) {
    return { error: "Image trop lourde — essayez une image plus petite." };
  }
  const b64 = dataUri.slice(dataUri.indexOf(",") + 1);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { error: "Image invalide." };

  const db = await createClient();
  const { data, error } = await db
    .from("loyalty_rewards")
    .update({ image_url: dataUri })
    .eq("id", rewardId)
    .eq("business_id", cafe.id) // RLS enforces this too; belt + braces
    .select("id");

  const failed = assertWrote(data, error);
  if (failed) return failed;

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}/boutique`);
  revalidatePath(`/${cafe.slug}`);
  return { saved: "Image" };
}

export async function removeRewardImageAction(rewardId: string): Promise<SettingsState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  const db = await createClient();
  const { data, error } = await db
    .from("loyalty_rewards")
    .update({ image_url: null })
    .eq("id", rewardId)
    .eq("business_id", cafe.id)
    .select("id");

  const failed = assertWrote(data, error);
  if (failed) return failed;

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}/boutique`);
  revalidatePath(`/${cafe.slug}`);
  return { saved: "Image retirée" };
}

/* -------------------------------------------------------------------------- */
/* Rewards — the tuning lever for "almost there" (§11 #2)                      */
/* -------------------------------------------------------------------------- */

export async function saveRewardAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim().slice(0, 60);
  const cost = num(formData.get("pointsCost"), 1, 1_000_000);
  const active = formData.get("active") === "on";

  if (!label) return { error: "Le nom de la récompense est requis." };
  if (cost === null) return { error: "Coût : au moins 1 point." };

  const db = await createClient();
  const { data, error } = id
    ? await db
        .from("loyalty_rewards")
        .update({ label, points_cost: Math.round(cost), active })
        .eq("id", id)
        .eq("business_id", cafe.id) // belt and braces; RLS enforces it too
        .select("id")
    : await db
        .from("loyalty_rewards")
        .insert({
          business_id: cafe.id,
          label,
          points_cost: Math.round(cost),
          active,
          position: 99,
        })
        .select("id");

  const failed = assertWrote(data, error);
  if (failed) return failed;

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}/boutique`);
  revalidatePath(`/${cafe.slug}`);
  return { saved: label };
}

/**
 * The order the diner sees them in, set by dragging.
 *
 * `position` has existed since 0001 and nothing could ever change it — new
 * rewards were inserted at 99 and the list was whatever order the database felt
 * like returning. An owner who wants their cheapest reward first, or their
 * seasonal one at the top, had no way to say so.
 *
 * Scoped to the café on every row: ids arrive from the browser, so a crafted
 * list must not be able to renumber somebody else's catalogue.
 */
export async function reorderRewardsAction(ids: string[]): Promise<void> {
  const cafe = await ownerCafe();
  if (!cafe) return;
  // a bounded list of plausible ids, not whatever was posted
  const clean = ids.filter((id) => typeof id === "string" && id.length <= 64).slice(0, 100);
  if (!clean.length) return;

  const db = await createClient();
  await Promise.all(
    clean.map((id, position) =>
      db
        .from("loyalty_rewards")
        .update({ position })
        .eq("id", id)
        .eq("business_id", cafe.id),
    ),
  );

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}/boutique`);
  revalidatePath(`/${cafe.slug}`);
}

/**
 * Show or hide one reward, from the list itself.
 *
 * Hiding used to mean opening the editor, unticking a box and pressing save —
 * three steps for the thing an owner does most often, when the pâtisserie runs
 * out at 11am and has to come off the list until tomorrow.
 */
export async function toggleRewardActiveAction(id: string, active: boolean): Promise<void> {
  const cafe = await ownerCafe();
  if (!cafe) return;

  const db = await createClient();
  await db
    .from("loyalty_rewards")
    .update({ active })
    .eq("id", id)
    .eq("business_id", cafe.id);

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}/boutique`);
  revalidatePath(`/${cafe.slug}`);
}

export async function deleteRewardAction(id: string): Promise<void> {
  const cafe = await ownerCafe();
  if (!cafe) return;

  const db = await createClient();
  // Redemptions reference rewards (on delete restrict), so a reward that has
  // been claimed cannot be deleted — deactivate it instead of failing.
  const { error } = await db
    .from("loyalty_rewards")
    .delete()
    .eq("id", id)
    .eq("business_id", cafe.id);

  if (error) {
    await db
      .from("loyalty_rewards")
      .update({ active: false })
      .eq("id", id)
      .eq("business_id", cafe.id);
  }

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}/boutique`);
  // Ma carte's "almost there" nudge depends on the reward set too.
  revalidatePath(`/${cafe.slug}`);
}

/* ── La roue ─────────────────────────────────────────────────────────────── */

/**
 * The wheel's switch and its price.
 *
 * games.active is the on/off the customer feels; spin_cost is what a turn
 * costs. Both live on the games row, and spin_wheel() reads the price from
 * there rather than from the client — so this action is the ONLY way the price
 * can move, and it goes through the owner's session and RLS like everything
 * else on this screen.
 */
export async function saveWheelAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  const cost = num(formData.get("spinCost"), 0, 1_000_000);
  if (cost === null) return { error: "Coût d'un tour : entre 0 et 1 000 000 points." };

  const db = await createClient();
  const { data, error } = await db
    .from("games")
    .update({ active: formData.get("wheelActive") === "on", spin_cost: Math.round(cost) })
    .eq("business_id", cafe.id)
    .select("id");

  const failed = assertWrote(data, error);
  if (failed) return failed;

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}/boutique`);
  return { saved: "La roue" };
}

/** One segment. A blank label deletes it. */
export async function savePrizeAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  const db = await createClient();
  const { data: game } = await db.from("games").select("id").eq("business_id", cafe.id).maybeSingle();
  if (!game) return { error: "Roue introuvable." };

  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim().slice(0, 40);
  if (!label) return { error: "Le nom du lot est requis." };

  const { data, error } = id
    ? await db.from("prizes").update({ label }).eq("id", id).eq("game_id", game.id).select("id")
    : await db
        .from("prizes")
        .insert({ game_id: game.id, label, active: true, position: 99 })
        .select("id");

  const failed = assertWrote(data, error);
  if (failed) return failed;

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}/boutique`);
  return { saved: label };
}

/**
 * Retire a segment.
 *
 * Deactivated, never deleted: wins.prize_id is ON DELETE RESTRICT (0001), so a
 * prize somebody has already won cannot be removed — and should not be, or the
 * code in their hand would point at nothing.
 */
export async function deletePrizeAction(prizeId: string): Promise<SettingsState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  const db = await createClient();
  const { data: game } = await db.from("games").select("id").eq("business_id", cafe.id).maybeSingle();
  if (!game) return { error: "Roue introuvable." };

  const { data, error } = await db
    .from("prizes")
    .update({ active: false })
    .eq("id", prizeId)
    .eq("game_id", game.id)
    .select("id");

  const failed = assertWrote(data, error);
  if (failed) return failed;

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}/boutique`);
  return { saved: "Lot retiré" };
}
