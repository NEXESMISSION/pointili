/**
 * Shared types — these mirror the Postgres schema in supabase/migrations.
 * Keep them in sync with 0001_init.sql.
 */

export type DesignSettings = {
  loyaltyEnabled: boolean;
  showEngagement: boolean;
  pointsExpiryMonths: number | null;
};

export type Cafe = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "paused" | "disabled";
  primaryColor: string;
  logoUrl: string | null;
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
  /** Owner-tuned odds. Weights + isLose live in games.config.prizeConfig. */
  weight: number;
  isLose: boolean;
};

export type Game = {
  id: string;
  type: "wheel" | "slot";
  active: boolean;
  cooldownHours: number;
  prizes: Prize[];
};

export type ActiveCode = {
  code: string;
  label: string;
  kind: "win" | "reward" | "stamp";
  expiresAt: string;
};

/** What the diner sees on Ma carte. Balance is always sum(ledger.delta). */
export type Diner = {
  phone: string;
  name: string | null;
  balance: number;
  /** Stamps toward the current card (0 when stamps are off / none yet). */
  stamps: number;
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
