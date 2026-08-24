/**
 * WHAT A SCANNED QR IS ALLOWED TO MEAN.
 *
 * A QR is a string a stranger controls. It can hold any URL at all, and a
 * scanner that hands what it read to the browser is a one-tap redirect to
 * anywhere — printed on a sticker that anybody can stick to a table in a café.
 *
 * So the text is never followed. It is parsed for ONE thing: a first path
 * segment shaped like a shop slug. The caller builds "/slug" on this origin
 * from the return value, which means the worst a hostile QR can do is send
 * somebody to a page of ours that does not exist.
 *
 * THE HOST IS IGNORED, DELIBERATELY, rather than checked against ours. A shop
 * that printed its code against the apex instead of www, or against an older
 * domain, still works — and checking it would buy nothing, because the
 * destination is built here either way and never taken from the string.
 *
 * Pure and dependency-free so it can be unit-tested outside a browser; the
 * parsing rules ARE the security boundary and deserve a table of cases rather
 * than a screenshot (scripts/test-diner-ui.mjs).
 */

/** Same shape the server enforces: 3–40 chars, no leading or trailing hyphen. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/**
 * Real routes are not shops.
 *
 * A QR pointing at one of these would "add a card" that is really a redirect to
 * the sign-in screen or the legal pages — confusing rather than dangerous, and
 * worth one line to refuse. Kept in step with the reserved list the slug
 * checker uses when a shop picks its address.
 */
const RESERVED = new Set([
  "moi",
  "cartes",
  "owner",
  "admin",
  "api",
  "early",
  "conditions",
  "confidentialite",
]);

export function slugFrom(text: string): string | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;

  let path = raw;
  try {
    /* A full URL: take its path, and nothing else from it. Anything that is not
       a URL throws and falls through to the bare-string case — somebody's QR
       that holds only a slug. */
    path = new URL(raw).pathname;
  } catch {
    /* not a URL */
  }

  const first = path.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
  if (!SLUG_RE.test(first) || RESERVED.has(first)) return null;
  return first;
}
