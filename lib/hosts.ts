/**
 * Two hosts, one deployment.
 *
 *   pointili.online       the public side — marketing, /[slug], /moi, /cartes
 *   app.pointili.online   the business side — the till, and /console
 *
 * The direction is NOT a preference, it is forced: every printed QR encodes
 * `pointili.online/{slug}` and ends up glued to a table. Whichever side owns the
 * apex can never move, so the customer side owns it and the business side gets
 * the subdomain.
 *
 * The win is that a diner cookie and an owner session stop sharing an origin.
 * Nothing in this codebase sets a cookie `Domain`, so cookies are host-only and
 * the isolation is automatic — one phone can hold both sessions and they can no
 * longer see each other. (That was a real bug, not a theoretical one: an owner
 * mid-sign-in could be thrown to /cartes by a family member's diner cookie.)
 *
 * PUBLIC paths on the app host are short — `/analyses`, not `/owner/analyses` —
 * and the proxy rewrites them onto the internal tree. So there are two
 * vocabularies and they must not be mixed up:
 *
 *   PUBLIC   what the browser shows, what redirect() and <Link href> must use
 *   INTERNAL the file tree under app/, what revalidatePath() must use
 */

/** Paths the app host serves as-is — no rewrite, no redirect. */
const PASSTHROUGH = ["/_next", "/api", "/auth", "/favicon", "/icon", "/apple-icon", "/robots", "/sitemap"];

export function isPassthrough(pathname: string): boolean {
  return PASSTHROUGH.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}.`));
}

/**
 * Is this request for the business side?
 *
 * Matches `app.pointili.online` and also `app.localhost:3000`, which Chrome and
 * Firefox resolve without touching the hosts file — so local dev exercises the
 * real split rather than a special case.
 */
export function isAppHost(host: string | null): boolean {
  return Boolean(host && host.split(":")[0].startsWith("app."));
}

/** The apex equivalent of an app host, for sending a visitor back the other way. */
export function apexHost(host: string): string {
  return host.replace(/^app\./, "");
}

/** The app-host equivalent of the apex, for sending an owner to their side. */
export function appHost(host: string): string {
  return host.startsWith("app.") ? host : `app.${host}`;
}

/**
 * PUBLIC → INTERNAL. `/analyses` is really `/owner/analyses`; `/console` is
 * really `/admin`. Everything else on the app host belongs to the owner app.
 */
export function toInternal(pathname: string): string {
  if (pathname === "/console" || pathname.startsWith("/console/")) {
    return `/admin${pathname.slice("/console".length)}`;
  }
  return pathname === "/" ? "/owner" : `/owner${pathname}`;
}

/**
 * INTERNAL → PUBLIC. Used to send someone who hit an internal path on the apex
 * to the right URL on the app host, so there is exactly one address per screen.
 */
export function toPublic(pathname: string): string {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return `/console${pathname.slice("/admin".length)}`;
  }
  if (pathname === "/owner") return "/";
  if (pathname.startsWith("/owner/")) return pathname.slice("/owner".length);
  return pathname;
}

/**
 * Absolute URL of the business side, for the few links that must cross origins
 * (the marketing page's "Espace café" and "Créer mon compte").
 *
 * Falls back to deriving it from the public site URL so a preview deployment
 * with only one env var set still produces a working link.
 */
export function appUrl(path = "/"): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return `${explicit.replace(/\/$/, "")}${path}`;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pointili.online";
  try {
    const u = new URL(site);
    u.host = appHost(u.host);
    return `${u.origin}${path}`;
  } catch {
    return `https://app.pointili.online${path}`;
  }
}
