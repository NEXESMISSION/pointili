-- ===========================================================================
-- 0047 · THE CONSOLE AND THE SHOP COUNT THE SAME REDEMPTIONS
--
-- 0040 gave the console a redemption count per reward and called it, correctly,
-- the most actionable fact about a shop's programme: "jamais prise" against a
-- reward nobody has ever chosen. It computed that count by matching the LEDGER
-- AMOUNT to the reward's price:
--
--     count(*) from points_ledger
--      where reason = 'redeem' and abs(delta) = r.points_cost
--
-- which is the only join available from the ledger alone, and is wrong in two
-- ordinary situations:
--
--   · TWO REWARDS SHARE A PRICE. Every redemption of either is counted for
--     both, so a reward nobody has ever taken reports the other one's sales.
--   · A PRICE CHANGED. Redemptions made at the old price stop matching, or
--     start matching a different reward entirely.
--
-- Both are live on this database right now. Café El Manar's console page says
-- "Thé à la menthe · prise 1 fois" for a reward that has NEVER been redeemed —
-- it is borrowing a 40-point redemption that belongs to something else — and
-- inflates the cappuccino from two to three.
--
-- ── AND THE SHOP'S OWN SCREEN ALREADY DISAGREED ───────────────────────────
--
-- 0042 gave the owner the same list, counted from loyalty_redemptions.reward_id,
-- which records WHICH reward was chosen rather than inferring it from an
-- amount. So the operator and the café were reading different numbers for the
-- same fact, and the operator — the one who rings up to say "your brunch never
-- sells" — had the wrong one.
--
-- This is the console adopting the owner's query. `pending` comes with it: the
-- shop has seen codes-in-circulation since 0042 and the console had no word
-- for it.
--
-- ── WHY THE WHOLE FUNCTION IS RE-DECLARED ─────────────────────────────────
--
-- Postgres cannot patch part of a body. The rest of this file is
-- admin_cafe_detail EXACTLY as it exists in the database right now — taken from
-- pg_get_functiondef, not retyped from 0040 — with only the rewards block
-- changed. 0041's header explains why that distinction matters: writing this
-- migration from an older copy of a function is how the create_cafe rewrite
-- silently reverted a reward ladder, and the fix is to copy from what is
-- RUNNING rather than from what was written.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.admin_cafe_detail(p_actor uuid, p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when not is_super(p_actor) then jsonb_build_object('ok', false)
  else (
    select jsonb_build_object(
      'ok', true,

      /* ── identity and status ── */
      'shop', jsonb_build_object(
        'id',              b.id,
        'name',            b.name,
        'slug',            b.slug,
        'status',          b.status,
        'businessType',    b.business_type,
        'primaryColor',    b.primary_color,
        'logoUrl',         b.logo_url,
        'phone',           b.phone,
        'plan',            b.plan,
        'planExpiresAt',   b.plan_expires_at,
        'suspendedAt',     b.suspended_at,
        'suspendedReason', b.suspended_reason,
        'live',            cafe_is_live(b.id),
        'createdAt',       b.created_at,
        'ownerId',         b.owner_id,
        'ownerEmail',      p.email
      ),

      /* ── how the programme is configured ──
         The operator is asked "why did my client only get 3 points?" more often
         than anything else, and the answer is always one of these numbers. They
         were readable nowhere in the console. */
      'program', coalesce((
        select jsonb_build_object(
          'active',           lp.active,
          'pointsPerTnd',     lp.points_per_tnd,
          'welcomePoints',    lp.welcome_points,
          'redeemExpiryHours',lp.redeem_expiry_hours,
          'stampsEnabled',    lp.stamps_enabled,
          'stampsRequired',   lp.stamps_required,
          'stampReward',      lp.stamp_reward
        ) from loyalty_programs lp where lp.business_id = b.id
      ), 'null'::jsonb),

      /* ── the numbers ──
         `spent` as a positive figure: points_ledger stores redemptions as a
         negative delta, and a panel reading "-420 points dépensés" makes the
         reader do the sign in their head every time. */
      'totals', jsonb_build_object(
        'customers',    (select count(distinct customer_phone) from points_ledger l where l.business_id = b.id),
        'issued',       (select coalesce(sum(delta), 0) from points_ledger l where l.business_id = b.id and l.delta > 0),
        'spent',        (select coalesce(-sum(delta), 0) from points_ledger l where l.business_id = b.id and l.delta < 0),
        'entries',      (select count(*) from points_ledger l where l.business_id = b.id),
        'revenueTnd',   (select coalesce(sum(amount_tnd), 0) from points_ledger l where l.business_id = b.id and l.reason = 'earn'),
        'lastActivity', (select max(created_at) from points_ledger l where l.business_id = b.id),
        'newCards30d',  (select count(*) from diner_cafes d
                          where d.business_id = b.id and d.first_played_at > now() - interval '30 days'),
        'active30d',    (select count(distinct customer_phone) from points_ledger l
                          where l.business_id = b.id and l.created_at > now() - interval '30 days'),
        'earns30d',     (select count(*) from points_ledger l
                          where l.business_id = b.id and l.reason = 'earn'
                            and l.created_at > now() - interval '30 days')
      ),

      /* ── thirty days of till activity, zero-filled ──
         generate_series, not group-by-day: a chart that silently drops empty
         days draws a shop that closed for a fortnight as a shop that was busy
         throughout. The gap IS the information here. */
      'daily', coalesce((
        select jsonb_agg(jsonb_build_object('day', d::date, 'n', c) order by d)
        from generate_series(current_date - 29, current_date, interval '1 day') d
        left join lateral (
          select count(*) as c from points_ledger l
           where l.business_id = b.id
             and l.reason = 'earn'
             and l.created_at >= d and l.created_at < d + interval '1 day'
        ) x on true
      ), '[]'::jsonb),

      /* ── the reward ladder, WITH how often each one is actually taken ──
         An owner asking "is my programme working?" is asking this and nothing
         else. A reward nobody has ever redeemed is the most actionable fact
         about a shop.

         COUNTED BY reward_id, not by price — see the header of 0047. */
      'rewards', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',      r.id,
          'label',   r.label,
          'cost',    r.points_cost,
          'active',  r.active,
          'taken',   (select count(*) from loyalty_redemptions c
                       where c.reward_id = r.id and c.status = 'claimed'),
          /* Issued and not yet collected: a customer holding one has a booked
             reason to come back, which is a different fact from a reward that
             has been redeemed and finished with. The owner's own screen has
             shown this since 0042; the console had no word for it. */
          'pending', (select count(*) from loyalty_redemptions c
                       where c.reward_id = r.id and c.status = 'pending')
        ) order by r.position)
        from loyalty_rewards r where r.business_id = b.id
      ), '[]'::jsonb),

      /* ── the last twenty things that happened at the till ──
         Masked to the last three digits: enough to match a row to the person on
         the phone, not enough to be a customer list. See the header. */
      'ledger', coalesce((
        select jsonb_agg(e order by e->>'at' desc) from (
          select jsonb_build_object(
            'at',     l.created_at,
            'who',    '•••' || right(l.customer_phone, 3),
            'delta',  l.delta,
            'reason', l.reason,
            'tnd',    l.amount_tnd
          ) as e
          from points_ledger l
          where l.business_id = b.id
          order by l.created_at desc
          limit 20
        ) y
      ), '[]'::jsonb),

      /* ── what the platform has said to them ── */
      'notices', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', n.id, 'kind', n.kind, 'message', n.message,
          'createdAt', n.created_at, 'expiresAt', n.expires_at, 'active', n.active
        ) order by n.created_at desc)
        from platform_notices n
        where n.business_id = b.id
      ), '[]'::jsonb),

      /* ── what they have paid, and what we decided ── */
      'renewals', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'offer', r.offer, 'months', r.months, 'amount', r.amount,
          'method', r.method, 'status', r.status, 'note', r.note,
          'createdAt', r.created_at, 'decidedAt', r.decided_at, 'decidedNote', r.decided_note
        ) order by r.created_at desc)
        from renewal_requests r
        where r.business_id = b.id
      ), '[]'::jsonb),

      /* ── and what WE did to them ──
         The half of the record the console never showed. "Who suspended this
         shop, and when?" has always been answerable in the database and never
         on a screen. */
      'audit', coalesce((
        select jsonb_agg(e order by e->>'at' desc) from (
          select jsonb_build_object(
            'at', a.created_at, 'actor', a.actor_email,
            'action', a.action, 'detail', a.detail
          ) as e
          from admin_audit a
          where a.business_id = b.id
          order by a.created_at desc
          limit 30
        ) z
      ), '[]'::jsonb)
    )
    from businesses b
    left join profiles p on p.id = b.owner_id
    where b.id = p_id
  ) end;
$function$;


-- Re-declaring drops nothing, but a CREATE OR REPLACE re-grants EXECUTE to
-- PUBLIC on some Postgres versions, and 0036 runs before this file. Say it
-- again, with `public` first and by name.
revoke all on function admin_cafe_detail(uuid, uuid) from public, anon, authenticated;
grant execute on function admin_cafe_detail(uuid, uuid) to service_role;

/*
  Prove the two counts now agree, in the database, at migration time.

  A console that quietly reports a different number from the shop's own screen
  is exactly what this migration exists to end, so the agreement is asserted
  rather than assumed. Compared per reward, over every café that has any.
*/
do $$
declare
  bad text;
begin
  select string_agg(x.label, ', ') into bad
  from (
    select r.label
      from loyalty_rewards r
      join businesses b on b.id = r.business_id
     cross join lateral (
       select jsonb_array_elements(
         admin_cafe_detail((select id from profiles where role = 'super_admin' limit 1), b.id) -> 'rewards'
       ) as j
     ) d
     where (d.j->>'id')::uuid = r.id
       and (d.j->>'taken')::bigint <> (
         select count(*) from loyalty_redemptions c
          where c.reward_id = r.id and c.status = 'claimed'
       )
  ) x;

  if bad is not null then
    raise exception 'admin_cafe_detail still disagrees with loyalty_redemptions for: %', bad;
  end if;
end $$;
