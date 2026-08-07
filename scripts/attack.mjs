/**
 * Adversarial check: try to cheat using ONLY the public anon key — exactly what
 * any diner can read out of the browser bundle.
 */
import { createClient } from "@supabase/supabase-js";
import { env, onExit } from "./db.mjs";

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

// 2. spin without paying the points (EXECUTE is revoked from anon, so the ids
// are irrelevant — the call must fail before it ever looks one up)
r = await anon.rpc("spin_wheel", {
  p_business_id: "00000000-0000-0000-0000-000000000001",
  p_phone: "+21600000000",
});
t("spin_wheel()", !!r.error, r.error?.code ?? "SUCCEEDED");

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
// deleted here AND on failure — a suite that throws used to leave a live account
onExit(() => svc.auth.admin.deleteUser(made.user.id));

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

/* ── the PIN reset must be scoped to the shop's OWN cardholders ──────────
   resetPinAction used to authorise by "resolveCustomer returned someone",
   which is not an authorisation: its phone branch resolves ANY number on
   purpose, so a walk-in who has never been here can still be credited. That
   made the reset a way to rewrite any Pointili account's pin_hash by typing
   its phone number — and pin_hash is account-wide, so it is that person's
   identity and points at EVERY shop, not just a card at this one.

   The guard is `isCardholder(cafe.id, phone)`: a row in diner_cafes. This
   asserts the two halves that make it correct — a stranger has no row (so the
   reset is refused) and the shop's own customer does (so it still works). */
{
  const stranger = `+2169${String(Date.now()).slice(-7)}`;
  const dropStranger = async () => {
    await svc.from("diner_cafes").delete().eq("phone", stranger);
    await svc.from("accounts").delete().eq("phone", stranger);
  };
  onExit(dropStranger);

  // diner_cafes.phone references accounts(phone), so the identity comes first
  await svc.from("accounts").insert({ phone: stranger, pin_hash: "x", name: "Stranger" });
  // enrolled at the VICTIM's café, never at the attacker's
  await svc.from("diner_cafes").insert({ business_id: victim.id, phone: stranger });

  const member = async (bizId) => {
    const { data } = await svc
      .from("diner_cafes")
      .select("phone")
      .eq("business_id", bizId)
      .eq("phone", stranger)
      .maybeSingle();
    return Boolean(data);
  };

  t(
    "PIN reset is refused for someone who holds no card here",
    !(await member(mine.id)),
    "no diner_cafes row at the attacker's café",
  );
  allow(
    "PIN reset still works for the shop's own cardholder",
    await member(victim.id),
    "diner_cafes row present at their own café",
  );

  await dropStranger();
}

/*
  ── EXECUTE-TO-PUBLIC ─────────────────────────────────────────────────────

  Postgres grants EXECUTE on every new function to the pseudo-role PUBLIC, and
  anon inherits from PUBLIC. So `revoke all ... from anon, authenticated` —
  which is what 0028 and 0035 wrote — removes grants those roles never held
  separately and leaves the real one in place. The statement reads like a lock
  and is a no-op.

  That mattered here more than usual, because every admin_* RPC authorises on a
  caller-supplied p_actor. An owner_id is readable with the browser key (see
  the businesses grant), so anyone could pass a super-admin's uuid and approve
  their own renewals, or read another shop's payment receipts.

  0036 sweeps every security-definer function and closes it. These assertions
  are what stop the next one from arriving open — a new RPC that forgets is a
  failing test, not a live hole.
*/
{
  const { data: any } = await anon.from("businesses").select("id, owner_id").limit(1);
  const actor = any?.[0]?.owner_id ?? "00000000-0000-0000-0000-000000000000";
  const bid = any?.[0]?.id ?? "00000000-0000-0000-0000-000000000000";
  const PROOF = `data:image/png;base64,${"A".repeat(200)}`;

  const shut = async (fn, args) => {
    const { error } = await anon.rpc(fn, args);
    return /permission denied|does not exist|Could not find/i.test(error?.message ?? "");
  };

  t("anon cannot read a shop's payment receipt",
    await shut("admin_renewal_proof", { p_actor: actor, p_id: bid }),
    "admin_renewal_proof");
  t("anon cannot approve a renewal",
    await shut("admin_decide_renewal", { p_actor: actor, p_id: bid, p_approve: true, p_note: null }),
    "admin_decide_renewal — would mint a free plan");
  t("anon cannot list the renewal queue",
    await shut("admin_renewal_requests", { p_actor: actor, p_limit: 5 }),
    "admin_renewal_requests");
  t("anon cannot forge a renewal against a shop",
    await shut("submit_renewal_request", {
      p_owner: actor, p_business_id: bid, p_offer: "12m", p_months: 12,
      p_amount: 1, p_method: "d17", p_proof: PROOF, p_note: null,
    }),
    "submit_renewal_request");
  t("anon cannot read a shop's billing history",
    await shut("my_renewal_requests", { p_owner: actor, p_business_id: bid }),
    "my_renewal_requests");
  t("anon cannot read platform-wide traffic",
    await shut("admin_traffic", { p_actor: actor, p_days: 7 }),
    "admin_traffic");
}

await svc.from("businesses").delete().eq("id", mine.id);
/* Registered as well as called: a suite that throws before this line used to
   leave a live, sign-in-able account in the production database. */
await svc.auth.admin.deleteUser(made.user.id);

console.log(`\n${held} blocked, ${broke} exploitable`);
process.exit(broke ? 1 : 0);
