-- Launch readiness: a new café must (1) be on a real, expiring trial so the paid
-- model works, and (2) have a live wheel out of the box — the game is a headline
-- feature, and it was seeded OFF while getGame() only returns active games, which
-- left new owners unable to turn it on or reach the prize editor at all.
--
-- Only create_cafe changes; everything it seeds is otherwise identical.

create or replace function create_cafe(
  p_owner_id uuid,
  p_name     text,
  p_slug     text,
  p_color    text default '#5b3fd1'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id      uuid;
  v_game_id uuid;
  v_prize   record;
  v_config  jsonb := '{}'::jsonb;
  v_prizes  text[] := array['Cookie offert','Café offert','-20% ta prochaine',
                            'Croissant offert','Sirop au choix','Pâtisserie du jour'];
  v_weights int[]  := array[28, 12, 26, 16, 12, 6];
  i         int;
begin
  if p_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' then
    return jsonb_build_object('ok', false, 'reason', 'slug_invalid');
  end if;
  if p_slug in ('owner','admin','api','login','signup','logout','app','static',
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

  insert into loyalty_rewards (business_id, label, points_cost, active, position) values
    (v_id, 'Espresso offert',    40,  true, 0),
    (v_id, 'Cappuccino offert',  80,  true, 1),
    (v_id, 'Pâtisserie du jour', 120, true, 2),
    (v_id, 'Brunch complet',     300, true, 3);

  -- The wheel starts ON so a new owner sees the whole product working; they can
  -- switch it off (and back on) from Réglages, which now reads inactive games.
  insert into games (business_id, type, active, config)
  values (v_id, 'wheel', true, jsonb_build_object(
    'cooldownHours', 24, 'slotEnabled', false, 'qrGate', false,
    'gates', jsonb_build_array(), 'prizeConfig', jsonb_build_object()))
  returning id into v_game_id;

  for i in 1 .. array_length(v_prizes, 1) loop
    insert into prizes (game_id, label, position, active)
    values (v_game_id, v_prizes[i], i - 1, true)
    returning id into v_prize;
    v_config := v_config || jsonb_build_object(
      v_prize.id::text, jsonb_build_object('weight', v_weights[i], 'isLose', false)
    );
  end loop;
  update games set config = config || jsonb_build_object('prizeConfig', v_config)
  where id = v_game_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'slug', p_slug);
end;
$$;
