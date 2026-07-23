"use server";

import { revalidatePath } from "next/cache";
import { ownerCafe } from "@/lib/auth/owner";
import { createClient } from "@/lib/supabase/server";

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

  const pointsPerTnd = num(formData.get("pointsPerTnd"), 0.1, 100);
  const welcomePoints = num(formData.get("welcomePoints"), 0, 10_000);
  const expiryHours = num(formData.get("redeemExpiryHours"), 1, 8760);

  if (pointsPerTnd === null) return { error: "Points par dinar : entre 0,1 et 100." };
  if (welcomePoints === null) return { error: "Bonus de bienvenue : entre 0 et 10 000." };
  if (expiryHours === null) return { error: "Validité des codes : entre 1 h et 1 an." };

  const db = await createClient();
  const { data, error } = await db
    .from("loyalty_programs")
    .update({
      points_per_tnd: pointsPerTnd,
      welcome_points: Math.round(welcomePoints),
      redeem_expiry_hours: Math.round(expiryHours),
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

export async function savePlayAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  const cooldown = num(formData.get("cooldownHours"), 0, 8760);
  if (cooldown === null) return { error: "Fréquence de jeu : entre 0 h et 1 an." };

  const db = await createClient();
  const { data: game } = await db
    .from("games")
    .select("id, config")
    .eq("business_id", cafe.id)
    .maybeSingle();
  if (!game) return { error: "Aucun jeu configuré." };

  // Merge, don't replace: config also holds prizeConfig, gates and qrGate —
  // overwriting it would silently wipe the owner's prize odds.
  const config = { ...(game.config as object), cooldownHours: Math.round(cooldown) };

  const { data, error } = await db
    .from("games")
    .update({ active: formData.get("wheelActive") === "on", config })
    .eq("id", game.id)
    .select("id");

  const failed = assertWrote(data, error);
  if (failed) return failed;

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}/jeux`);
  return { saved: "Jouer" };
}

export async function saveReturnAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  const db = await createClient();
  const { data, error } = await db
    .from("businesses")
    .update({
      design_settings: {
        ...cafe.designSettings,
        showEngagement: formData.get("showEngagement") === "on",
      },
      name: String(formData.get("name") ?? cafe.name).trim().slice(0, 60) || cafe.name,
    })
    .eq("id", cafe.id)
    .select("id");

  const failed = assertWrote(data, error);
  if (failed) return failed;

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}`);
  return { saved: "Café" };
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

/* -------------------------------------------------------------------------- */
/* Wheel prizes — labels live on the `prizes` row, odds in games.config        */
/* -------------------------------------------------------------------------- */

type PrizeConfig = Record<string, { weight: number; isLose: boolean }>;

/**
 * Add or update one wheel segment.
 *
 * A prize is split across two places: its label/position/active sit on the
 * `prizes` row, while its weight (odds) and "lose" flag live in
 * games.config.prizeConfig keyed by the prize id — which is exactly the shape
 * play_game() reads to pick a winner. We merge that config, never replace it, so
 * editing one segment can't wipe the others' odds.
 */
export async function savePrizeAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim().slice(0, 40);
  const weight = num(formData.get("weight"), 1, 1000);
  const isLose = formData.get("isLose") === "on";

  if (!label) return { error: "Le nom du lot est requis." };
  if (weight === null) return { error: "Chance : un poids entre 1 et 1000." };

  const db = await createClient();
  const { data: game } = await db
    .from("games")
    .select("id, config")
    .eq("business_id", cafe.id)
    .maybeSingle();
  if (!game) return { error: "Aucun jeu configuré." };

  const config = { ...(game.config as Record<string, unknown>) };
  const prizeConfig: PrizeConfig = { ...((config.prizeConfig as PrizeConfig) ?? {}) };

  let prizeId = id;
  if (id) {
    const { data, error } = await db
      .from("prizes")
      .update({ label, active: true })
      .eq("id", id)
      .eq("game_id", game.id) // belt + braces; RLS enforces ownership too
      .select("id");
    const failed = assertWrote(data, error);
    if (failed) return failed;
  } else {
    // append after the last segment
    const { data: last } = await db
      .from("prizes")
      .select("position")
      .eq("game_id", game.id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (last?.position ?? -1) + 1;
    const { data, error } = await db
      .from("prizes")
      .insert({ game_id: game.id, label, active: true, position })
      .select("id");
    const failed = assertWrote(data, error);
    if (failed) return failed;
    prizeId = data![0].id;
  }

  prizeConfig[prizeId] = { weight: Math.round(weight), isLose };
  config.prizeConfig = prizeConfig;

  const { error: cfgErr } = await db.from("games").update({ config }).eq("id", game.id);
  if (cfgErr) return { error: "Enregistrement impossible." };

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}/jeux`);
  return { saved: label };
}

export async function deletePrizeAction(id: string): Promise<void> {
  const cafe = await ownerCafe();
  if (!cafe) return;

  const db = await createClient();
  const { data: game } = await db
    .from("games")
    .select("id, config")
    .eq("business_id", cafe.id)
    .maybeSingle();
  if (!game) return;

  // A prize that's already been won can't be deleted (wins → prizes, on delete
  // restrict), so deactivate it instead — getGame only shows active segments.
  const { error } = await db
    .from("prizes")
    .delete()
    .eq("id", id)
    .eq("game_id", game.id);
  if (error) {
    await db.from("prizes").update({ active: false }).eq("id", id).eq("game_id", game.id);
  }

  const config = { ...(game.config as Record<string, unknown>) };
  const prizeConfig: PrizeConfig = { ...((config.prizeConfig as PrizeConfig) ?? {}) };
  delete prizeConfig[id];
  config.prizeConfig = prizeConfig;
  await db.from("games").update({ config }).eq("id", game.id);

  revalidatePath("/owner/reglages");
  revalidatePath(`/${cafe.slug}/jeux`);
}
