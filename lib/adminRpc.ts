import "server-only";
import { requireElevatedSuperAdmin } from "./auth/owner";
import { createAdminClient } from "./supabase/admin";

/**
 * ── THE ONLY WAY TO CALL AN admin_* FUNCTION ──────────────────────────────
 *
 * Every one of those functions authorises on `p_actor`, a uuid the CALLER
 * supplies, and re-checks is_super(p_actor) in Postgres. 0036 closed the half
 * of that flaw which mattered — EXECUTE is revoked from public and anon, so
 * only the service key reaches them — and left a note asking a future
 * migration to "derive the actor internally" from auth.uid() instead.
 *
 * THAT NOTE IS NOT ACTIONABLE AS WRITTEN, and following it would take the
 * console down. Every call site reaches these functions through the SERVICE
 * ROLE (createAdminClient), and under the service role auth.uid() is NULL — so
 * `is_super(auth.uid())` is false for every caller, including the real
 * operator. Deriving the actor internally would first require moving all of
 * this onto the user's own session client, which means re-granting EXECUTE to
 * `authenticated` and re-testing every admin path against RLS. That is a real
 * piece of work, it is not a comment change, and it is not obviously an
 * improvement over what this file does.
 *
 * Because what is actually left is not a hole an attacker can reach. It is a
 * MISTAKE WE COULD MAKE: two lines at every call site — resolve the operator,
 * then pass their id — repeated eleven times, where forgetting the first or
 * mistyping the second is privilege escalation and reviews as ordinary code.
 *
 * So the two lines become one function. The actor is injected here, from the
 * session, after the gate; `args` cannot carry a p_actor of its own (the type
 * forbids it, and it is overwritten regardless). There is no way left to call
 * an admin RPC without being checked, and no way to be checked as somebody
 * else.
 */
export async function adminRpc<T>(
  fn: string,
  args: Record<string, unknown> & { p_actor?: never } = {},
): Promise<T | null> {
  /* The gate. Throws UNAUTHORISED / FORBIDDEN, which every caller already
     translates for its own surface. */
  const me = await requireElevatedSuperAdmin();

  const db = createAdminClient();
  const { data, error } = await db.rpc(fn, { ...args, p_actor: me.id });
  if (error) return null;
  return (data ?? null) as T | null;
}

/**
 * The same, for a write whose FAILURE the caller must be able to see.
 *
 * The reads above collapse an error to null because a console panel showing
 * nothing is a correct rendering of "could not read". A write cannot do that:
 * "did the plan change?" has to be answerable, so the error comes back.
 */
export async function adminWrite<T>(
  fn: string,
  args: Record<string, unknown> & { p_actor?: never } = {},
): Promise<{ data: T | null; error: unknown }> {
  const me = await requireElevatedSuperAdmin();
  const db = createAdminClient();
  const { data, error } = await db.rpc(fn, { ...args, p_actor: me.id });
  return { data: (data ?? null) as T | null, error };
}
