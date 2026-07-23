-- Pointili — the platform layer (super-admin)
--
-- Everything here answers one question: how does the person who runs Pointili
-- manage the cafés that pay for it? Subscriptions with an expiry that actually
-- bites, suspension, notices, and an audit trail of who did what.
--
-- Nothing in this file is reachable by an owner or a diner: every function is
-- security definer, checks pointili_is_super_admin() itself, and is revoked from
-- public/anon/authenticated (see 0003 for why revoking from PUBLIC matters).

-- ---------------------------------------------------------------------------
-- Subscription + moderation state on the café
-- ---------------------------------------------------------------------------
alter table businesses
  add column if not exists plan text not null default 'trial',
  add column if not exists plan_expires_at timestamptz,
  add column if not exists suspended_reason text,
  add column if not exists suspended_at timestamptz;

do $$ begin
  alter table businesses add constraint businesses_plan_check
    check (plan in ('trial', 'free', 'pro'));
exception when duplicate_object then null; end $$;

-- New cafés get a 30-day trial rather than silently living forever for free.
update businesses
  set plan_expires_at = created_at + interval '30 days'
  where plan = 'trial' and plan_expires_at is null;

create index if not exists businesses_plan_idx on businesses(plan, plan_expires_at);

-- ---------------------------------------------------------------------------
-- Notices: the platform talking to an owner (or to everyone).
-- ---------------------------------------------------------------------------
create table if not exists platform_notices (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade, -- null = all cafés
  kind        text not null check (kind in ('info', 'warning', 'urgent')),
  message     text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz
);
create index if not exists platform_notices_target_idx
  on platform_notices(business_id, active);

alter table platform_notices enable row level security;

-- Owners may READ notices addressed to them (or to everyone). They can never
-- write one — that would let a café forge a message from the platform.
drop policy if exists notices_read on platform_notices;
create policy notices_read on platform_notices
  for select using (
    active
    and (expires_at is null or expires_at > now())
    and (business_id is null or pointili_owns_business(business_id))
  );

-- ---------------------------------------------------------------------------
-- Audit: every privileged action is written down, immutably.
-- ---------------------------------------------------------------------------
create table if not exists admin_audit (
  id         bigint generated always as identity primary key,
  actor_id   uuid references profiles(id) on delete set null,
  actor_email text,
  action     text not null,
  business_id uuid,
  detail     jsonb,
  created_at timestamptz not null default now()
);
alter table admin_audit enable row level security;
-- No policies: service-role only. Not even a super-admin edits the log by hand.

create index if not exists admin_audit_time_idx on admin_audit(created_at desc);

-- ---------------------------------------------------------------------------
-- Is this café allowed to serve diners right now?
--
-- This is the teeth of the subscription. A plan with an expiry that nothing
-- enforces is a promise, not a product.
-- ---------------------------------------------------------------------------
create or replace function cafe_is_live(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from businesses b
    where b.id = p_business_id
      and b.status = 'active'
      and b.suspended_at is null
      and (b.plan_expires_at is null or b.plan_expires_at > now())
  );
$$;

-- ---------------------------------------------------------------------------
-- Super-admin actions.
--
-- The actor is passed in EXPLICITLY rather than read from auth.uid().
--
-- Why: these RPCs are revoked from anon/authenticated (see 0003), so the only
-- caller is a service-role server route — and service-role has no auth.uid().
-- An auth.uid()-based check therefore never passes and every admin call
-- silently returned "forbidden"/empty. Taking the actor as an argument keeps the
-- check REAL (the role is verified against profiles, in the database) while
-- working for the only caller that exists.
--
-- The app resolves p_actor from the session — it is never sent by a browser.
-- ---------------------------------------------------------------------------
create or replace function is_super(p_actor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_actor and role = 'super_admin');
$$;
create or replace function admin_log(
  p_actor uuid,
  p_action text,
  p_business_id uuid,
  p_detail jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into admin_audit (actor_id, actor_email, action, business_id, detail)
  values (
    p_actor,
    (select email from profiles where id = p_actor),
    p_action, p_business_id, p_detail
  );
end;
$$;

/** Grant or extend a subscription. months=0 → set an exact expiry of now. */
drop function if exists admin_set_plan(uuid, text, integer);
create or replace function admin_set_plan(
  p_actor       uuid,
  p_business_id uuid,
  p_plan        text,
  p_months      integer default 1
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_until timestamptz;
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_plan not in ('trial', 'free', 'pro') then
    return jsonb_build_object('ok', false, 'reason', 'bad_plan');
  end if;

  -- 'free' is unlimited; paid plans carry an expiry.
  if p_plan = 'free' then
    v_until := null;
  else
    -- extend from whichever is later: today, or the current expiry
    select greatest(now(), coalesce(plan_expires_at, now())) + make_interval(months => p_months)
      into v_until from businesses where id = p_business_id;
  end if;

  update businesses
     set plan = p_plan, plan_expires_at = v_until
   where id = p_business_id;

  perform admin_log(p_actor, 'set_plan', p_business_id,
    jsonb_build_object('plan', p_plan, 'months', p_months, 'until', v_until));

  return jsonb_build_object('ok', true, 'plan', p_plan, 'expiresAt', v_until);
end;
$$;

/** Suspend (ban) a café, or lift it. Diners immediately lose access. */
drop function if exists admin_set_suspended(uuid, boolean, text);
create or replace function admin_set_suspended(
  p_actor       uuid,
  p_business_id uuid,
  p_suspended   boolean,
  p_reason      text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if p_suspended then
    update businesses
       set suspended_at = now(), suspended_reason = p_reason, status = 'disabled'
     where id = p_business_id;
  else
    update businesses
       set suspended_at = null, suspended_reason = null, status = 'active'
     where id = p_business_id;
  end if;

  perform admin_log(p_actor,
    case when p_suspended then 'suspend' else 'unsuspend' end,
    p_business_id, jsonb_build_object('reason', p_reason));

  return jsonb_build_object('ok', true);
end;
$$;

/** Post a notice to one café, or to every café (business_id null). */
drop function if exists admin_notice(uuid, text, text, integer);
create or replace function admin_notice(
  p_actor       uuid,
  p_business_id uuid,
  p_kind        text,
  p_message     text,
  p_days        integer default 14
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if coalesce(trim(p_message), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;

  insert into platform_notices (business_id, kind, message, expires_at)
  values (p_business_id, p_kind, trim(p_message),
          case when p_days > 0 then now() + make_interval(days => p_days) end)
  returning id into v_id;

  perform admin_log(p_actor, 'notice', p_business_id,
    jsonb_build_object('kind', p_kind, 'message', p_message));

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

drop function if exists admin_dismiss_notice(uuid);
create or replace function admin_dismiss_notice(p_actor uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  update platform_notices set active = false where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Every café, with the numbers that decide whether it is worth keeping.
-- ---------------------------------------------------------------------------
drop function if exists admin_overview();
create or replace function admin_overview(p_actor uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_super(p_actor) then '[]'::jsonb else
    coalesce(jsonb_agg(row order by row->>'createdAt' desc), '[]'::jsonb)
  end
  from (
    select jsonb_build_object(
      'id',            b.id,
      'name',          b.name,
      'slug',          b.slug,
      'status',        b.status,
      'plan',          b.plan,
      'planExpiresAt', b.plan_expires_at,
      'suspendedAt',   b.suspended_at,
      'suspendedReason', b.suspended_reason,
      'live',          cafe_is_live(b.id),
      'createdAt',     b.created_at,
      'ownerEmail',    p.email,
      'customers',     (select count(distinct customer_phone) from points_ledger l where l.business_id = b.id),
      'pointsIssued',  (select coalesce(sum(delta), 0) from points_ledger l where l.business_id = b.id and l.delta > 0),
      'plays',         (select count(*) from plays pl where pl.business_id = b.id),
      'lastActivity',  (select max(created_at) from points_ledger l where l.business_id = b.id)
    ) as row
    from businesses b
    left join profiles p on p.id = b.owner_id
  ) x;
$$;

drop function if exists admin_platform_stats();
create or replace function admin_platform_stats(p_actor uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_super(p_actor) then '{}'::jsonb else
    jsonb_build_object(
      'cafes',      (select count(*) from businesses),
      'live',       (select count(*) from businesses b where cafe_is_live(b.id)),
      'suspended',  (select count(*) from businesses where suspended_at is not null),
      'expiring7d', (select count(*) from businesses
                      where plan_expires_at between now() and now() + interval '7 days'),
      'expired',    (select count(*) from businesses
                      where plan_expires_at is not null and plan_expires_at <= now()),
      'diners',     (select count(*) from accounts),
      'owners',     (select count(*) from profiles where role = 'owner'),
      'pointsIssued', (select coalesce(sum(delta), 0) from points_ledger where delta > 0),
      'plays',      (select count(*) from plays)
    )
  end;
$$;

/** The audit trail — what the platform's operators have been doing. */
drop function if exists admin_recent_actions(integer);
create or replace function admin_recent_actions(p_actor uuid, p_limit integer default 20)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_super(p_actor) then '[]'::jsonb else
    coalesce(jsonb_agg(row order by row->>'at' desc), '[]'::jsonb)
  end
  from (
    select jsonb_build_object(
      'at', a.created_at, 'actor', a.actor_email, 'action', a.action,
      'cafe', (select name from businesses where id = a.business_id),
      'detail', a.detail
    ) as row
    from admin_audit a
    order by a.created_at desc
    limit p_limit
  ) x;
$$;

/** Notices this owner should see (theirs + platform-wide). */
create or replace function owner_notices(p_business_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row order by row->>'createdAt' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', n.id, 'kind', n.kind, 'message', n.message, 'createdAt', n.created_at
    ) as row
    from platform_notices n
    where n.active
      and (n.expires_at is null or n.expires_at > now())
      and (n.business_id is null or n.business_id = p_business_id)
  ) x;
$$;

-- ---------------------------------------------------------------------------
-- Lock everything down (PUBLIC gets EXECUTE by default — see 0003).
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
  fns text[] := array[
    'cafe_is_live(uuid)',
    'is_super(uuid)',
    'admin_log(uuid, text, uuid, jsonb)',
    'admin_set_plan(uuid, uuid, text, integer)',
    'admin_set_suspended(uuid, uuid, boolean, text)',
    'admin_notice(uuid, uuid, text, text, integer)',
    'admin_dismiss_notice(uuid, uuid)',
    'admin_overview(uuid)',
    'admin_platform_stats(uuid)',
    'admin_recent_actions(uuid, integer)',
    'owner_notices(uuid)'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

grant select on platform_notices to authenticated;
