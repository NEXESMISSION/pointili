/*
  TWO COUNTERS, ONE CUSTOMER, THE SAME SECOND.

  A Pointili account is a phone number, and it is deliberately the SAME account
  everywhere — that is the whole pitch: one card, every shop. So the moment the
  product has two customers in two cafés, two tills can credit one phone at the
  same instant, and nothing in the app coordinates them. This suite asks whether
  that is safe.

  It is a real question and not a theoretical one, because every write here goes
  through `pg_advisory_xact_lock`. A lock is a promise about what CANNOT happen
  at once, and its key decides who waits for whom:

      credit_points   hashtext(business_id || ':'      || phone)
      add_stamp       hashtext(business_id || ':stamp:'|| phone)

  The business id is IN the key, so two different shops take two different locks
  and never block each other — correct, and fast. Had the key been the phone
  alone, every café in the country would have queued behind one customer.

  What is asserted here, then, is the pair of properties that key is supposed to
  buy:

    1. INDEPENDENCE — concurrent sales at two shops both land, in full, and
       neither shop's balance is disturbed by the other's.
    2. NO LOST UPDATE — concurrent sales at the SAME shop are serialised, so
       ten simultaneous credits are ten credits, not "the last one wins".
    3. IDEMPOTENCE UNDER RACE — the same op_key fired many times at once is ONE
       sale, which is the till's double-tap protection doing its job when the
       two taps overlap rather than follow one another.

  DB-only on purpose: this is about the ledger, not about a screen, and driving
  a browser would add timing noise to the one measurement that is about timing.
*/
import { createClient } from "@supabase/supabase-js";
import { env } from "./db.mjs";
import { ensureTestCafe, dropTestCafe } from "./fixture.mjs";
import { randomUUID } from "node:crypto";

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const SLUG_A = "raceone";
const SLUG_B = "racetwo";
const LOCAL = "29517402";
const NORM = `+216${LOCAL}`;

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/* Anything an earlier crashed run left behind would be counted as points this
   run never credited. */
const wipe = async () => {
  await admin.from("points_ledger").delete().eq("customer_phone", NORM);
  for (const tbl of ["loyalty_stamps", "diner_cafes", "accounts", "diner_streaks", "pin_attempts"]) {
    await admin.from(tbl).delete().eq("phone", NORM);
  }
};

const balance = async (businessId) => {
  const { data, error } = await admin
    .from("points_ledger")
    .select("delta")
    .eq("business_id", businessId)
    .eq("customer_phone", NORM);
  /*
    A failed read is NOT a balance of zero.

    Every one of these assertions is "the number is exactly N", and a swallowed
    error answering 0 would report a race that never happened — the harness
    inventing a data-loss bug is worse than the bug.
  */
  if (error) throw new Error(`ledger read failed: ${error.message}`);
  return (data ?? []).reduce((sum, r) => sum + Number(r.delta), 0);
};

const cafeA = await ensureTestCafe({ slug: SLUG_A });
const cafeB = await ensureTestCafe({ slug: SLUG_B });
await wipe();

try {
  /* ── 1. Two shops, at once ──────────────────────────────────────────────
     Interleaved rather than "all of A then all of B", so the two lock keys are
     genuinely contended at the same moment. */
  const shots = [];
  for (let i = 0; i < 8; i++) {
    shots.push(admin.rpc("credit_points", { p_business_id: cafeA.id, p_phone: NORM, p_amount_tnd: 3 }));
    shots.push(admin.rpc("credit_points", { p_business_id: cafeB.id, p_phone: NORM, p_amount_tnd: 5 }));
  }
  const answers = await Promise.all(shots);
  const errs = answers.filter((r) => r.error || r.data?.ok === false);
  check(
    "16 sales at two counters at once: not one is refused",
    errs.length === 0,
    errs.length ? JSON.stringify(errs[0].error ?? errs[0].data) : "all 16 ok",
  );

  /*
    The welcome bonus lands once per shop, on that shop's first sale, so it is
    part of the expected total rather than noise to subtract.
  */
  const welcomeA = answers.reduce((n, r) => n + Number(r.data?.welcome ?? 0), 0);
  const balA = await balance(cafeA.id);
  const balB = await balance(cafeB.id);
  const wA = answers.filter((r, i) => i % 2 === 0).reduce((n, r) => n + Number(r.data?.welcome ?? 0), 0);
  const wB = answers.filter((r, i) => i % 2 === 1).reduce((n, r) => n + Number(r.data?.welcome ?? 0), 0);

  check("shop A kept every dinar of its own eight sales", balA === 8 * 3 + wA, `${balA} (expected ${8 * 3 + wA})`);
  check("shop B kept every dinar of its own eight sales", balB === 8 * 5 + wB, `${balB} (expected ${8 * 5 + wB})`);
  check(
    "...and neither shop's balance leaked into the other",
    balA !== balB && welcomeA === wA + wB,
    `A=${balA} B=${balB}`,
  );

  /* ── 2. One shop, ten tills, one instant ────────────────────────────────
     The lost-update classic: read-modify-write without a lock loses all but
     one. Ten unkeyed credits must be ten credits. */
  await wipe();
  const many = await Promise.all(
    Array.from({ length: 10 }, () =>
      admin.rpc("credit_points", { p_business_id: cafeA.id, p_phone: NORM, p_amount_tnd: 2 }),
    ),
  );
  const manyErrs = many.filter((r) => r.error || r.data?.ok === false);
  const wMany = many.reduce((n, r) => n + Number(r.data?.welcome ?? 0), 0);
  const balMany = await balance(cafeA.id);
  check("ten simultaneous sales at one counter all land", manyErrs.length === 0,
    manyErrs.length ? JSON.stringify(manyErrs[0].error ?? manyErrs[0].data) : "all 10 ok");
  check("...and none is lost to the others", balMany === 10 * 2 + wMany, `${balMany} (expected ${10 * 2 + wMany})`);

  /* ── 3. The same sale, fired eight times at once ────────────────────────
     0049 gave credit_points an op_key so a cashier's double tap is one sale.
     That guard is only worth having if it holds when the taps OVERLAP — a
     unique index refuses the duplicates, and the replay path has to answer
     "already done" rather than surface an error to the till. */
  await wipe();
  const key = randomUUID();
  const twice = await Promise.all(
    Array.from({ length: 8 }, () =>
      admin.rpc("credit_points", {
        p_business_id: cafeA.id,
        p_phone: NORM,
        p_amount_tnd: 9,
        p_op_key: key,
      }),
    ),
  );
  const twiceErrs = twice.filter((r) => r.error || r.data?.ok === false);
  /*
    FROM THE SALE THAT HAPPENED, not from all eight answers.

    A replay echoes the ORIGINAL sale's figures — that is the point of it, so
    the till shows the same receipt whichever tap it hears back from. Summing
    `welcome` across the eight therefore counts one 10 d bonus eight times and
    expects a balance of 89 where the truth is 19. The suite reported the
    replay guard as broken while the guard was working perfectly; the
    `replayed` tally below is the honest measure of how many sales occurred.
  */
  const wKey = Number(twice.find((r) => r.data?.replayed !== true)?.data?.welcome ?? 0);
  const balKey = await balance(cafeA.id);
  check("the same keyed sale fired eight times at once errors on none of them",
    twiceErrs.length === 0,
    twiceErrs.length ? JSON.stringify(twiceErrs[0].error ?? twiceErrs[0].data) : "all 8 answered ok");
  check("...and the customer was charged for exactly one of them",
    balKey === 9 + wKey, `${balKey} (expected ${9 + wKey})`);
  check("...with the extras naming themselves as replays",
    twice.filter((r) => r.data?.replayed === true).length === 7,
    `${twice.filter((r) => r.data?.replayed === true).length} of 8 marked replayed`);

  /* ── 4. Points and a stamp, at the same instant ─────────────────────────
     Their lock keys differ by the ':stamp:' segment, so they do NOT wait for
     each other — which is exactly what the till relies on when it gives both
     in one act. Neither may disturb the other's count. */
  await wipe();
  await admin
    .from("loyalty_programs")
    .update({ stamps_enabled: true, stamps_required: 6, stamp_reward: "Café offert (race)" })
    .eq("business_id", cafeA.id);
  const mixed = await Promise.all([
    ...Array.from({ length: 5 }, () =>
      admin.rpc("credit_points", { p_business_id: cafeA.id, p_phone: NORM, p_amount_tnd: 4 }),
    ),
    ...Array.from({ length: 5 }, () =>
      admin.rpc("add_stamp", { p_business_id: cafeA.id, p_phone: NORM, p_delta: 1 }),
    ),
  ]);
  const mixedErrs = mixed.filter((r) => r.error || r.data?.ok === false);
  const wMixed = mixed.reduce((n, r) => n + Number(r.data?.welcome ?? 0), 0);
  const balMixed = await balance(cafeA.id);
  const { data: stampRow, error: stampErr } = await admin
    .from("loyalty_stamps")
    .select("count")
    .eq("business_id", cafeA.id)
    .eq("phone", NORM)
    .maybeSingle();
  if (stampErr) throw new Error(`stamp read failed: ${stampErr.message}`);
  check("five sales and five stamps at once: none refused", mixedErrs.length === 0,
    mixedErrs.length ? JSON.stringify(mixedErrs[0].error ?? mixedErrs[0].data) : "all 10 ok");
  check("...the dinars are all there", balMixed === 5 * 4 + wMixed, `${balMixed} (expected ${5 * 4 + wMixed})`);
  check("...and so are the stamps", Number(stampRow?.count ?? -1) === 5, `${stampRow?.count ?? "no row"} of 5`);
} finally {
  await wipe();
  await dropTestCafe(SLUG_A);
  await dropTestCafe(SLUG_B);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} race checks passed`);
if (failed.length) {
  console.log(failed.map((f) => `  FAILED: ${f.name}`).join("\n"));
  process.exit(1);
}
