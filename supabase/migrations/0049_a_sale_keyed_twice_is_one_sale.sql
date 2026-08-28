/*
  A SALE THE TILL SENT TWICE IS STILL ONE SALE.

  The failure this closes is the mirror of 0047's, and it is the one I said
  would break first in production.

  credit_points is atomic, so the ledger is never half-written. What is not
  covered is the ANSWER: the app runs in Francfort and this database is in
  Zurich, and a commit whose response is lost looks — from the till — exactly
  like a credit that never happened. lib/db returns { ok:false, reason } on any
  transport error, the till prints it, and the cashier does the only sensible
  thing in front of a waiting customer: taps it again.

  The customer is then credited twice, and nobody finds out, because there is
  nothing in the ledger that says the two rows were meant to be one. The shop
  pays for it in coffees. The same class of bug already cost a real customer a
  code they had paid points for (0047); this is the direction where the SHOP
  loses instead.

  ── WHY A KEY AND NOT "SAME AMOUNT, SAME MINUTE" ──────────────────────────

  Because two identical sales are ORDINARY. Two customers order the same coffee
  at the same price a minute apart, or one person buys a second round. Any rule
  that de-duplicates on (customer, amount, time) eventually refuses a real sale
  and tells a cashier their till is broken — which is worse than the bug, since
  the bug at least fails in a direction the shop can audit.

  So the till mints a key when the cashier COMPOSES the act (the amount keyed,
  before anyone is identified) and reuses that same key while that act is on
  screen. A retry of a failed sale carries the key it already had. Composing a
  new sale mints a new one. The database therefore never has to guess what the
  cashier meant: it is told.

  ── SHAPE ─────────────────────────────────────────────────────────────────

  op_key is NULLABLE and the parameter DEFAULTS to null, so every existing
  caller keeps working unchanged — /[slug]/rejoindre credits a welcome bonus
  with no key and must keep doing so. A null key simply opts out, exactly as
  today. Nothing is retro-fitted onto the 357 rows already written.

  The unique index carries `reason` because ONE credit legitimately writes TWO
  rows — the one-time welcome bonus and the earn — and they share the act that
  produced them. Without `reason` the welcome row would collide with its own
  earn row and the first keyed credit of every new customer would fail.

  The early return is what actually makes a replay safe; the index is the
  backstop for anything that reaches the table another way. Both are here on
  purpose: the check is inside the advisory lock this function already takes,
  so two tills replaying the same key at once serialise behind it.
*/

alter table points_ledger add column if not exists op_key uuid;

comment on column points_ledger.op_key is
  'Idempotency key for one composed till act. Null = unkeyed (pre-0049 callers).';

/*
  Partial: only keyed rows are constrained, so the existing history — and every
  unkeyed caller — is untouched.
*/
create unique index if not exists points_ledger_op_key_idx
  on points_ledger (business_id, op_key, reason)
  where op_key is not null;

/*
  Rebuilt from pg_get_functiondef, not from the 0027 source file, so that the
  rounding note, the welcome-bonus rule and the multiplier are the ones actually
  running. Copying an older copy of a function is how a reward ladder silently
  reverted once already.
*/
create or replace function credit_points(
  p_business_id uuid,
  p_phone       text,
  p_amount_tnd  numeric,
  p_op_key      uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_prog    loyalty_programs%rowtype;
  v_mult    numeric;
  v_earn    numeric;
  v_welcome integer := 0;
  v_prior   points_ledger%rowtype;
begin
  -- serialise writes for this (café, phone): two tills crediting the same
  -- customer at once must not both decide "no welcome bonus yet".
  perform pg_advisory_xact_lock(hashtext(p_business_id::text || ':' || p_phone));

  /*
    ── THE REPLAY ──────────────────────────────────────────────────────────
    Inside the lock, so a second attempt that arrives while the first is still
    committing waits for it and then sees it, rather than racing it.

    It answers with the SAME shape as the original — the caller cannot tell the
    difference and must not have to. `replayed` is there for the till to say
    something honest ("déjà enregistré") instead of counting it again, and for
    anyone reading a log later.
  */
  if p_op_key is not null then
    select * into v_prior from points_ledger
    where business_id = p_business_id and op_key = p_op_key and reason = 'earn';
    if found then
      return jsonb_build_object(
        'ok', true,
        'earned', v_prior.delta,
        /* Whether the welcome bonus rode along with THIS act, not whether the
           customer has ever had one — the till reports what this sale did. */
        'welcome', coalesce((
          select w.delta from points_ledger w
          where w.business_id = p_business_id and w.op_key = p_op_key
            and w.reason = 'welcome'
        ), 0),
        'balance', pointili_balance(p_business_id, p_phone),
        'multiplier', pointili_active_multiplier(p_business_id, 'points'),
        'replayed', true
      );
    end if;
  end if;

  if not cafe_is_live(p_business_id) then
    return jsonb_build_object('ok', false, 'reason', 'café indisponible');
  end if;

  select * into v_prog from loyalty_programs where business_id = p_business_id;
  if not found or not v_prog.active then
    return jsonb_build_object('ok', false, 'reason', 'programme de fidélité inactif');
  end if;

  -- one-time welcome bonus per (café, phone)
  if v_prog.welcome_points > 0 and not exists (
    select 1 from points_ledger
    where business_id = p_business_id and customer_phone = p_phone and reason = 'welcome'
  ) then
    v_welcome := v_prog.welcome_points;
    insert into points_ledger(business_id, customer_phone, delta, reason, op_key)
    values (p_business_id, p_phone, v_welcome, 'welcome', p_op_key);
  end if;

  v_mult := pointili_active_multiplier(p_business_id, 'points');

  /*
    round(_, 2), not floor. The rounding is at the HUNDREDTH — two decimals of
    a point, on an amount the cashier keyed to at most two decimals of a dinar —
    so it is only ever protecting against numeric dust, never taking a cut.
  */
  v_earn := round(p_amount_tnd * v_prog.points_per_tnd * v_mult, 2);

  if v_earn > 0 then
    insert into points_ledger(business_id, customer_phone, delta, reason, amount_tnd, op_key)
    values (p_business_id, p_phone, v_earn, 'earn', p_amount_tnd, p_op_key);
  end if;

  return jsonb_build_object(
    'ok', true,
    'earned', v_earn,
    'welcome', v_welcome,
    'balance', pointili_balance(p_business_id, p_phone),
    'multiplier', v_mult,
    'replayed', false
  );
end;
$function$;

/*
  The 3-argument signature is GONE, not kept alongside.

  Postgres would happily hold both credit_points(uuid,text,numeric) and the new
  four-argument one as overloads, and PostgREST would then have to choose
  between them by the argument names it was sent. A caller that forgot the key
  would silently resolve to the unprotected one — which is precisely the bug
  this migration exists to remove, still reachable, and now invisible.

  Dropping it means a stale caller fails loudly instead. The default on p_op_key
  keeps every legitimate 3-argument call working through the new function.
*/
drop function if exists credit_points(uuid, text, numeric);

revoke all on function credit_points(uuid, text, numeric, uuid)
  from public, anon, authenticated;

/*
  AND GRANT IT BACK TO service_role — dropping a function drops its grants.

  This cost the live till several minutes. `drop function` took the old
  signature's `grant execute ... to service_role` with it, the revoke above
  removed the PUBLIC path that was masking the loss, and every call from the app
  came back "permission denied for function credit_points". Adding points and
  stamps failed in a real shop, mid-service.

  0036 taught that a revoke must name PUBLIC explicitly. This is the other half
  of the same lesson: after a DROP, the grant is not still there to be revoked
  from — it has to be re-issued. The assertion below is what makes that
  impossible to forget again, because the symptom appears at the till and not
  here.
*/
grant execute on function credit_points(uuid, text, numeric, uuid) to service_role;

do $$
begin
  if not exists (
    select 1 from information_schema.role_routine_grants
    where routine_name = 'credit_points'
      and grantee = 'service_role' and privilege_type = 'EXECUTE'
  ) then
    raise exception '0049: service_role cannot execute credit_points — the till is dead';
  end if;
  if exists (
    select 1 from information_schema.role_routine_grants
    where routine_name = 'credit_points'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then
    raise exception '0049: credit_points is reachable without the service key';
  end if;
end $$;

/*
  PostgREST caches the function signatures it will accept, so a dropped and
  recreated function is "not found" — or, worse, the old shape — until it is
  told. Without this the app keeps failing after a successful migration, which
  reads as a bad migration rather than a stale cache.
*/
notify pgrst, 'reload schema';

/*
  Prove it, here, rather than trusting the reasoning above.

  Two credits with one key must move the balance once; two credits with two keys
  must move it twice. Both are asserted, because a de-duplicator that swallows
  everything would pass the first check and quietly break the shop.
*/
do $$
declare
  v_shop  uuid;
  v_phone text := '+21690000049';
  v_key   uuid := gen_random_uuid();
  v_bal0  numeric;
  v_bal1  numeric;
  v_bal2  numeric;
  v_r     jsonb;
begin
  select id into v_shop from businesses
  where status = 'active' order by created_at limit 1;
  if v_shop is null then
    raise notice '0049: no active shop to verify against — skipped';
    return;
  end if;

  v_bal0 := pointili_balance(v_shop, v_phone);

  v_r := credit_points(v_shop, v_phone, 10, v_key);
  if not (v_r->>'ok')::boolean then
    raise notice '0049: shop refused the probe (%), skipped', v_r->>'reason';
    return;
  end if;
  v_bal1 := pointili_balance(v_shop, v_phone);

  -- the same act, sent again exactly as a retrying till would send it
  v_r := credit_points(v_shop, v_phone, 10, v_key);
  if (v_r->>'replayed') is distinct from 'true' then
    raise exception '0049: a repeated key was not reported as a replay: %', v_r;
  end if;
  v_bal2 := pointili_balance(v_shop, v_phone);

  if v_bal2 <> v_bal1 then
    raise exception '0049: the same key was counted twice (% then %)', v_bal1, v_bal2;
  end if;

  -- and a genuinely separate sale must still go through
  v_r := credit_points(v_shop, v_phone, 10, gen_random_uuid());
  if pointili_balance(v_shop, v_phone) <= v_bal2 then
    raise exception '0049: a new key was swallowed as a duplicate';
  end if;

  -- leave nothing behind: this is the production ledger
  delete from points_ledger where business_id = v_shop and customer_phone = v_phone;
  if pointili_balance(v_shop, v_phone) <> 0 then
    raise exception '0049: probe rows survived cleanup';
  end if;
end $$;
