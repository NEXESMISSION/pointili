-- Pointili — owner onboarding (§04, §12 phase 2)
--
-- Fixes two bugs that together locked every new owner out of the product:
--
--  1. A fresh Supabase Auth signup got NO profiles row. Since
--     businesses.owner_id references profiles(id), creating a café failed on a
--     foreign key — so an owner could never get past signup.
--  2. With no café, /owner redirected to /owner/login, which saw a valid session
--     and redirected back to /owner. An infinite loop with no way out.
--
-- (2) is fixed in the app (redirect to /owner/nouveau instead). (1) is fixed
-- here, at the source: the profile is created by the database the moment the
-- auth user exists, so it can never be missed by a code path that forgets.

-- ---------------------------------------------------------------------------
-- Every auth.users row gets a profile, automatically.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, email)
  values (new.id, 'owner', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill anyone who signed up before this trigger existed.
insert into public.profiles (id, role, email)
select u.id, 'owner', u.email from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Create a café, with everything it needs to work on day one.
--
-- A café with no loyalty program, no rewards and no wheel is a dead end — the
-- owner would land on an empty dashboard with nothing to configure and no way
-- for a diner to earn anything. So this seeds a sensible, editable starting
-- point in one transaction: §09's defaults, a 4-rung reward ladder, and the
-- wheel with everyone-wins odds.
-- ---------------------------------------------------------------------------
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
  -- Slugs that would be shadowed by a real route (see lib/data.ts RESERVED_SLUGS)
  if p_slug in ('owner','admin','api','login','signup','logout','app','static',
                '_next','favicon.ico','icon.png','apple-icon.png','robots.txt','sitemap.xml') then
    return jsonb_build_object('ok', false, 'reason', 'slug_reserved');
  end if;
  if exists (select 1 from businesses where slug = p_slug) then
    return jsonb_build_object('ok', false, 'reason', 'slug_taken');
  end if;

  insert into businesses (owner_id, name, slug, status, primary_color)
  values (p_owner_id, p_name, p_slug, 'active', p_color)
  returning id into v_id;

  insert into loyalty_programs (business_id, active, points_per_tnd, welcome_points, redeem_expiry_hours)
  values (v_id, true, 1, 10, 48);

  insert into loyalty_rewards (business_id, label, points_cost, active, position) values
    (v_id, 'Espresso offert',    40,  true, 0),
    (v_id, 'Cappuccino offert',  80,  true, 1),
    (v_id, 'Pâtisserie du jour', 120, true, 2),
    (v_id, 'Brunch complet',     300, true, 3);

  -- The wheel starts OFF (§09 default) — the owner turns it on when ready.
  insert into games (business_id, type, active, config)
  values (v_id, 'wheel', false, jsonb_build_object(
    'cooldownHours', 24, 'slotEnabled', false, 'qrGate', false,
    'gates', jsonb_build_array(), 'prizeConfig', jsonb_build_object()))
  returning id into v_game_id;

  -- Weights live in games.config.prizeConfig keyed by prize id, so insert first.
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

/** Is this slug free and legal? Used for live feedback while typing. */
create or replace function slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'
     and p_slug not in ('owner','admin','api','login','signup','logout','app','static',
                        '_next','favicon.ico','icon.png','apple-icon.png','robots.txt','sitemap.xml')
     and not exists (select 1 from businesses where slug = p_slug);
$$;

-- Lock down (PUBLIC gets EXECUTE by default — see 0003).
do $$
declare
  fn text;
  fns text[] := array[
    'create_cafe(uuid, text, text, text)',
    'slug_available(text)',
    'handle_new_user()'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
