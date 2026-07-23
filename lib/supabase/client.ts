import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client (anon key).
 * Used for public reads only (café + reward list). Per §06, the browser
 * never decides anything of value — mutations go through server routes/RPCs.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
