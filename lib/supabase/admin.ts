import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — BYPASSES RLS.
 *
 * The golden rule (§03/§06): all value-affecting mutations (points, spins,
 * redemptions) run here, inside trusted server routes/RPCs. NEVER import this
 * into a client component. `import "server-only"` makes that a build error.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
