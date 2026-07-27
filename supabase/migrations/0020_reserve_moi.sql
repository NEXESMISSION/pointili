-- Reserve "moi" — the new diner front door at /moi.
--
-- Next.js resolves a static route before /[slug], so a café created on this slug
-- would be permanently unreachable. Both slug guards carry their own copy of the
-- list, so both have to change or they disagree: slug_available() says "free",
-- create_cafe() then refuses, and the owner gets a contradiction.
--
-- Both bodies below are 0016_client_fixes.sql verbatim with ONE word added.
-- create_cafe cannot be paraphrased: loyalty_rewards is keyed on `position` (not
-- `sort`), the seeded ladder is part of a new café's contract, and the return
-- payload carries `slug`, which app/owner/(setup)/nouveau/actions.ts redirects
-- on. Rewriting it from memory silently produced cafés that never got created.

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
  -- keep in step with RESERVED_SLUGS in lib/data.ts AND slug_available() below
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

  insert into loyalty_rewards (business_id, label, points_cost, active, position) values
    (v_id, 'Espresso offert',    40,  true, 0),
    (v_id, 'Cappuccino offert',  80,  true, 1),
    (v_id, 'Pâtisserie du jour', 120, true, 2),
    (v_id, 'Brunch complet',     300, true, 3);

  return jsonb_build_object('ok', true, 'id', v_id, 'slug', p_slug);
end;
$$;

create or replace function slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'
     and p_slug not in ('owner','admin','api','auth','cartes','moi','login','signup','logout','app','static',
                        '_next','favicon.ico','icon.png','apple-icon.png','robots.txt','sitemap.xml')
     and not exists (select 1 from businesses where slug = p_slug);
$$;

do $$
declare fn text; fns text[] := array[
  'create_cafe(uuid, text, text, text)',
  'slug_available(text)'
];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
