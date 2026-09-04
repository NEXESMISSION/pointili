/**
 * A suspended café must not be able to put value on a card BY ANY ROUTE.
 *
 *   node scripts/test-suspension.mjs
 *
 * Suspension is the platform's only leverage over a shop that has not paid, and
 * for a while it was a convention rather than a state: three RPCs honoured
 * cafe_is_live() and four ignored it. The till's « Créditer » refused while
 * « Corriger », one button below it, cheerfully added the same points.
 *
 * Every route that can move value is asserted here, including the one that made
 * the whole thing meaningless. Do not let these go green by deletion.
 */
import { createClient } from "@supabase/supabase-js";
import { connect, env } from "./db.mjs";

const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = await connect();
let held = 0, broke = 0;
const t = (n, ok, d) => { if (ok) held++; else broke++; console.log(`${ok ? "BLOCKED " : "LEAKED  "} ${n}${d ? ` — ${d}` : ""}`); };

const { rows: [op] } = await sql.query(`select id from profiles where role='super_admin' limit 1`);
const slug = `susp-${Date.now()}`;
const phone = `+216${String(Date.now()).slice(-8)}`;
const { rows: [cafe] } = await sql.query(
  `insert into businesses (owner_id,name,slug,status,primary_color,plan,plan_expires_at)
   values ($1,'Susp',$2,'active','#5b3fd1','pro', now()+interval '30 days') returning id`, [op.id, slug]);
await sql.query(`insert into loyalty_programs (business_id) values ($1) on conflict do nothing`, [cafe.id]);
await sql.query(`insert into accounts (phone,pin_hash,name) values ($1,'x','Susp') on conflict do nothing`, [phone]);

// join + earn while it is still live
await svc.rpc("enroll_diner", { p_business_id: cafe.id, p_phone: phone });
await svc.rpc("credit_points", { p_business_id: cafe.id, p_phone: phone, p_amount_tnd: 50 });
const bal = async () => (await sql.query(`select coalesce(sum(delta),0) b from points_ledger where business_id=$1 and customer_phone=$2`, [cafe.id, phone])).rows[0].b;
const before = await bal();
console.log(`live: balance ${before}\n`);

// now switch it off
/*
  AND CHECK THAT IT ACTUALLY WENT DARK.

  The result of this call was ignored. When it failed — a dropped connection is
  enough — the café stayed live, every probe below succeeded exactly as it
  should on a working shop, and the suite reported FOUR LEAKS in the suspension
  boundary. A security suite that announces a breach because its own setup
  quietly failed is one that gets ignored the day it is right.
*/
const { error: suspendErr } = await svc.rpc("admin_set_suspended", {
  p_actor: op.id, p_business_id: cafe.id, p_suspended: true, p_reason: "verify",
});
if (suspendErr) throw new Error(`could not suspend the fixture: ${suspendErr.message}`);
const wentDark = (await sql.query(`select cafe_is_live($1) l`, [cafe.id])).rows[0].l;
console.log(`suspended → cafe_is_live = ${wentDark}
`);
if (wentDark) throw new Error("the fixture is still live — nothing below would mean anything");

const bad = (r) => !r || r.ok === false;

t("credit at the till", bad((await svc.rpc("credit_points", { p_business_id: cafe.id, p_phone: phone, p_amount_tnd: 99 })).data));
t("THE WORKAROUND — Corriger / adjust", bad((await svc.rpc("owner_adjust_points", { p_business_id: cafe.id, p_phone: phone, p_delta: 5000 })).data));
t("set stamps by hand", bad((await svc.rpc("owner_set_stamps", { p_business_id: cafe.id, p_phone: phone, p_count: 9 })).data));
t("add a stamp", bad((await svc.rpc("add_stamp", { p_business_id: cafe.id, p_phone: phone })).data));
t("collect a reward code", bad((await svc.rpc("claim_code", { p_business_id: cafe.id, p_code: "ZZZZZZ" })).data));
const { data: newCode } = await svc.rpc("enroll_diner", { p_business_id: cafe.id, p_phone: `+21699${String(Date.now()).slice(-6)}` });
t("recruit a NEW customer", newCode === null, String(newCode));

const after = await bal();
t("balance is untouched", String(after) === String(before), `${before} → ${after}`);

// an existing member can still READ their card (points are conserved)
const { data: existing } = await svc.rpc("enroll_diner", { p_business_id: cafe.id, p_phone: phone });
console.log(`\nexisting member still resolvable (so they can read "tes points sont conservés"): ${existing ? "yes" : "NO"}`);

await sql.query(`delete from businesses where id=$1`, [cafe.id]);
await sql.query(`delete from accounts where phone=$1`, [phone]);
console.log(`\n${held} blocked, ${broke} leaked`);
await sql.end();
process.exit(broke ? 1 : 0);
