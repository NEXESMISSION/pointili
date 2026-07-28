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
 * Paths are REAL on both hosts — nothing is rewritten. app.pointili.online
 * serves /owner and /admin exactly as the file tree spells them, and the apex
 * refuses them. See proxy.ts for why the shorter-URL version was abandoned.
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

/**
 * The app-host equivalent of whatever host the request arrived on.
 *
 * NOT a blind `app.` prefix. This shipped as one and broke production the same
 * day: pointili.online redirects to www.pointili.online, so every owner asking
 * for /owner was sent to `app.www.pointili.online` — a name with no DNS record.
 * Any alias does it, and a preview deployment or a bare IP would too.
 *
 * NEXT_PUBLIC_APP_URL is the answer when it is set: the business side has ONE
 * address and it is configured, not guessed. Without it, strip a leading `www.`
 * before prefixing, so at least the common alias resolves.
 */
export function appHost(host: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      // Keep the request's port in development, where it is not the default.
      const port = host.includes(":") ? `:${host.split(":")[1]}` : "";
      const target = new URL(configured).host;
      return target.includes(":") ? target : `${target}${port.replace(":443", "").replace(":80", "")}`;
    } catch {
      /* misconfigured → fall through to the derivation below */
    }
  }
  if (host.startsWith("app.")) return host;
  return `app.${host.replace(/^www\./, "")}`;
}

/**
 * Where the business side lives, for the links that may have to cross origins
 * (the marketing page's "Espace café" and "Créer mon compte").
 *
 * Returns a RELATIVE path when the split is off, so the link stays on whatever
 * host is serving. It used to derive `app.<something>` unconditionally, which
 * meant the landing page advertised a domain that did not exist — the link was
 * dead for every visitor until the DNS was created.
 *
 * Pass the same paths you would use in a same-origin link (`/owner/login`).
 */
export function appUrl(path = "/"): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (!explicit) return path; // split off → one host, ordinary internal link
  return `${explicit.replace(/\/$/, "")}${path}`;
}
