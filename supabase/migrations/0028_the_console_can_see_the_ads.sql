-- Nobody could tell whether an ad did anything.
--
-- The console reports cafés, plans and audit entries — everything that happens
-- AFTER somebody signs up. Money is now going into ads, and the questions that
-- decide whether to keep spending are all upstream of that: did anyone arrive,
-- where from, on what, did they stay long enough to read anything, and did any
-- of it turn into an account.
--
-- WHAT THIS DELIBERATELY DOES NOT STORE
--
-- No IP address, no user agent string, no path history, no account link. A row
-- here can never be walked back to a person, which matters more than usual: the
-- same database holds real diners' phone numbers, and an analytics table that
-- quietly became a way to ask "what did THIS person look at" would be a much
-- worse thing to own than a missing chart.
--
-- So: one row per SESSION, not per page view. A random id the browser makes up,
-- a referrer host (host only — a full URL carries search terms and worse), the
-- utm tags an ad campaign puts in its own links, a device bucket, and two
-- timestamps whose difference is the dwell time. `signed_up` is a boolean on
-- that same row, so "did this campaign produce accounts" is answerable without
-- storing WHO the account belongs to.
--
-- Sessions are the unit because dwell time needs a start and an end, and because
-- one row per visitor is what every question below actually asks about.

create table if not exists visits (
  -- the browser's own random id, so a reload is the same visit
  session_id   text primary key,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),

  -- where they landed: '/', '/cafe-el-manar', '/owner'… useful, and not a trail
  entry_path   text,

  -- HOST only. facebook.com, instagram.com, google.com, or null for direct.
  referrer     text,

  -- what an ad campaign tags its own links with
  utm_source   text,
  utm_medium   text,
  utm_campaign text,

  -- 'mobile' | 'tablet' | 'desktop', bucketed in the browser. Never the UA.
  device       text,

  -- did an account get created during this session
  signed_up    boolean not null default false,

  -- which side of the product they landed on
  side         text
);

create index if not exists visits_first_seen_idx on visits (first_seen desc);
create index if not exists visits_utm_idx on visits (utm_source, utm_campaign);

/*
  The table is NOT readable by anyone but the service role.

  No RLS policy is added on purpose: with RLS enabled and no policy, anon and
  authenticated see nothing at all, and the server reaches it through the
  service-role key like every other write in lib/db.ts. A visitor can record
  their own visit only through the function below, which cannot read.
*/
alter table visits enable row level security;
revoke all on visits from anon, authenticated;

/*
  Record a visit. Callable by the SERVER only (the route handler), never the
  browser directly.

  Upsert on session_id: the first call writes the row, every later call from the
  same session only pushes last_seen forward. That means a reload cannot inflate
  the visit count, and the entry path stays the page they actually arrived on
  rather than the last one they wandered to.

  `p_signed_up` is sticky — once true it never goes back to false, because a
  later beacon from the same session must not erase the conversion.
*/
create or replace function record_visit(
  p_session_id   text,
  p_entry_path   text default null,
  p_referrer     text default null,
  p_utm_source   text default null,
  p_utm_medium   text default null,
  p_utm_campaign text default null,
  p_device       text default null,
  p_side         text default null,
  p_signed_up    boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- a made-up or hostile session id must not become a row of junk
  if p_session_id is null or length(p_session_id) not between 8 and 64 then
    return;
  end if;

  insert into visits (
    session_id, entry_path, referrer, utm_source, utm_medium,
    utm_campaign, device, side, signed_up
  )
  values (
    p_session_id, left(p_entry_path, 200), left(p_referrer, 120),
    left(p_utm_source, 80), left(p_utm_medium, 80), left(p_utm_campaign, 120),
    left(p_device, 12), left(p_side, 12), coalesce(p_signed_up, false)
  )
  on conflict (session_id) do update
    set last_seen = now(),
        -- sticky: a later beacon cannot un-convert a session
        signed_up = visits.signed_up or excluded.signed_up;
end;
$$;

revoke all on function record_visit(text, text, text, text, text, text, text, text, boolean)
  from anon, authenticated;

/*
  What the console asks.

  Returns one object rather than five queries, because the console renders it in
  one pass and five round trips to Supabase for four numbers is silly.

  Dwell time is the MEDIAN, not the mean. One tab left open overnight drags a
  mean into uselessness, and that is the common case, not the rare one. Sessions
  under two seconds are excluded from the median entirely — they are bots and
  bounced preloads, and including them makes every campaign look identical.
*/
create or replace function admin_traffic(p_actor uuid, p_days integer default 30)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz;
  v_out   jsonb;
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  v_since := now() - make_interval(days => greatest(1, least(365, coalesce(p_days, 30))));

  select jsonb_build_object(
    'ok', true,
    'days', greatest(1, least(365, coalesce(p_days, 30))),

    'totals', (
      select jsonb_build_object(
        'visits', count(*),
        'signups', count(*) filter (where signed_up),
        'median_seconds', coalesce(
          percentile_cont(0.5) within group (
            order by extract(epoch from (last_seen - first_seen))
          ) filter (where last_seen - first_seen >= interval '2 seconds'),
          0)
      )
      from visits where first_seen >= v_since
    ),

    -- where they came from, best first
    'sources', (
      select coalesce(jsonb_agg(x order by x.visits desc), '[]'::jsonb) from (
        select
          coalesce(nullif(utm_source, ''), referrer, 'direct') as source,
          count(*)                                  as visits,
          count(*) filter (where signed_up)         as signups
        from visits where first_seen >= v_since
        group by 1 order by 2 desc limit 12
      ) x
    ),

    'campaigns', (
      select coalesce(jsonb_agg(x order by x.visits desc), '[]'::jsonb) from (
        select utm_campaign as campaign,
               count(*) as visits,
               count(*) filter (where signed_up) as signups
        from visits
        where first_seen >= v_since and coalesce(utm_campaign, '') <> ''
        group by 1 order by 2 desc limit 12
      ) x
    ),

    'devices', (
      select coalesce(jsonb_agg(x order by x.visits desc), '[]'::jsonb) from (
        select coalesce(nullif(device, ''), 'inconnu') as device,
               count(*) as visits,
               count(*) filter (where signed_up) as signups
        from visits where first_seen >= v_since
        group by 1 order by 2 desc
      ) x
    ),

    -- the last 14 days as a strip, oldest first, with the gaps filled in.
    -- A day with no visitors has to be a zero and not a missing bar, or the
    -- chart quietly redraws itself into a shape that never happened.
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'day', d::date, 'visits', v.visits, 'signups', v.signups
             ) order by d), '[]'::jsonb)
      from generate_series(
             (now() - interval '13 days')::date, now()::date, interval '1 day'
           ) d
      left join lateral (
        select count(*) as visits, count(*) filter (where signed_up) as signups
        from visits where first_seen::date = d::date
      ) v on true
    )
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function admin_traffic(uuid, integer) from anon, authenticated;
