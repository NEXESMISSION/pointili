-- ===========================================================================
-- 0032 · A NEW SHOP'S REWARDS START WHERE SOMEBODY COULD ACTUALLY REACH THEM
--
-- The seeded ladder was 25 / 45 / 70 / 160 points, and 0027's own comment says
-- that is "roughly 6, 14, 24 and 60 visits". It was measured against a café
-- ticket of about 4 dinars. The application measures against DEFAULT_TICKET =
-- 2,50 (lib/rewards.ts), which is what a Tunisian café actually charges, so the
-- setup screen divided the same numbers by 2,5 and told every new owner their
-- ladder was 10 / 18 / 28 / 64 visits.
--
-- Sixty-four visits for a brunch. And the screen that showed it fired its own
-- warning on the first row — "10 visites, c'est long. La plupart abandonneront
-- avant" — so the product shipped a default it immediately told you was a
-- mistake, on the second screen of signup. That is the friction: not the
-- stepper, not the layout, the numbers.
--
-- Seeded in VISITS now, against the same 2,50 the app quotes:
--     3 visits →  8 points     a coffee, reachable inside a week
--     5        → 13
--     8        → 20
--    15        → 38            the one worth saving for
--
-- The welcome bonus is 10 points, so the first reward is genuinely close on
-- day one — which is the entire mechanic.
--
-- Nothing else in create_cafe changes. Existing shops are untouched: their
-- ladders are theirs, and an owner who has been running 25 points for months
-- does not want us rewriting their programme underneath them.
-- ===========================================================================

create or replace function create_cafe(
  p_owner_id uuid,
  p_name     text,
  p_slug     text,
  p_color    text default '#5b3fd1'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' then
    return jsonb_build_object('ok', false, 'reason', 'slug_invalid');
  end if;
  -- keep in step with RESERVED_SLUGS in lib/data.ts AND slug_available()
  if p_slug in ('owner','admin','api','auth','cartes','moi','login','signup','logout','app','static',
                '_next','favicon.ico','icon.png','apple-icon.png','robots.txt','sitemap.xml') then
    return jsonb_build_object('ok', false, 'reason', 'slug_reserved');
  end if;
  if exists (select 1 from businesses where slug = p_slug) then
    return jsonb_build_object('ok', false, 'reason', 'slug_taken');
  end if;

  -- A real trial: 14 days, then the café goes dark until a plan is granted.
  insert into businesses (owner_id, name, slug, status, primary_color, plan, plan_expires_at)
  values (p_owner_id, p_name, p_slug, 'active', p_color, 'trial', now() + interval '14 days')
  returning id into v_id;

  insert into loyalty_programs (business_id, active, points_per_tnd, welcome_points, redeem_expiry_hours)
  values (v_id, true, 1, 10, 48);

  -- 3, 5, 8 and 15 visits at 2,50 the visit. See the header.
  insert into loyalty_rewards (business_id, label, points_cost, active, position) values
    (v_id, 'Espresso offert',     8, true, 0),
    (v_id, 'Cappuccino offert',  13, true, 1),
    (v_id, 'Pâtisserie du jour', 20, true, 2),
    (v_id, 'Brunch complet',     38, true, 3);

  return jsonb_build_object('ok', true, 'id', v_id, 'slug', p_slug);
end;
$$;

revoke all on function create_cafe(uuid, text, text, text) from public, anon, authenticated;
grant execute on function create_cafe(uuid, text, text, text) to service_role;
