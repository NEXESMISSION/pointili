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

// 4. read every diner's PIN hash
r = await anon.from("accounts").select("phone, pin_hash");
t("read accounts.pin_hash", !!r.error || (r.data?.length ?? 0) === 0, r.error?.code ?? `${r.data?.length ?? 0} rows`);

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

const { data: after } = await svc.from("businesses").select("name").eq("id", victim.id).maybeSingle();
t("café B survived intact", after?.name === victim.name, after?.name ?? "GONE");

await svc.auth.admin.deleteUser(made.user.id);

console.log(`\n${held} blocked, ${broke} exploitable`);
process.exit(broke ? 1 : 0);
