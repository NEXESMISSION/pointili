import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { appHost, isAppHost, isPassthrough, toInternal, toPublic } from "@/lib/hosts";

/**
 * Two jobs, in this order: put the request on the right HOST, then refresh the
 * owner's Supabase session.
 *
 * ── the host split ────────────────────────────────────────────────────────
 * pointili.online is the customer side and app.pointili.online is the business
 * side. This runs on every navigation so each screen has exactly one address:
 * asking for the other host's routes gets a permanent redirect, never a second
 * working URL. Two addresses for one page splits bookmarks and search results
 * and quietly doubles the surface anyone has to reason about.
 *
 * Redirects, not 404s. A 404 would strand anyone holding an existing /owner
 * bookmark, and a 308 tells crawlers which URL is canonical just as well.
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
  const url = request.nextUrl;
  const host = request.headers.get("host");
  const path = url.pathname;

  /* ── 1. host routing ──────────────────────────────────────────────── */

  if (!isPassthrough(path)) {
    if (isAppHost(host)) {
      // The business side. Public paths here are short (/analyses), so map them
      // onto the internal tree (/owner/analyses) without changing the URL bar.
      const rewritten = new URL(url);
      rewritten.pathname = toInternal(path);
      return withSession(request, (req) => NextResponse.rewrite(rewritten, { request: req }));
    }

    // The customer side. The business routes do not live here.
    if (path === "/owner" || path.startsWith("/owner/") || path === "/admin" || path.startsWith("/admin/")) {
      const target = new URL(url);
      target.host = appHost(host ?? target.host);
      target.pathname = toPublic(path);
      return NextResponse.redirect(target, 308);
    }
  }

  /* ── 2. session refresh ───────────────────────────────────────────── */
  return withSession(request, (req) => NextResponse.next({ request: req }));
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
