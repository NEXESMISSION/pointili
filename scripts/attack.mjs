/**
 * Adversarial check: try to cheat using ONLY the public anon key — exactly what
 * any diner can read out of the browser bundle.
 */
import { createClient } from "@supabase/supabase-js";
import { env } from "./db.mjs";

const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
let held = 0;
let broke = 0;
const t = (name, blocked, detail) => {
  if (blocked) held++;
  else broke++;
  console.log(`${blocked ? "BLOCKED " : "EXPLOIT "} ${name}${detail ? ` — ${detail}` : ""}`);
};

/* A few assertions here are the opposite shape: something that MUST still work.
   Locking a hole by breaking the legitimate path is not a fix, so those are
   checked too — but printing them as "BLOCKED" reads as the very failure they
   are ruling out. */
const allow = (name, worked, detail) => {
  if (worked) held++;
  else broke++;
  console.log(`${worked ? "ALLOWED " : "BROKEN  "} ${name}${detail ? ` — ${detail}` : ""}`);
};

// 1. mint myself a million points
let r = await anon.rpc("credit_points", {
  p_business_id: "00000000-0000-0000-0000-000000000001",
  p_phone: "+21600000000",
  p_amount_tnd: 1000000,
});
t("credit_points(1,000,000)", !!r.error, r.error?.code ?? "SUCCEEDED");

// 2. spin for free, ignoring cooldown (EXECUTE is revoked from anon, so the
// slug is irrelevant — the call must fail before it ever looks one up)
r = await anon.rpc("play_game", { p_slug: "any", p_phone: "+21600000000", p_device: "x" });
t("play_game()", !!r.error, r.error?.code ?? "SUCCEEDED");

// 3. redeem without paying
r = await anon.rpc("redeem_at_counter", {
  p_business_id: "00000000-0000-0000-0000-000000000001",
  p_phone: "+21600000000",
  p_reward_id: "00000000-0000-0000-0000-000000000002",
});
t("redeem_at_counter()", !!r.error, r.error?.code ?? "SUCCEEDED");

// 4. read every diner's PIN hash — and their account code, which is now the
//    thing you show at any counter on the platform. A column-level grant slip
//    would leave it world-readable while a pin_hash-only probe stayed green.
r = await anon.from("accounts").select("phone, pin_hash, code");
t("read accounts.pin_hash + code", !!r.error || (r.data?.length ?? 0) === 0, r.error?.code ?? `${r.data?.length ?? 0} rows`);

// 4b. resolve ANY account from its 4-char code, straight from the browser key.
//     The code is platform-wide, so this one call would be a whole-platform
//     customer directory.
r = await anon.rpc("account_by_code", { p_code: "AAAA" });
t("account_by_code()", !!r.error, r.error?.code ?? "SUCCEEDED");

// 4c. mint an account (and a code) without going through signup
r = await anon.rpc("create_account", {
  p_phone: "+21600000009", p_pin_hash: "x", p_name: "attacker",
});
t("create_account()", !!r.error, r.error?.code ?? "SUCCEEDED");

// 5. write points straight into the ledger
r = await anon.from("points_ledger").insert({
  business_id: "00000000-0000-0000-0000-000000000001",
  customer_phone: "+21600000000", delta: 99999, reason: "earn",
});
t("insert into points_ledger", !!r.error, r.error?.code ?? "SUCCEEDED");

// 6. read another café's ledger
r = await anon.from("points_ledger").select("*");
t("read points_ledger", !!r.error || (r.data?.length ?? 0) === 0, r.error?.code ?? `${r.data?.length ?? 0} rows`);

/* ── Cross-tenant: can a signed-in owner touch someone ELSE's café? ──────────
   This is the whole multi-tenant promise. `authenticated` holds table-level
   INSERT/UPDATE/DELETE on the café tables (it must, for owners to edit their
   own), so RLS is the ONLY thing standing between café A and café B.          */
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const attackerEmail = `attacker-${Date.now()}@example.com`;
const pw = "Test-12345678";
const { data: made } = await svc.auth.admin.createUser({
  email: attackerEmail,
  password: pw,
  email_confirm: true,
});

// Any real café the attacker doesn't own works as the victim — RLS is what has
// to hold, not the café's identity.
const { data: victim } = await svc
  .from("businesses")
  .select("id, name")
  .order("created_at")
  .limit(1)
  .single();

/*
  Give the attacker a café of their OWN. The self-grant tests below are about
  what an owner may change on a business they legitimately own — that is exactly
  where the platform's own columns (plan, suspension) used to be writable.
*/
const mineSlug = `attack-${Date.now()}`;
const { data: mineRow } = await svc
  .from("businesses")
  .insert({ owner_id: made.user.id, name: "Café Attaquant", slug: mineSlug, status: "active",
            plan: "trial", plan_expires_at: new Date(Date.now() + 864e5).toISOString() })
  .select("id, plan")
  .single();
const mine = mineRow ?? { id: "00000000-0000-0000-0000-000000000000" };

const evil = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
await evil.auth.signInWithPassword({ email: attackerEmail, password: pw });

const denied = (x) => !!x.error || (x.data?.length ?? 0) === 0;
const detail = (x) => x.error?.code ?? `${x.data?.length ?? 0} rows`;

let x = await evil.from("businesses").update({ name: "PWNED" }).eq("id", victim.id).select("id");
t("owner A renames café B", denied(x), detail(x));

x = await evil.from("loyalty_rewards").update({ points_cost: 0 }).eq("business_id", victim.id).select("id");
t("owner A zeroes café B's prices", denied(x), detail(x));

x = await evil.from("games").update({ config: { rigged: true } }).eq("business_id", victim.id).select("id");
t("owner A rigs café B's wheel odds", denied(x), detail(x));

x = await evil.from("points_ledger").select("id").eq("business_id", victim.id);
t("owner A reads café B's ledger", denied(x), detail(x));

x = await evil.from("businesses").delete().eq("id", victim.id).select("id");
t("owner A deletes café B", denied(x), detail(x));

/*
  PRIVILEGE ESCALATION — the one that ended the platform.

  `grant select, update on profiles to authenticated` was a TABLE grant with no
  column list, and the only policy on it filters WHICH ROW, never which column.
  So any owner could PATCH their own row to role='super_admin', and from there
  pointili_owns_business() returned true for EVERY business — read every ledger,
  rewrite every reward, and DELETE every café through a FOR ALL policy.

  Signup is open, so the attacker is "anyone with an e-mail address".
  These four assertions are the fence. Do not let them go green by deletion.
*/
x = await evil.from("profiles").update({ role: "super_admin" }).eq("id", made.user.id).select("id");
t("owner promotes SELF to super_admin", denied(x), detail(x));

const { data: roleNow } = await svc.from("profiles").select("role").eq("id", made.user.id).maybeSingle();
t("their role is still 'owner'", roleNow?.role !== "super_admin", roleNow?.role ?? "?");

x = await evil.from("businesses").update({ plan: "free", plan_expires_at: null }).eq("id", mine.id).select("id");
t("owner self-grants an unlimited plan", denied(x), detail(x));

x = await evil.from("businesses").update({ suspended_at: null, suspended_reason: null }).eq("id", mine.id).select("id");
t("owner lifts their own suspension", denied(x), detail(x));

x = await evil.from("businesses").update({ owner_id: made.user.id }).eq("id", victim.id).select("id");
t("owner seizes café B by rewriting owner_id", denied(x), detail(x));

// …but the columns an owner legitimately owns must still work, or the settings
// screen is broken and the fix above is worse than the hole.
x = await evil.from("businesses").update({ name: "Mon Café" }).eq("id", mine.id).select("id");
allow("owner can still rename their own café", !denied(x), detail(x));

const { data: after } = await svc.from("businesses").select("name").eq("id", victim.id).maybeSingle();
t("café B survived intact", after?.name === victim.name, after?.name ?? "GONE");

await svc.from("businesses").delete().eq("id", mine.id);
await svc.auth.admin.deleteUser(made.user.id);

console.log(`\n${held} blocked, ${broke} exploitable`);
process.exit(broke ? 1 : 0);
