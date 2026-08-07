import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DINER_COOKIE } from "@/lib/auth/diner";
import { signSession, verifySession } from "@/lib/auth/crypto";

/**
 * One job: refresh the owner's Supabase session on every navigation.
 *
 * Access tokens are short-lived. Without this, a signed-in owner silently drops
 * to the login screen when their token expires mid-shift — during service, at
 * the till. getUser() revalidates against the auth server and the refreshed
 * cookies are written onto the response.
 *
 * ── there used to be a second job ─────────────────────────────────────────
 * A host split: pointili.online for customers, app.pointili.online for the
 * till. It is gone. One domain serves everything, and the file tree is the
 * whole routing story — /owner and /admin are just paths.
 *
 * What the split was buying was incidental cookie isolation: two hosts meant
 * the diner cookie and the owner session could not see each other. On one
 * origin that is no longer free, so the isolation is now explicit and lives in
 * two places instead — see the comment at app/page.tsx over the diner bounce,
 * and keep every currentDiner() caller inside /moi, /cartes and /[slug].
 *
 * Next 16: this file is `proxy.ts`, not `middleware.ts` (renamed), and it runs
 * on the Node runtime — edge is not supported here.
 */
export async function proxy(request: NextRequest) {
  /* A URL that cannot match a café, but obviously means one. Cheap, and first:
     there is no point refreshing a session for a request we are redirecting. */
  const tidy = tidyUrl(request);
  if (tidy) return NextResponse.redirect(tidy, 308);

  const res = await withSession(request, (req) => NextResponse.next({ request: req }));
  rollDinerSession(request, res);
  return res;
}

/**
 * ── A 404 THAT IS REALLY A TYPO ───────────────────────────────────────────
 *
 * Café slugs are lower case and [a-z0-9-] — the RPC that creates one enforces
 * it. So a path with a capital in it, or with a full stop stuck to the end,
 * cannot be a café that exists, and 404 is a lie about what went wrong.
 *
 * Both happen constantly and neither is the customer's fault:
 *
 *   · iOS capitalises the first letter of anything typed into a field, so a
 *     number read off a poster arrives as /CafeElManar.
 *   · Every messaging app on earth swallows the punctuation after a link:
 *     "passe par pointili.online/cafe-el-manar." linkifies WITH the full stop.
 *   · A copied link often arrives wrapped in a bracket or a comma.
 *
 * Fixed here rather than in the page, because this is the only place that sees
 * the whole URL — a layout knows its own segment and nothing about the rest of
 * the path, so a redirect from there would drop /boutique on the floor.
 *
 * 308, not 307: the tidy URL is the canonical one and a browser may remember
 * that. Returns null — the common case — when there is nothing to fix.
 */
function tidyUrl(request: NextRequest): URL | null {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/_next") || pathname.startsWith("/api")) return null;

  /* trailing punctuation a link picked up on its way here, and the trailing
     slash that turns /cafe-el-manar/ into a segment that matches nothing */
  let fixed = pathname.replace(/[.,;:!?)\]}'"«»]+$/g, "");
  if (fixed.length > 1) fixed = fixed.replace(/\/+$/, "");
  /* Case. Only the path — a query string can hold a code, and codes are upper
     case (see /rejoindre?c=…). */
  if (/[A-Z]/.test(fixed)) fixed = fixed.toLowerCase();

  if (fixed === pathname || fixed === "") return null;

  const url = request.nextUrl.clone();
  url.pathname = fixed;
  return url;
}

/**
 * KEEP A CUSTOMER SIGNED IN FOR AS LONG AS THEY KEEP COMING BACK.
 *
 * The diner cookie was written once, at signup, and never touched again: 90
 * days from the day they joined, not 90 days from their last coffee. Somebody
 * who scans the QR every week was still logged out three months later, and what
 * the product then showed them was a signup form — which is why "it added my
 * card again" is a thing people say. Nothing was ever added twice; the app just
 * stopped recognising them and had only one screen for that.
 *
 * So the token is re-signed once it is past its first third. It costs one HMAC
 * — no database, no network — and it means the session dies only after 30 quiet
 * days, which is a real absence rather than a calendar accident.
 *
 * Deliberately in the proxy: a Server Component cannot write a cookie, and this
 * has to happen on plain page views, not only on the rare form submit.
 */
function rollDinerSession(request: NextRequest, response: NextResponse) {
  const token = request.cookies.get(DINER_COOKIE)?.value;
  if (!token) return;

  const phone = verifySession(token);
  if (!phone) return; // expired or forged — let the app send them to sign in

  const age = sessionAge(token);
  if (age === null || age < ROLL_AFTER_S) return;

  response.cookies.set(DINER_COOKIE, signSession(phone), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 90 * 86400,
  });
}

/** Seconds since the token was issued, or null if it cannot be read. */
function sessionAge(token: string): number | null {
  try {
    const body = token.split(".")[0];
    const { iat } = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    ) as { iat?: number };
    return typeof iat === "number" ? Math.floor(Date.now() / 1000) - iat : null;
  } catch {
    return null;
  }
}

/** A third of the 90-day life. Re-signing on every request would be pointless
    churn; waiting until the last day would miss anyone who visits monthly. */
const ROLL_AFTER_S = 30 * 86400;

/**
 * Refresh the owner's Supabase cookies onto whatever response we already chose.
 *
 * Takes a BUILDER, not a response. When Supabase rotates the token it must be
 * written onto the request too, and the response rebuilt from it, so the render
 * downstream sees the new cookies rather than the ones being replaced. Building
 * a plain next() at that moment would silently discard everything already
 * decided about the response — which is exactly what happened once: the console
 * rendered with no session at all (UNAUTHORISED) the moment a refresh landed
 * mid-navigation.
 */
async function withSession(
  request: NextRequest,
  build: (req: NextRequest) => NextResponse,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return build(request); // not configured → nothing to refresh

  /*
    ── DO NOT PAY FOR A REFRESH NOBODY NEEDS ──────────────────────────────

    getUser() is a NETWORK CALL to the auth server, and this ran on every
    navigation in the product — including every screen of the customer app,
    which has no Supabase session at all. Measured from here, that round trip
    is 90–230ms, spent before the page it is delaying even begins to render.

    Two ways out, both of which keep the reason this file exists (an access
    token that dies mid-shift must be rotated for us, because a Server
    Component cannot write cookies):

      · No auth cookie → there is no session to refresh. Every diner screen.
      · A token with plenty of life left → nothing to rotate yet. The page's
        own currentOwner() still verifies it against the auth server, so
        skipping here removes a duplicate check, not a check.

    Anything unparseable falls through to the refresh. The failure mode of
    guessing wrong is an owner thrown out at the till, so the guess is only
    ever made when the answer is unambiguous.
  */
  if (!needsRefresh(request)) return build(request);

  let response = build(request);
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = build(request);
        for (const { name, value, options } of cookiesToSet) {
          /*
            A DELETION MUST CARRY AN EXPIRES, NOT ONLY A MAX-AGE.

            This is the auto-logout. Supabase clears the auth cookie by writing
            an empty value with `maxAge: 0` and NO `expires`
            (@supabase/ssr removeCookieOptions). Next mirrors whatever we set
            here into the `x-middleware-set-cookie` header, then re-parses that
            header back into its own mutable jar — and the re-parse runs
            `compact()`, which copies a key only `if (t[key])`. Both `maxAge: 0`
            and `value: ""` are FALSY, so both are silently dropped.

            On a redirect — and a dead session on /owner is always a redirect to
            /owner/login — Next then re-emits that stripped cookie alongside
            ours. The response carries two Set-Cookie headers for one name:

              sb-…-auth-token=; Path=/; Max-Age=0; SameSite=lax   ← ours
              sb-…-auth-token=; Path=/; SameSite=lax              ← the re-emit

            The second has no expiry, so per RFC 6265 it wins and RESURRECTS the
            cookie as an empty session cookie. The deletion becomes a creation.

            It is then self-sustaining: the next request carries an empty value,
            Supabase finds no session to remove and issues no Set-Cookie at all,
            so nothing ever cleans it up. Combined with hasOwnerCookie() — which
            matches on name — every launch of the installed app went
            "/" → /owner → /owner/login, forever.

            `expires` is a Date, and a Date is truthy, so compact() keeps it and
            the re-emitted duplicate still deletes.
          */
          if (value === "") {
            response.cookies.set(name, "", { ...options, maxAge: 0, expires: new Date(0) });
          } else {
            response.cookies.set(name, value, options);
          }
        }
      },
    },
  });

  // Do not remove: this call is what performs the refresh.
  await supabase.auth.getUser();

  return response;
}

/** How much life left in the access token still counts as "not yet". */
const REFRESH_WINDOW_S = 300;

/**
 * Is there a session here that is close enough to expiry to be worth a round
 * trip? Defaults to TRUE for anything it cannot read — see the note above.
 */
function needsRefresh(request: NextRequest): boolean {
  /* @supabase/ssr chunks a long cookie as `<name>.0`, `<name>.1`, … and the
     value is the concatenation in index order. */
  const parts = request.cookies
    .getAll()
    .filter(
      (c) =>
        c.name.startsWith("sb-") &&
        c.name.includes("auth-token") &&
        !c.name.includes("code-verifier") &&
        c.value.length > 0,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  if (parts.length === 0) return false; // no session — the whole customer app

  try {
    const raw = parts.map((c) => c.value).join("");
    const json = raw.startsWith("base64-")
      ? Buffer.from(raw.slice(7), "base64").toString("utf8")
      : decodeURIComponent(raw);
    const token = JSON.parse(json)?.access_token;
    const claims = JSON.parse(
      Buffer.from(String(token).split(".")[1], "base64").toString("utf8"),
    );
    const left = Number(claims.exp) - Math.floor(Date.now() / 1000);
    return !Number.isFinite(left) || left < REFRESH_WINDOW_S;
  } catch {
    return true;
  }
}

export const config = {
  /*
    Every navigation, so no owner screen can render on a stale token. Excluding
    _next and files with an extension keeps the hot path off the proxy.
  */
  matcher: ["/((?!_next/static|_next/image|.*\\.[\\w]+$).*)"],
};
