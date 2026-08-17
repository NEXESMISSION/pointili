import "server-only";
import { createAdminClient } from "./supabase/admin";
import {
  METHODS as FALLBACK_METHODS,
  OFFERS as FALLBACK_OFFERS,
  PLACEHOLDER,
  type Method,
  type Offer,
} from "./billing";

/**
 * WHAT THE PLATFORM CHARGES, AND WHERE THE MONEY GOES.
 *
 * These used to be constants in lib/billing.ts behind a flag whose own comment
 * read: "To go live: put the real values below and set PLACEHOLDER to false."
 * Which made the act of starting to take money a source change, a build and a
 * deploy — and until that happened the renewal screen showed a RIB of all
 * zeroes under a warning banner. A bank account number is operational data. It
 * changes when a bank does, not when the software does.
 *
 * So the values live in `platform_settings` (0041) and this module is the one
 * place that reads them.
 *
 * ── THE FALLBACK IS NOT A DEFAULT, IT IS THE OLD BEHAVIOUR ────────────────
 *
 * A fresh row is empty, and an empty offers list would render a pricing page
 * with no prices on it — a worse failure than the placeholder it replaced,
 * because it looks like a bug rather than like a shop that has not opened. So
 * an empty list falls back to the constants in lib/billing, which are exactly
 * what shipped before this table existed. Nothing changes until somebody fills
 * the form in, and the first save takes over completely.
 *
 * `paymentsLive` is the old PLACEHOLDER inverted. It is deliberately NOT
 * derived from "are the methods filled in?": somebody halfway through typing a
 * RIB has filled it in, and a half-typed account number that stops warning
 * people is the one failure this flag exists to prevent.
 */

export type PlatformSettings = {
  /** false → every screen showing payment coordinates says they are not real. */
  paymentsLive: boolean;
  offers: Offer[];
  methods: Method[];
  supportPhone: string | null;
  supportEmail: string | null;
  /** True while the values are lib/billing's, i.e. nobody has saved yet. */
  usingFallback: boolean;
};

const FALLBACK: PlatformSettings = {
  /* PLACEHOLDER says the constants are fake; paymentsLive says the opposite
     thing, so it is the negation and not a second source of truth. */
  paymentsLive: !PLACEHOLDER,
  offers: FALLBACK_OFFERS,
  methods: FALLBACK_METHODS,
  supportPhone: null,
  supportEmail: null,
  usingFallback: true,
};

/**
 * Read them. Never throws: a settings read that fails must not take down the
 * landing page, so a database blip serves the constants the app shipped with.
 */
export async function platformSettings(): Promise<PlatformSettings> {
  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc("platform_settings_read");
    if (error || !data) return FALLBACK;

    const d = data as Record<string, unknown>;
    const offers = (d.offers ?? []) as Offer[];
    const methods = (d.methods ?? []) as Method[];
    const empty = offers.length === 0 && methods.length === 0;

    return {
      paymentsLive: empty ? FALLBACK.paymentsLive : Boolean(d.paymentsLive),
      offers: offers.length ? offers : FALLBACK_OFFERS,
      methods: methods.length ? methods : FALLBACK_METHODS,
      supportPhone: (d.supportPhone as string | null) ?? null,
      supportEmail: (d.supportEmail as string | null) ?? null,
      usingFallback: empty,
    };
  } catch {
    return FALLBACK;
  }
}

/** One offer, resolved against whatever is live. */
export function pickOffer(s: PlatformSettings, id: string): Offer | null {
  return s.offers.find((o) => o.id === id) ?? null;
}

/** One method, likewise. */
export function pickMethod(s: PlatformSettings, id: string): Method | null {
  return s.methods.find((m) => m.id === id) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Validation — the shape belongs here, not to a check constraint              */
/* -------------------------------------------------------------------------- */

/**
 * Turn what an operator typed into rows the screens can render, or say why not.
 *
 * The database only insists these are arrays (0041). Everything else is checked
 * here, because the SHAPE is a fact about the components that draw it —
 * duplicating it as a SQL constraint would give us two definitions that drift,
 * and the one in SQL would be the one nobody updates.
 */
export function parseOffers(raw: unknown): { ok: true; offers: Offer[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Les offres doivent être une liste." };
  const offers: Offer[] = [];

  for (const [i, item] of raw.entries()) {
    const o = item as Record<string, unknown>;
    const id = String(o.id ?? "").trim();
    const label = String(o.label ?? "").trim();
    const months = Number(o.months);
    const price = Number(o.price);

    if (!id) return { ok: false, error: `Offre ${i + 1} : identifiant manquant.` };
    if (!label) return { ok: false, error: `Offre ${i + 1} : libellé manquant.` };
    if (!Number.isInteger(months) || months < 1 || months > 36) {
      return { ok: false, error: `Offre « ${label} » : durée entre 1 et 36 mois.` };
    }
    if (!Number.isFinite(price) || price < 0 || price > 100000) {
      return { ok: false, error: `Offre « ${label} » : prix invalide.` };
    }
    if (offers.some((x) => x.id === id)) {
      return { ok: false, error: `Deux offres portent l'identifiant « ${id} ».` };
    }

    offers.push({
      id: id as Offer["id"],
      label,
      months,
      price,
      /* Derived, never typed: an operator who edits the price and forgets the
         per-month line publishes two numbers that contradict each other on the
         same card. */
      perMonth: `≈ ${Math.round(price / months)} TND / mois`,
      ...(o.best ? { best: true as const } : {}),
    });
  }

  if (offers.length === 0) return { ok: false, error: "Il faut au moins une offre." };
  /* More than one "best" is a badge that means nothing. */
  if (offers.filter((o) => o.best).length > 1) {
    return { ok: false, error: "Une seule offre peut être « meilleure offre »." };
  }
  return { ok: true, offers };
}

export function parseMethods(raw: unknown): { ok: true; methods: Method[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Les moyens de paiement doivent être une liste." };
  const methods: Method[] = [];

  for (const [i, item] of raw.entries()) {
    const m = item as Record<string, unknown>;
    const id = String(m.id ?? "").trim();
    const label = String(m.label ?? "").trim();
    const how = String(m.how ?? "").trim();
    const lines = Array.isArray(m.lines) ? m.lines : [];

    if (!id) return { ok: false, error: `Moyen ${i + 1} : identifiant manquant.` };
    if (!label) return { ok: false, error: `Moyen ${i + 1} : libellé manquant.` };
    /*
      A payment method with no destination on it is the failure this whole
      screen exists to prevent: the owner reaches a page that names a method and
      tells them nowhere to send the money.
    */
    const clean = lines
      .map((l) => l as Record<string, unknown>)
      .map((l) => ({ label: String(l.label ?? "").trim(), value: String(l.value ?? "").trim() }))
      .filter((l) => l.label && l.value);
    if (clean.length === 0) {
      return { ok: false, error: `« ${label} » : indiquez au moins un numéro ou un RIB.` };
    }

    methods.push({ id: id as Method["id"], label, how, lines: clean });
  }

  return { ok: true, methods };
}
