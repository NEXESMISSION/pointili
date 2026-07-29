import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * The landing pad for every Supabase e-mail link (signup confirmation and
 * password reset). Supabase redirects here with a PKCE `?code=`; exchanging it
 * signs the browser in, then we forward to `next`.
 *
 * Without this route those links dangled on "/" with an unused code — the
 * confirm click looked like it did nothing.
 */

/**
 * Is this a path we are willing to send a freshly-signed-in browser to?
 *
 * "starts with / and not //" was the old test and it was not enough. Browsers
 * normalise a backslash to a slash in the authority position, so `/\evil.test`
 * leaves as a protocol-relative URL to another host — an open redirect reached
 * from an e-mail link, which is the most credible phishing hop this app has to
 * offer. Control characters are refused for the same reason: a tab or a newline
 * inside the value can split it back apart in a parser downstream.
 *
 * Written as a scan rather than a regex on purpose — a character class of
 * literal control codes is invisible in an editor and the next person to touch
 * it cannot see what it matches.
 */
function isSafeNext(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path[1] === "/" || path[1] === "\\") return false;
  for (const ch of path) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  /*
    The default is /owner, and it has to be: the only people who ever reach this
    route are shop owners confirming an e-mail address. "/" would drop them on
    the page that sells them the product they just bought — and worse, on a
    device holding a diner cookie it can bounce to someone else's wallet.

    /owner then resolves itself: the owner layout sends a signed-out visitor to
    /owner/login, and an owner with no café yet to /owner/nouveau (or /admin for
    an operator). (This used to say "/" because the callback was served on
    app.pointili.online, where the proxy mapped "/" onto /owner. That host, and
    that mapping, are gone.)
  */
  const nextPath = url.searchParams.get("next") ?? "/owner";
  const safeNext = isSafeNext(nextPath) ? nextPath : "/owner";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNext, url.origin));
    }
  }

  /*
    Expired or reused link → the login screen with a hint.

    This said "/login" for months and there has never been a /login route: the
    only one is /owner/login, and "login" is a reserved slug, so every owner who
    clicked a stale confirmation link got a 404 instead of an explanation.
  */
  return NextResponse.redirect(new URL("/owner/login?lien=expire", url.origin));
}
