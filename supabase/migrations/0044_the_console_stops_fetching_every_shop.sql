-- ===========================================================================
-- 0044 · The console stops carrying the whole platform in one payload.
--
-- admin_overview() aggregates EVERY business into one jsonb array, and the
-- console then filters, searches and sorts it in the browser. At seven cafés
-- that is instant and invisible. It is also the shape that does not survive
-- success: every shop's name, slug, owner e-mail, plan, expiry and counts, in
-- a single response, on every load of the page — and the operator is usually
-- looking for one of them.
--
-- p_limit caps it. The default (200) is far above where this product is today,
-- so nothing changes now; what changes is that the page has a ceiling instead
-- of an assumption, and the caller can ask for more when it needs to.
--
-- The ORDER is what makes a cap honest: newest first, so the rows that fall off
-- the end are the oldest and best-established shops rather than an arbitrary
-- slice. The console shows the count it received against platformStats().cafes,
-- so a truncated list says so rather than quietly claiming to be everything.
-- ===========================================================================

drop function if exists admin_overview(uuid);

create or replace function admin_overview(p_actor uuid, p_limit integer default 200)
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
    order by b.created_at desc
    limit greatest(1, least(coalesce(p_limit, 200), 1000))
  ) x;
$$;

/*
  REVOKE, THEN GRANT — in that order, and the grant is not optional.

  A new signature is a NEW function, and Postgres hands every new function
  EXECUTE to PUBLIC. Revoking that (0036's rule) leaves service_role with no
  path of its own, because it was only ever reaching it THROUGH public: the
  console answered "permission denied for function admin_overview" the moment
  this migration ran. 0036 does both for exactly this reason.
*/
revoke all on function admin_overview(uuid, integer) from public, anon, authenticated;
grant execute on function admin_overview(uuid, integer) to service_role;
