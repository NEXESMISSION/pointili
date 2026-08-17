-- ===========================================================================
-- 0044 · An approval that did not extend anything reported that it did.
--
-- Three defects in the console's write path, all of the same family: a function
-- reporting the REQUEST rather than the RESULT. 0023 fixed that for the plan
-- and suspension levers and its header says why. 0035 then added the renewal
-- queue and reintroduced it in the one place where money is involved.
-- ===========================================================================

-- 1 ─────────────────────────────────────────────────────────────────────────
-- APPROVING A RENEWAL MARKED IT APPROVED WHETHER OR NOT THE PLAN MOVED.
--
--   v_plan := admin_set_plan(p_actor, r.business_id, 'pro', r.months, 'months');
--
-- The result was assigned and never looked at. admin_set_plan returns
-- {ok:false, reason:'introuvable'} rather than raising, so if the business had
-- gone the request was still stamped `approved`, admin_decide_renewal still
-- returned ok:true, and the console read the failure object as a post-state:
-- `verdict()` finds no `until` and no `live` on it, so it prints
--
--     « Renouvellement validé — en ligne, sans limite. »
--
-- about a shop whose subscription was never touched. The operator has a paid
-- receipt in front of them and a screen telling them the shop is unlimited.
--
-- TWO CHANGES. The extension now happens BEFORE the request is stamped, so a
-- failure leaves the row `pending` and returns ok:false — nothing to roll back,
-- because nothing was written. And the plan is no longer hardcoded.
--
-- 'pro' WAS HARDCODED, which quietly demoted people. A shop on 'free' is
-- unlimited by an operator's deliberate decision; paying for six months turned
-- that into a 'pro' plan with an expiry date — the shop paid us to take their
-- unlimited plan away. Now: trial is promoted (a paying shop is not on trial),
-- pro is extended, and free is left alone because there is nothing to extend.
create or replace function admin_decide_renewal(
  p_actor   uuid,
  p_id      uuid,
  p_approve boolean,
  p_note    text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r        renewal_requests%rowtype;
  v_plan   jsonb;
  v_target text;
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select * into r from renewal_requests where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'introuvable');
  end if;
  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'already_decided');
  end if;

  /*
    THE EXTENSION FIRST, and its answer checked, because this is the half that
    can fail. Marking the request first and extending afterwards is what let a
    failure be recorded as a success.
  */
  if p_approve then
    select plan into v_target from businesses where id = r.business_id;
    if v_target is null then
      -- the shop was deleted between the request and the decision
      return jsonb_build_object('ok', false, 'reason', 'introuvable');
    end if;

    if v_target = 'free' then
      -- already unlimited: nothing to extend, and nothing to take away
      v_plan := jsonb_build_object('ok', true, 'live', cafe_is_live(r.business_id), 'until', null);
    else
      v_plan := admin_set_plan(
        p_actor, r.business_id,
        case when v_target = 'trial' then 'pro' else v_target end,
        r.months, 'months');

      if coalesce((v_plan->>'ok')::boolean, false) is not true then
        -- the request stays pending; the operator can try again
        return jsonb_build_object('ok', false, 'reason', coalesce(v_plan->>'reason', 'plan_failed'));
      end if;
    end if;
  end if;

  update renewal_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_at = now(),
         decided_by = p_actor,
         decided_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id;

  perform admin_log(p_actor,
    case when p_approve then 'renewal_approved' else 'renewal_rejected' end,
    r.business_id,
    jsonb_build_object('offer', r.offer, 'amount', r.amount, 'method', r.method,
                       'months', r.months, 'plan', v_target));

  return jsonb_build_object('ok', true, 'plan', v_plan);
end;
$$;

-- 2 ─────────────────────────────────────────────────────────────────────────
-- LIFTING A SUSPENSION FORCED status = 'active', DESTROYING WHAT IT WAS.
--
-- Suspending wrote status = 'disabled' and lifting wrote status = 'active',
-- with nothing remembering the value in between. A shop that was 'paused' when
-- an operator suspended it came back 'active' — the suspension silently
-- published a shop that had been taken down for an unrelated reason.
--
-- The fix is to stop writing the column at all, because it was never needed:
--
--   cafe_is_live() = status = 'active'
--                AND suspended_at is null
--                AND (plan_expires_at is null or plan_expires_at > now())
--
-- suspended_at ALONE already takes the shop dark. Writing status as well was a
-- second, lossy switch wired in parallel to the first. Now suspension owns
-- suspended_at, status stays whatever the shop's own lifecycle set it to, and
-- the two stop overwriting each other.
create or replace function admin_set_suspended(
  p_actor       uuid,
  p_business_id uuid,
  p_suspended   boolean,
  p_reason      text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_live boolean; v_until timestamptz; v_rows integer;
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if p_suspended then
    update businesses
       set suspended_at = now(), suspended_reason = p_reason
     where id = p_business_id;
  else
    update businesses
       set suspended_at = null, suspended_reason = null
     where id = p_business_id;
  end if;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'reason', 'introuvable');
  end if;

  perform admin_log(p_actor,
    case when p_suspended then 'suspend' else 'unsuspend' end,
    p_business_id, jsonb_build_object('reason', p_reason));

  -- The POST-STATE, as 0023 established: lifting a suspension does not
  -- necessarily make a café live — the subscription may have lapsed while it
  -- was off, and status may be 'paused' for reasons of its own.
  select cafe_is_live(id), plan_expires_at into v_live, v_until
    from businesses where id = p_business_id;

  return jsonb_build_object('ok', true, 'live', v_live, 'until', v_until);
end;
$$;

/*
  Any shop currently carrying the old conflation gets its status back. A shop
  that is suspended right now keeps suspended_at (it stays dark through that),
  but 'disabled' — which only this function ever wrote — becomes 'active' so
  that lifting the suspension no longer depends on the column at all.

  Scoped to rows that are actually suspended, so a shop genuinely disabled for
  another reason is left exactly as it is.
*/
update businesses
   set status = 'active'
 where suspended_at is not null
   and status = 'disabled';

-- 3 ─────────────────────────────────────────────────────────────────────────
-- admin_notice DID NOT VALIDATE p_kind, so a bad value RAISED instead of
-- answering.
--
-- Every sibling returns {ok:false, reason:'…'} and the console turns that into
-- a sentence. This one relied on the table's CHECK constraint, so an out-of-
-- range kind surfaced as a Postgres exception through the service client — the
-- operator got the generic "Envoi impossible." with nothing to act on, and the
-- audit log recorded nothing. Same shape as the p_days check added in 0021.
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
  if p_kind is null or p_kind not in ('info', 'warning', 'urgent') then
    return jsonb_build_object('ok', false, 'reason', 'bad_kind');
  end if;
  if coalesce(trim(p_message), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;
  if p_days < 0 or p_days > 365 then
    return jsonb_build_object('ok', false, 'reason', 'bad_days');
  end if;
  -- a notice for a café that does not exist would raise on the FK; answer instead
  if p_business_id is not null
     and not exists (select 1 from businesses where id = p_business_id) then
    return jsonb_build_object('ok', false, 'reason', 'introuvable');
  end if;

  insert into platform_notices (business_id, kind, message, expires_at)
  values (p_business_id, p_kind, trim(p_message),
          case when p_days > 0 then now() + make_interval(days => p_days) else now() end)
  returning id into v_id;

  perform admin_log(p_actor, 'notice', p_business_id,
    jsonb_build_object('kind', p_kind, 'message', p_message, 'days', p_days));

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- 4 ─────────────────────────────────────────────────────────────────────────
-- owner_notices(p_business_id) READ ANY SHOP'S NOTICES.
--
-- security definer, service-role only, and no predicate tying the caller to the
-- business — it returns whatever business_id it is handed. Every call site
-- passes ownerCafe()'s id today, so nothing leaks in the shipped product; what
-- it is, is the same footgun lib/adminRpc.ts was written to remove. One future
-- caller reading an id out of a URL is a cross-tenant read that reviews as
-- ordinary code.
--
-- The owner is now a parameter and the join enforces it, exactly as
-- my_renewal_requests already does. Broadcasts (business_id is null) still
-- reach every owner.
/*
  THE OLD ONE-ARGUMENT SIGNATURE IS DROPPED, and that is not tidiness.

  The first cut of this migration kept it and gave p_owner a DEFAULT, so that
  any caller not yet updated would keep working. Those two overloads make a
  one-argument call ambiguous — Postgres cannot choose between
  owner_notices(uuid) and owner_notices(uuid, uuid default null) — and every
  legacy call it was meant to protect started failing instead. Verified: the
  cross-tenant test errored with "function owner_notices(uuid) is not unique".

  So there is exactly one signature and the owner is REQUIRED. There is one
  call site (lib/platform.ts) and it passes both.
*/
drop function if exists owner_notices(uuid);
/* and the two-arg one too: `create or replace` cannot REMOVE a default from an
   existing function ("cannot remove parameter defaults from existing
   function"), and an earlier run of this file created it with one. */
drop function if exists owner_notices(uuid, uuid);

create function owner_notices(p_business_id uuid, p_owner uuid)
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
      /* and the caller must actually own the shop they are asking about */
      and exists (
        select 1 from businesses b
         where b.id = p_business_id and b.owner_id = p_owner
      )
  ) x;
$$;

-- ── re-lock everything this file touched ──────────────────────────────────
-- 0036's sweep runs BEFORE this file (migrate.mjs replays in sorted order), so
-- a function created here arrives with EXECUTE granted to PUBLIC by default and
-- nothing downstream would close it. Every migration after 0036 has to do its
-- own locking. See the header of 0036 for why the word `public` is the point.
do $$
declare fn text; fns text[] := array[
  'admin_decide_renewal(uuid, uuid, boolean, text)',
  'admin_set_suspended(uuid, uuid, boolean, text)',
  'admin_notice(uuid, uuid, text, text, integer)',
  'owner_notices(uuid, uuid)'
];
begin
  foreach fn in array fns loop
    begin
      execute format('revoke all on function %s from public, anon, authenticated', fn);
      execute format('grant execute on function %s to service_role', fn);
    exception when undefined_function then
      null; -- an older signature that no longer exists is not an error here
    end;
  end loop;
end $$;

/* Prove it, the way 0036 does: a claim that a lock was applied is worth
   nothing next to a query that fails when it was not. */
do $$
declare leaked text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into leaked
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('admin_decide_renewal', 'admin_set_suspended',
                      'admin_notice', 'owner_notices')
    and (has_function_privilege('public', p.oid, 'execute')
      or has_function_privilege('anon',   p.oid, 'execute'));
  if leaked is not null then
    raise exception 'still EXECUTE-able by public/anon after 0044: %', leaked;
  end if;
end $$;
