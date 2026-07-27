-- ONE code per person, not one per card.
--
-- 0013 made the 4-char code PER SHOP, and its reasoning was arithmetically
-- right: 32^4 = 1 048 576 combinations, which is a lot for one shop's roster and
-- not a lot for a whole platform. It was wrong about the product. A customer
-- carrying a different code at every shop has to remember which is which, and a
-- cashier at a shop the customer has never visited cannot serve them at all.
--
-- So the code moves to `accounts`, globally unique, still 4 characters. The
-- honest cost, stated plainly:
--
--   * The platform now has a HARD CEILING of 1 048 576 diner accounts, ever.
--   * A bounded 20-try mint is comfortable to ~500k accounts; past ~800k
--     signups start failing. Alert at 300 000 rows (~29% occupancy) — that is
--     when to plan the move to 5 characters (33.5M combinations), which is a
--     data migration, not a UI rewrite: the till's inputs are already length-
--     tolerant.
--   * It must never widen to SIX. Six is the voucher namespace
--     (pointili_gen_code), and the 4-vs-6 split is the only thing keeping the
--     two apart at the counter.
--
-- Additive only. Nothing reads accounts.code yet, and diner_cafes.code keeps
-- working untouched, so this migration is safe to apply on its own.

alter table accounts add column if not exists code text;

-- ── backfill ─────────────────────────────────────────────────────────────
--
-- A phone with three cards holds three different codes today. Their OLDEST card
-- wins: it is the shop where they have the longest history, so it is the code
-- most likely to be written down or remembered. first_played_at is immutable,
-- which also makes this backfill deterministic and re-runnable — last_opened_at
-- moves, so a rehearsal and the real run would disagree.
--
-- The two-stage `distinct on` is load-bearing. Two different people can hold the
-- same 4 characters at two different shops (per-shop uniqueness allowed that),
-- and a single UPDATE with a NOT EXISTS guard evaluates against the pre-update
-- snapshot — both would pass, and the unique index would then reject the whole
-- statement. Deduping first means the older card wins and the loser is re-minted
-- below.
with pick as (                       -- one candidate per phone: their oldest card
  select distinct on (phone) phone, code, first_played_at
  from diner_cafes
  where code is not null
  order by phone, first_played_at asc, business_id asc
),
winner as (                          -- one account per contested code: oldest wins
  select distinct on (code) phone, code
  from pick
  order by code, first_played_at asc, phone asc
)
update accounts a set code = w.code
from winner w
where a.phone = w.phone and a.code is null;

-- everyone else: contested losers, and accounts that never held a card
do $$
declare r record; v text; tries int;
begin
  for r in select phone from accounts where code is null order by phone loop
    tries := 0;
    loop
      v := pointili_gen_short();
      exit when not exists (select 1 from accounts where code = v);
      tries := tries + 1;
      if tries > 200 then
        raise exception 'account code space exhausted (32^4 = 1048576 combinations)';
      end if;
    end loop;
    update accounts set code = v where phone = r.phone;
  end loop;
end $$;

create unique index if not exists accounts_code_uidx on accounts(code);
alter table accounts alter column code set default pointili_gen_short();
alter table accounts alter column code set not null;

-- ── minting a code is now part of creating an account ────────────────────
--
-- The column DEFAULT covers raw inserts, but a DEFAULT cannot retry. Only this
-- path is collision-safe, so the app must go through it.
--
-- Returns false (never throws) on a duplicate phone, preserving createAccount's
-- deliberately non-throwing contract for the signup race in lib/db.ts.
create or replace function create_account(p_phone text, p_pin_hash text, p_name text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_code text; tries int := 0;
begin
  if exists (select 1 from accounts where phone = p_phone) then return false; end if;

  loop
    v_code := pointili_gen_short();
    begin
      insert into accounts(phone, pin_hash, name, code)
      values (p_phone, p_pin_hash, p_name, v_code);
      return true;
    exception when unique_violation then
      -- phone primary key, or the code index? Re-read to tell them apart.
      if exists (select 1 from accounts where phone = p_phone) then return false; end if;
      tries := tries + 1;
      -- Bounded on purpose: an unbounded loop would pin a connection forever
      -- once the code space fills. Fail loudly instead.
      if tries > 20 then raise exception 'no free account code after 20 tries'; end if;
    end;
  end loop;
end $$;

-- Resolve a code with no shop in hand. The phone stays server-side.
-- The length guard stops a blank or mangled scan from matching anything.
create or replace function account_by_code(p_code text)
returns jsonb
language sql stable security definer set search_path = public as $$
  with q as (
    select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) as c
  )
  select jsonb_build_object('phone', a.phone, 'name', a.name, 'code', a.code)
  from accounts a, q
  where length(q.c) = 4 and a.code = q.c
  limit 1;
$$;

-- Lock down. Both are security definer; without this the browser-shipped anon
-- key could call them.
do $$
declare fn text; fns text[] := array[
  'create_account(text, text, text)',
  'account_by_code(text)'
];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
