import "server-only";
import { cache } from "react";
import { createAdminClient } from "./supabase/admin";
import type { Cafe, Diner, Game, LoyaltyProgram, Prize, Reward } from "./types";

/**
 * Café configuration reads — Supabase.
 *
 * These used to return a hardcoded mock café. Now every screen renders whatever
 * the owner has actually configured: their rate, their rewards, their prizes,
 * their odds.
 *
 * Reads run through the service-role client because they all happen server-side
 * and diners are not Supabase-authed. RLS is still on for every table and is
 * what protects anything reachable with the anon key (see scripts/attack.mjs).
 */

/**
 * Slugs that would collide with real routes. Next resolves static routes first,
 * so a café slugged "owner" would be silently unreachable.
 */
/**
 * Slugs Next.js would shadow. A café created on one of these is permanently
 * unreachable — the static route always wins over /[slug] — so this list MUST
 * cover every real root route (see app/). Kept in step with the same list inside
 * the create_cafe RPC.
 */
export const RESERVED_SLUGS = new Set([
  "owner", "admin", "api", "auth", "cartes", "moi", "conditions", "confidentialite", "login", "signup", "logout", "app", "static",
  "_next", "favicon.ico", "icon.png", "apple-icon.png", "robots.txt", "sitemap.xml",
]);

export function isSlugAvailable(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) && !RESERVED_SLUGS.has(slug);
}

type BusinessRow = {
  id: string;
  name: string;
  slug: string;
  status: Cafe["status"];
  primary_color: string;
  logo_url: string | null;
  phone: string | null;
  business_type: string | null;
  design_settings: Record<string, unknown> | null;
  plan: Cafe["plan"];
  plan_expires_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
};

const CAFE_COLS =
  "id, name, slug, status, primary_color, logo_url, phone, business_type, design_settings, plan, plan_expires_at, suspended_at, suspended_reason";

/** One of `allowed`, or the fallback — never whatever the column happened to hold. */
function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function toCafe(b: BusinessRow): Cafe {
  const d = b.design_settings ?? {};
  const t = (d.theme ?? {}) as Record<string, unknown>;
  // Mirrors cafe_is_live() in 0007_platform.sql. Kept in the app too so a page
  // can explain WHY a café is dark instead of just 404-ing at a paying customer.
  const live =
    b.status === "active" &&
    !b.suspended_at &&
    (!b.plan_expires_at || new Date(b.plan_expires_at).getTime() > Date.now());

  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    status: b.status,
    primaryColor: b.primary_color,
    logoUrl: b.logo_url,
    phone: b.phone,
    businessType: b.business_type ?? "other",
    designSettings: {
      loyaltyEnabled: (d.loyaltyEnabled as boolean) ?? true,
      showEngagement: (d.showEngagement as boolean) ?? true,
      pointsExpiryMonths: (d.pointsExpiryMonths as number | null) ?? null,
      /*
        Every field defaulted individually, not `?? DEFAULT_THEME`.

        A shop that saved a theme before a knob existed has a partial object,
        and spreading a default over it would be right while replacing it
        wholesale would silently reset the colour of a shop that had chosen
        one. Read field by field and a half-written theme is simply a theme
        with defaults in the gaps.
      */
      theme: {
        banner: pick(t.banner, ["flat", "gradient", "photo"], "gradient"),
        surface: pick(t.surface, ["light", "dark"], "light"),
        radius: pick(t.radius, ["s", "m", "l"], "m"),
        bannerRound: t.bannerRound !== false,
        scrim: t.scrim !== false,
        font: pick(t.font, ["inter", "poppins"], "inter"),
        coverAt: typeof t.coverAt === "string" ? t.coverAt : null,
      },
    },
    plan: b.plan ?? "trial",
    planExpiresAt: b.plan_expires_at,
    suspendedAt: b.suspended_at,
    suspendedReason: b.suspended_reason,
    live,
  };
}

/**
 * cache() dedupes within one request: the café layout AND the page both call
 * getCafe(slug), and without this that's two round-trips to Zurich for the same
 * row on every navigation. Same for getGame below. Big perceived-speed win.
 */
export const getCafe = cache(async (slug: string): Promise<Cafe | null> => {
  const db = createAdminClient();
  const { data } = await db
    .from("businesses")
    .select(CAFE_COLS)
    .eq("slug", slug)
    .maybeSingle();
  return data ? toCafe(data as unknown as BusinessRow) : null;
});

export const getCafeById = cache(async (id: string): Promise<Cafe | null> => {
  const db = createAdminClient();
  const { data } = await db
    .from("businesses")
    .select(CAFE_COLS)
    .eq("id", id)
    .maybeSingle();
  return data ? toCafe(data as unknown as BusinessRow) : null;
})

/**
 * The first café in the system — the dev-bypass fallback only (no Supabase auth
 * configured, dev build). Never used when real auth is on.
 */
export const getAnyCafe = cache(async (): Promise<Cafe | null> => {
  const db = createAdminClient();
  const { data } = await db
    .from("businesses")
    .select(CAFE_COLS)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data ? toCafe(data as unknown as BusinessRow) : null;
});

/** The café owned by this Supabase user (v1: one café per owner). */
export const getOwnedCafe = cache(async (ownerId: string): Promise<Cafe | null> => {
  const db = createAdminClient();
  const { data } = await db
    .from("businesses")
    .select(CAFE_COLS)
    .eq("owner_id", ownerId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data ? toCafe(data as unknown as BusinessRow) : null;
})

export const getRewards = cache(async (cafeId: string): Promise<Reward[]> => {
  const db = createAdminClient();
  const { data } = await db
    .from("loyalty_rewards")
    .select("id, label, points_cost, image_url, active, position")
    .eq("business_id", cafeId)
    .eq("active", true)
    .order("position");

  return (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    pointsCost: r.points_cost,
    imageUrl: r.image_url,
    active: r.active,
    position: r.position,
  }));
})

export const getLoyaltyProgram = cache(async (cafeId: string): Promise<LoyaltyProgram> => {
  const db = createAdminClient();
  const { data } = await db
    .from("loyalty_programs")
    .select(
      "active, points_per_tnd, welcome_points, redeem_expiry_hours, stamps_enabled, stamps_required, stamp_reward, stamp_expiry_days",
    )
    .eq("business_id", cafeId)
    .maybeSingle();

  // Defaults per §09, so a café without a program row still works.
  return {
    active: data?.active ?? true,
    pointsPerTnd: Number(data?.points_per_tnd ?? 1),
    welcomePoints: data?.welcome_points ?? 10,
    redeemExpiryHours: data?.redeem_expiry_hours ?? 48,
    stampsEnabled: data?.stamps_enabled ?? false,
    stampsRequired: data?.stamps_required ?? 10,
    stampReward: data?.stamp_reward ?? "Une récompense offerte",
    stampExpiryDays: data?.stamp_expiry_days ?? 0,
  };
})

type GameRow = { id: string; type: Game["type"]; active: boolean; spin_cost: number };

/** Assemble a Game (segments + odds) from a games row. */
async function buildGame(
  db: ReturnType<typeof createAdminClient>,
  game: GameRow,
): Promise<Game> {
  const { data: prizeRows } = await db
    .from("prizes")
    .select("id, label, position, active")
    .eq("game_id", game.id)
    .eq("active", true)
    .order("position");

  // games.config still holds the old prizeConfig weights. Nothing reads them
  // any more — the draw is uniform (see spin_wheel in 0029) — and they are left
  // in place rather than destroyed, so a café's old settings survive untouched.
  const prizes: Prize[] = (prizeRows ?? []).map((p) => ({
    id: p.id,
    label: p.label,
    position: p.position,
    active: p.active,
  }));

  return {
    id: game.id,
    type: game.type,
    active: game.active,
    spinCost: game.spin_cost,
    prizes,
  };
}

/** The playable game for diners — active only, and only if it has segments. */
export const getGame = cache(async (cafeId: string): Promise<Game | null> => {
  const db = createAdminClient();
  const { data: game } = await db
    .from("games")
    .select("id, type, active, spin_cost")
    .eq("business_id", cafeId)
    .eq("active", true)
    .order("type")
    .limit(1)
    .maybeSingle();

  if (!game) return null;
  const g = await buildGame(db, game as GameRow);
  return g.prizes.length === 0 ? null : g;
});

/**
 * The game as the OWNER manages it — returned even when switched off or empty,
 * so Réglages can show the on/off toggle and the prize editor. Without this a
 * café whose wheel is off (every new café starts one way or another) would have
 * no way to reach its own game controls.
 */
export const getOwnerGame = cache(async (cafeId: string): Promise<Game | null> => {
  const db = createAdminClient();
  const { data: game } = await db
    .from("games")
    .select("id, type, active, spin_cost")
    .eq("business_id", cafeId)
    .order("type")
    .limit(1)
    .maybeSingle();

  if (!game) return null;
  return buildGame(db, game as GameRow);
});

/** The signed-in diner, or null. Balance and codes come from the ledger. */
export async function getDiner(cafeId: string): Promise<Diner | null> {
  const { currentDiner } = await import("./auth/diner");
  const phone = await currentDiner();
  if (!phone) return null;

  const { getAccount, getBalance, getCodes, getStamps } = await import("./db");
  /*
    FOUR QUERIES, ONE ROUND TRIP'S WORTH OF WAITING.

    The account used to be awaited on its own before the other three started,
    which put two trips to the database in series on the screen a customer
    opens at the till. Nothing here needs the account row: balance, codes and
    stamps are keyed on (cafeId, phone), and phone is already in hand. The only
    thing the account decides is whether to return at all — which is just as
    true after the fact as before it.
  */
  const [account, balance, codes, stamps] = await Promise.all([
    getAccount(phone),
    getBalance(cafeId, phone),
    getCodes(cafeId, phone),
    getStamps(cafeId, phone),
  ]);
  if (!account) return null;

  return {
    phone,
    // One code, the same at every shop — it belongs to the person, not the card.
    code: account.code,
    name: account.name,
    balance,
    stamps: stamps.count,
    stampsStartedAt: stamps.startedAt,
    streak: 0,
    xp: 0,
    codes,
    nextPlayAt: null,
  };
}

/**
 * The signed-in diner IF they hold a card at this café, else null.
 *
 * cache(): the layout asks this to decide whether to draw the nav, and then the
 * page asks the identical question — two round trips to the same table on every
 * screen of the customer app. Deduped per request, like every getter here.
 *
 * Being signed in is not the same as being a member HERE: the account is global
 * (one phone, many cafés) but a card is per café. Every diner page must use this
 * — checking only `getDiner()` let someone with a card at café A open café B's
 * pages, where the balance is a meaningless zero. Callers redirect to
 * /[slug]/rejoindre, which enrolls them properly.
 */
export const getMember = cache(async function getMember(cafeId: string): Promise<Diner | null> {
  const { currentDiner } = await import("./auth/diner");
  const phone = await currentDiner();
  if (!phone) return null;

  /*
    Gate on the relationship ROW, not on the code.

    This used to test `diner.code`, which only worked because the code was
    per-shop and therefore empty at a café you had never joined. The code now
    belongs to the ACCOUNT, so every signed-in diner has one everywhere — that
    test would pass for every café on the platform and quietly stop gating
    anything.

    Ledger rows alone are still NOT membership: a cashier crediting a phone must
    not silently enrol them.
  */
  const { isCardholder } = await import("./db");
  const [diner, member] = await Promise.all([getDiner(cafeId), isCardholder(cafeId, phone)]);
  return diner && member ? diner : null;
});

/**
 * "Always almost there" (§11 #2) — the goal-gradient nudge that drives returns.
 * The next reward is the cheapest one the diner CAN'T yet afford.
 */
export function nextRewardNudge(balance: number, rewards: Reward[]) {
  const target = rewards
    .filter((r) => r.pointsCost > balance)
    .sort((a, b) => a.pointsCost - b.pointsCost)[0];

  if (!target) return null;

  /*
    No `progress` here on purpose.

    It used to measure from the previous affordable tier — "real closeness"
    rather than always starting at zero — and every surface that drew a bar
    disagreed with the caption printed directly above it, and with the other
    surfaces. Each bar now fills from balance / target.pointsCost, which is what
    "450 / 500" says in words. One rule, three screens, no arithmetic hidden
    from the person reading it.
  */
  return { target, needed: target.pointsCost - balance };
}
