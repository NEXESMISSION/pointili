-- ===========================================================================
-- 0042 · THE OWNER CAN SEE THEIR OWN DAY, AND WHAT THEIR REWARDS COST
--
-- Two things the person PAYING for this product cannot find out anywhere in it.
--
-- ── 1 · TODAY ─────────────────────────────────────────────────────────────
-- The till is a terminal: type a number, press a button, next customer. It says
-- nothing about the shift it is in the middle of. So an owner standing at their
-- own counter at six in the evening cannot answer "how did today go?" without
-- opening the analytics screen, choosing a period, and doing arithmetic on a
-- 7-day window — and the answer they wanted was four numbers about the last
-- eight hours.
--
-- It is worse on a laptop, which is where this landed as a design problem: the
-- till is a 680px column of two small cards centred in a 1900px screen, with
-- about two thirds of the page carrying nothing at all. There was no shortage
-- of room to say how the day was going. There was no query that could say it.
--
-- ── 2 · WHICH REWARDS ANYONE ACTUALLY TAKES ───────────────────────────────
-- 0040 gave the CONSOLE a redemption count per reward — "jamais prise" against
-- a reward nobody has ever chosen — and called it, correctly, the most
-- actionable fact about a shop's programme. The shop itself still cannot see
-- it. The owner picks four rewards and four prices during setup and then has no
-- feedback of any kind, forever: no screen in the owner app knows how many
-- times anything has been redeemed.
--
-- An operator can now tell a café that their brunch at 300 points has never
-- been taken. The café cannot work that out on their own, which is the wrong
-- way round for the one decision that makes a loyalty programme work.
--
-- ── WHY 'earn' AND NOT sum(delta) ─────────────────────────────────────────
-- Takings are summed from amount_tnd on 'earn' rows only. A welcome bonus, a
-- correction and a redemption all have deltas and none of them is money that
-- crossed the counter; summing points and calling it revenue is how a dashboard
-- ends up flattering a shop that had a quiet day.
-- ===========================================================================

/**
 * The shift, as four numbers and a tail.
 *
 * "Today" is the calendar day in the SHOP's timezone, not the last 24 hours: an
 * owner asking how today went means the day they are standing in. Africa/Tunis
 * is hardcoded because this product is sold in one country and a per-shop
 * timezone column nobody sets is a worse lie than a correct constant. When that
 * stops being true, this is the one place it changes.
 *
 * `yesterday` rides along so the number can be READ rather than merely stated:
 * 240 TND means nothing on its own and a great deal beside 90.
 */
create or replace function owner_today(p_business_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with bounds as (
    select
      date_trunc('day', now() at time zone 'Africa/Tunis') at time zone 'Africa/Tunis' as today_start,
      (date_trunc('day', now() at time zone 'Africa/Tunis') - interval '1 day') at time zone 'Africa/Tunis' as yday_start
  )
  select jsonb_build_object(
    'takings',    (select coalesce(sum(l.amount_tnd), 0) from points_ledger l, bounds
                    where l.business_id = p_business_id and l.reason = 'earn'
                      and l.created_at >= bounds.today_start),
    'visits',     (select count(*) from points_ledger l, bounds
                    where l.business_id = p_business_id and l.reason = 'earn'
                      and l.created_at >= bounds.today_start),
    'points',     (select coalesce(sum(l.delta), 0) from points_ledger l, bounds
                    where l.business_id = p_business_id and l.delta > 0
                      and l.created_at >= bounds.today_start),
    'newCards',   (select count(*) from diner_cafes d, bounds
                    where d.business_id = p_business_id and d.first_played_at >= bounds.today_start),
    'rewards',    (select count(*) from points_ledger l, bounds
                    where l.business_id = p_business_id and l.reason = 'redeem'
                      and l.created_at >= bounds.today_start),

    /* The same day, yesterday — up to the same hour, so a comparison made at
       ten in the morning is against ten in the morning and not against a whole
       finished day. Comparing a third of a shift to a complete one reports a
       collapse every morning. */
    'yTakings',   (select coalesce(sum(l.amount_tnd), 0) from points_ledger l, bounds
                    where l.business_id = p_business_id and l.reason = 'earn'
                      and l.created_at >= bounds.yday_start
                      and l.created_at < bounds.yday_start + (now() - bounds.today_start)),
    'yVisits',    (select count(*) from points_ledger l, bounds
                    where l.business_id = p_business_id and l.reason = 'earn'
                      and l.created_at >= bounds.yday_start
                      and l.created_at < bounds.yday_start + (now() - bounds.today_start)),

    /*
      The last twelve things that happened at this till.

      Named, because this is the shop's own screen: the cashier serving these
      people knows them, and "Yassine · +12" is what makes the row checkable
      against the receipt in their hand. The NUMBER stays masked — the till has
      never shown a full phone number to the counter (there is a passing test
      that says so), and a feed on a screen facing the room is the last place
      to start.
    */
    'feed', coalesce((
      select jsonb_agg(e order by e->>'at' desc) from (
        select jsonb_build_object(
          'at',     l.created_at,
          'who',    coalesce(nullif(btrim(a.name), ''), 'Client'),
          'tail',   right(l.customer_phone, 3),
          'delta',  l.delta,
          'reason', l.reason,
          'tnd',    l.amount_tnd
        ) as e
        from points_ledger l
        left join accounts a on a.phone = l.customer_phone
        where l.business_id = p_business_id
        order by l.created_at desc
        limit 12
      ) x
    ), '[]'::jsonb)
  );
$$;

/**
 * The reward ladder, with how often each one is actually taken.
 *
 * ── COUNTED BY REWARD, NOT BY PRICE ───────────────────────────────────────
 * The console's version (0040) matches redemptions to rewards on
 * `abs(delta) = points_cost`, which is the only join available from the ledger
 * alone — and it is wrong whenever two rewards share a price, or a price has
 * been changed since somebody redeemed at the old one. loyalty_redemptions
 * records WHICH reward was chosen, so the shop's own screen counts the thing
 * that actually happened rather than inferring it from an amount.
 *
 * `taken` is claimed at the counter; `pending` is issued and not yet collected
 * — a customer holding one is a customer with a reason to come back, which is
 * worth telling the shop separately rather than folding into one total.
 */
create or replace function owner_rewards(p_business_id uuid)
returns table (
  id uuid, label text, points_cost integer, active boolean,
  /* QUOTED. `position` is a reserved word — POSITION(x IN y) is SQL syntax —
     so an unquoted OUT parameter of that name is a syntax error, and the
     message ("syntax error at or near \"position\"") points at the RETURNS
     clause rather than at the word being reserved. */
  "position" integer,
  image_url text, taken bigint, pending bigint, last_taken timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.label, r.points_cost, r.active, r.position, r.image_url,
         (select count(*) from loyalty_redemptions c
           where c.reward_id = r.id and c.status = 'claimed')   as taken,
         (select count(*) from loyalty_redemptions c
           where c.reward_id = r.id and c.status = 'pending')   as pending,
         (select max(c.claimed_at) from loyalty_redemptions c
           where c.reward_id = r.id and c.status = 'claimed')   as last_taken
    from loyalty_rewards r
   where r.business_id = p_business_id
   order by r.position;
$$;

do $$
declare fn text; fns text[] := array[
  'owner_today(uuid)',
  'owner_rewards(uuid)'
];
begin
  foreach fn in array fns loop
    -- `public` first and by name. See 0036 for why the word matters.
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

do $$
declare leaked text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into leaked
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('owner_today', 'owner_rewards')
    and (has_function_privilege('public', p.oid, 'execute')
      or has_function_privilege('anon',   p.oid, 'execute'));

  if leaked is not null then
    raise exception 'still EXECUTE-able by public/anon after 0042: %', leaked;
  end if;
end $$;
