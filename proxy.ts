import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  return withSession(request, (req) => NextResponse.next({ request: req }));
}

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

export const config = {
  /*
    Every navigation, so no owner screen can render on a stale token. Excluding
    _next and files with an extension keeps the hot path off the proxy.
  */
  matcher: ["/((?!_next/static|_next/image|.*\\.[\\w]+$).*)"],
};
