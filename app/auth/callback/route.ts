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
  // only ever redirect within the app — never to a caller-supplied host
  const nextPath = url.searchParams.get("next") ?? "/owner";
  const safeNext = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/owner";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNext, url.origin));
    }
  }

  // Expired or reused link → back to login with a hint rather than a dead end.
  return NextResponse.redirect(new URL("/owner/login?lien=expire", url.origin));
}
