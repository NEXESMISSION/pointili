/**
 * Shared types — these mirror the Postgres schema in supabase/migrations.
 * Keep them in sync with 0001_init.sql.
 */

/**
 * How the CUSTOMER's card looks — chosen by the shop, in Réglages › Le thème.
 *
 * Everything here is presentation and nothing here can break the programme: a
 * card with an unreadable theme would still credit points correctly. That is
 * why it lives in design_settings (jsonb, tiny, no migration per knob) while
 * the photograph — the only heavy part — lives in its own column.
 *
 * WHAT IS DELIBERATELY NOT OFFERED:
 *   · a free gradient with its own two colours. A shop picks ONE colour; the
 *     gradient is derived from it, so a green shop cannot end up with a purple
 *     ramp fighting its own logo. The choice is how strong, not which hue.
 *   · a third typeface. Inter and Poppins are already loaded for every page in
 *     the product; a third family is a real font file on a real phone on 3G,
 *     charged to the customer, to change the shape of a heading.
 */
export type CardTheme = {
  /** flat colour, a derived gradient, or the shop's own photograph. */
  banner: "flat" | "gradient" | "photo";
  /** The customer's app: white, or dark. */
  surface: "light" | "dark";
  /** Corner roundness, applied to every card the customer sees. */
  radius: "s" | "m" | "l";
  /**
   * HOW MUCH the banner curves into the page — not whether.
   *
   * This was a switch, and a switch was the wrong instrument: the two corners
   * under a shop's own header are one of the few things that make a card look
   * like a brand rather than a template, and "on" was a 30px curve somebody
   * else chose. Four steps, from a header the page hangs from (`none`) to a
   * card laid on the screen (`l`).
   *
   * Old rows hold `true`/`false` — lib/data maps them to "m"/"none" on read, so
   * nothing needs migrating and no shop wakes up looking different.
   */
  bannerRound: "none" | "s" | "m" | "l";
  /**
   * How tall the shop's own colour is before the card begins.
   *
   * A photograph of a room needs the height to be a room; a wordmark on a flat
   * colour usually wants less. It changes the whole weight of the screen, which
   * is why it belongs to the shop.
   */
  bannerHeight: "s" | "m" | "l";
  /**
   * A texture over the banner colour — dots, stripes, a grid, or nothing.
   *
   * Drawn in CSS from the shop's own ink at low opacity, so it costs no bytes,
   * works over a flat colour AND a gradient, and can never fight the type.
   * Skipped entirely on a photograph, which has its own texture.
   */
  pattern: "none" | "dots" | "stripes" | "grid";
  /**
   * Only meaningful with a photograph: darken it, or show it as it is.
   *
   * ON is the safe default and stays the default — the name and the balance are
   * drawn over this picture. An owner whose photo is already dark and quiet can
   * turn it off and get their own image untouched.
   */
  scrim: boolean;
  /**
   * Whether the shop's logo is CUT to a circle, or shown whole.
   *
   * Every surface that draws a logo used to force `rounded-full object-cover`,
   * which is right for a photograph of a shopfront and wrong for a logo — and
   * a logo is what this field holds. A wordmark came back with its first and
   * last letters sliced off; a mark drawn on transparency got a disc of white
   * stamped behind it; anything not square lost whichever side was longer.
   * There was no way to say "it is already the right shape, leave it alone".
   *
   *   "circle"  cropped to a disc, filling it. The default, because it is what
   *             every existing shop already looks like and because it is the
   *             safe choice for a photo or an off-centre mark.
   *   "free"    contained, not cropped: the whole logo, its own proportions,
   *             nothing behind it. For transparent PNGs and wide wordmarks.
   *
   * Old rows have no value and read as "circle", so nothing changes for a shop
   * that never opens the setting.
   */
  logoShape: "circle" | "free";
  /** Both are already loaded by the root layout — see the note above. */
  font: "inter" | "poppins";
  /**
   * Cache-buster for the cover photograph, bumped whenever one is saved.
   * The bytes live in businesses.cover_url and are served by /api/cover/[slug];
   * this is what lets that response be immutable for a year.
   */
  coverAt: string | null;
};

export type DesignSettings = {
  loyaltyEnabled: boolean;
  showEngagement: boolean;
  pointsExpiryMonths: number | null;
  theme: CardTheme;
};

export type Cafe = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "paused" | "disabled";
  primaryColor: string;
  logoUrl: string | null;
  /** Printed on the card if the shop chose to give one. Never used to identify. */
  phone: string | null;
  /** Category key (see lib/businessTypes) — how a diner tells this card apart. */
  businessType: string;
  designSettings: DesignSettings;

  /* — platform state (super-admin controlled) — */
  plan: "trial" | "free" | "pro";
  planExpiresAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  /**
   * May this café serve diners right now? False when suspended or when the
   * subscription has lapsed. This is what makes a plan expiry mean something —
   * the owner keeps their data and their panel, but the QR stops working.
   */
  live: boolean;
};

/** Per-café points config (loyalty_programs). Defaults per §09. */
export type LoyaltyProgram = {
  active: boolean;
  pointsPerTnd: number;
  welcomePoints: number;
  redeemExpiryHours: number;
  /* — stamp card ("tampons"), optional, runs alongside points — */
  stampsEnabled: boolean;
  stampsRequired: number;
  stampReward: string;
  /** Days before an in-progress stamp card lapses; 0 = never. */
  stampExpiryDays: number;
};

export type Reward = {
  id: string;
  label: string;
  pointsCost: number;
  imageUrl: string | null;
  active: boolean;
  position: number;
};

export type Prize = {
  id: string;
  label: string;
  position: number;
  active: boolean;
};

/**
 * The wheel. Note what is NOT here any more.
 *
 * `weight` is gone: the draw is uniform over the active segments, so the odds
 * are simply one in however many prizes there are. An owner who wants the good
 * prize to be rarer adds more ordinary segments — which is a thing the customer
 * can see on the wheel, unlike a hidden multiplier.
 *
 * `cooldownHours` is gone: a spin is no longer rationed by time, it is bought
 * with points. `spinCost` replaced it.
 */
export type Game = {
  id: string;
  type: "wheel" | "slot";
  active: boolean;
  /** Points a diner pays per spin. Read from the row, never from the client. */
  spinCost: number;
  prizes: Prize[];
};

export type ActiveCode = {
  code: string;
  label: string;
  kind: "win" | "reward" | "stamp";
  /**
   * ALWAYS null since 0031 — a code does not expire.
   *
   * Typed `string` before, which is how a customer holding a perfectly valid
   * reward came to be told it had "expiré": the column is null now, and
   * `new Date(null).getTime()` is 0, so a countdown against the epoch made
   * every code look decades overdue. The field stays for the rows written
   * before the migration, and the type now says what it really is so the next
   * reader has to handle it.
   */
  expiresAt: string | null;
};

/** What the diner sees on Ma carte. Balance is always sum(ledger.delta). */
export type Diner = {
  phone: string;
  /** Short per-shop code shown at the counter in place of the phone. */
  code: string;
  name: string | null;
  balance: number;
  /** Stamps toward the current card (0 when stamps are off / none yet). */
  stamps: number;
  /** When the current stamp card started — for the expiry note. */
  stampsStartedAt: string | null;
  streak: number;
  xp: number;
  codes: ActiveCode[];
  nextPlayAt: string | null;
};

export type PlayResult = {
  prizeId: string;
  prizeIndex: number;
  prizeLabel: string;
  isLose: boolean;
  code: string | null;
  nextPlayAt: string;
};
