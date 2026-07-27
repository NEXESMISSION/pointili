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
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  /*
    Only ever redirect within the app — never to a caller-supplied host.
    These are PUBLIC paths: this callback is reached on app.pointili.online, where
    the till is "/" and the proxy maps it onto /owner. Sending "/owner" here would
    be double-prefixed to /owner/owner.
  */
  const nextPath = url.searchParams.get("next") ?? "/";
  const safeNext = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNext, url.origin));
    }
  }

  // Expired or reused link → back to login with a hint rather than a dead end.
  return NextResponse.redirect(new URL("/login?lien=expire", url.origin));
}
