import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { appHost, isAppHost, isPassthrough } from "@/lib/hosts";

/**
 * Two jobs, in this order: put the request on the right HOST, then refresh the
 * owner's Supabase session.
 *
 * ── the host split ────────────────────────────────────────────────────────
 * pointili.online is the customer side and app.pointili.online is the business
 * side. This runs on every navigation so each screen has exactly one address:
 * asking for the other host's routes never yields a second working URL. Two
 * addresses for one page splits bookmarks and search results and quietly
 * doubles the surface anyone has to reason about.
 *
 * Asymmetric on purpose: /owner on the apex REDIRECTS, so an existing bookmark
 * still lands. A customer route on the business host 404s instead, because a
 * redirect in that direction cannot be made loop-proof — see crossHost.
 *
 * ── the session refresh ───────────────────────────────────────────────────
 * Access tokens are short-lived. Without this, a signed-in owner silently drops
 * to the login screen when their token expires mid-shift — during service, at
 * the till. getUser() revalidates against the auth server and the refreshed
 * cookies are written onto the response.
 *
 * Next 16: this file is `proxy.ts`, not `middleware.ts` (renamed), and it runs
 * on the Node runtime — edge is not supported here.
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  const path = request.nextUrl.pathname;

  /* ── 1. host routing ──────────────────────────────────────────────── */

  /*
    NO path rewriting — only enforcement of which host serves what.

    Serving the till at app.pointili.online/ (rewriting "/" onto "/owner") read
    nicer and broke three things: revalidatePath could not reach across the
    boundary (the router keys on the public path, the cache on the internal
    one), redirect() resolved against Next's own origin and threw a new owner
    onto the DINER's 404, and pinning the forwarded-host headers to fix that
    broke Supabase auth. Three bugs for a shorter URL is the wrong trade.

    So the paths are real on both hosts. What the split still buys — and the
    reason it exists — is cookie isolation: nothing here sets a cookie Domain,
    so a diner session and an owner session can no longer see each other.

    ── THE SPLIT IS OPT-IN ────────────────────────────────────────────────
    It only runs when NEXT_PUBLIC_APP_URL names the business host. This is not
    caution for its own sake: shipping it unconditionally took the owner app
    down in production the same day. The apex redirects to www, appHost() blindly
    prefixed "app.", and every owner asking for /owner was sent to
    app.www.pointili.online — a name with no DNS record.

    Infrastructure that does not exist yet must not be able to break the site.
    With the variable unset the app serves everything from one host, exactly as
    it did before the split; setting it turns the split on.
  */
  const businessOrigin = process.env.NEXT_PUBLIC_APP_URL;

  if (businessOrigin && !isPassthrough(path)) {
    const business = path === "/owner" || path.startsWith("/owner/")
      || path === "/admin" || path.startsWith("/admin/");

    /*
      307/302, never 308/301. A permanent redirect is cached by the browser and
      outlives the fix — if the target host is wrong or its DNS is not live yet,
      a permanent redirect strands that visitor even after the deploy that
      repairs it. Make these permanent only once both hosts have been stable.
    */
    if (isAppHost(host)) {
      // Bare app host → the till.
      if (path === "/") {
        const to = new URL(request.url);
        to.pathname = "/owner";
        return NextResponse.redirect(to, 307);
      }
      /*
        Customer routes do not exist on the business host — 404, not a redirect
        to the apex.

        A redirect here cannot be made reliable: Next rewrites the Location
        header of a proxy response whenever the target matches its own
        normalised origin, and in development app.localhost and localhost share
        that origin. The header came back as a bare `/moi`, which is not a hop to
        the other host — it is an infinite loop. A 404 is honest and loop-proof,
        and nothing ever sends a customer here: every printed QR points at the
        apex.
      */
      if (!business) {
        return new NextResponse(null, { status: 404 });
      }
    } else if (business) {
      // The customer side does not serve the business routes. This direction IS
      // a real cross-origin hop, so the header survives.
      return crossHost(request, appHost(host ?? ""));
    }
  }

  /* ── 2. session refresh ───────────────────────────────────────────── */
  return withSession(request, (req) => NextResponse.next({ request: req }));
}

/**
 * A redirect to the SAME path on a DIFFERENT host, with an absolute Location.
 *
 * Deliberately not NextResponse.redirect(). Two things conspire against it:
 * the target is built from the Host header (mutating `new URL(request.url)`
 * does nothing, because request.url already carries Next's normalised origin),
 * and NextResponse.redirect then serialises a same-origin target RELATIVELY —
 * against that same normalised origin. On app.localhost the result was
 * `location: /moi`, which is not a hop to the other host, it is an infinite
 * loop. Writing the header ourselves is the only way to guarantee the hop.
 */
function crossHost(request: NextRequest, targetHost: string): NextResponse {
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (targetHost.split(":")[0] === "localhost" ? "http" : "https");
  const target = `${proto}://${targetHost}${request.nextUrl.pathname}${request.nextUrl.search}`;
  return new NextResponse(null, { status: 307, headers: { location: target } });
}

/**
 * Refresh the owner's Supabase cookies onto whatever response we already chose.
 *
 * Takes a BUILDER, not a response. When Supabase rotates the token it must be
 * written onto the request too, and the response rebuilt from it, so the render
 * downstream sees the new cookies rather than the ones being replaced. Building
 * a plain next() at that moment would silently discard the host rewrite — which
 * is exactly what happened: the console rendered with no session at all
 * (UNAUTHORISED) the moment a refresh landed mid-navigation.
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
          response.cookies.set(name, value, options);
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
    Everything except static assets: the host split has to see every navigation,
    not just the owner tree. Excluding _next and files with an extension keeps
    the hot path off the proxy.
  */
  matcher: ["/((?!_next/static|_next/image|.*\\.[\\w]+$).*)"],
};
