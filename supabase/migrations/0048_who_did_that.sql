-- ===========================================================================
-- 0048 · WHO DID THAT
--
-- A shop is not one person. The owner signs in with an email and a password;
-- the people who actually work the till share that session on a phone behind
-- the counter, all day, as one indistinguishable account. So every figure the
-- product reports — the day's takings, a correction, a reward handed over, a
-- reset secret code — is attributed to "the shop", and when something is wrong
-- there is no question anyone can ask about it.
--
-- This adds the missing half: the people, a PIN each, and a record of who did
-- what. Three tables and one switch.
--
-- ── IT IS A SWITCH, AND IT IS OFF ─────────────────────────────────────────
-- `businesses.staff_pins_enabled` defaults to false, so nothing changes for a
-- shop that has not asked for this. A one-person café should not have to
-- unlock its own till twice a day, and a feature that makes the first run
-- worse is a feature nobody turns on. When it is off, currentStaff() returns
-- null, the gate never renders, and every action is recorded as the owner —
-- which is the truth, because the owner's login is the only one that exists.
--
-- ── A PIN IS NOT A PASSWORD, AND THIS IS NOT A LOGIN ──────────────────────
-- Say plainly what this defends against and what it does not.
--
-- It is a SECOND factor of identity, INSIDE an already-authenticated session.
-- Reaching this screen at all requires the shop's Supabase password. So the
-- question a 4-digit PIN answers is "which of the five people behind this
-- counter is holding the phone", not "should this person be here at all".
-- Against a colleague who watched you type it, four digits is nothing — and
-- that is the same four digits every till in the world uses, for the same
-- reason: the alternative is not typed at a counter.
--
-- What it therefore buys, exactly: an ATTRIBUTION a shop can act on, and a
-- division of the app by role. What it does not buy: protection from someone
-- who already has the owner's email and password. That person is the owner as
-- far as any system here can tell.
--
-- The hash is scrypt with a per-PIN salt (lib/auth/crypto), the same slow hash
-- the diners' PINs use, because 10 000 possibilities against a fast hash is a
-- sweep and not an attack. `staff_attempts` is the other half: five wrong PINs
-- in fifteen minutes and that person's tile stops accepting any.
--
-- ── ROLES DIVIDE THE APP, AND THE DIVISION THAT MATTERS IS RÉGLAGES ───────
--   owner    — everything, including this screen.
--   manager  — the till, the customers, the rewards, the numbers.
--   cashier  — the till and the QR. Nothing that changes what a point is worth.
--
-- The load-bearing one is that a cashier cannot open Réglages: that screen is
-- where the switch above lives, and a role that can turn off the record of its
-- own actions is not a role. It is enforced in the page AND in every action
-- behind it, never in the navigation alone.
--
-- ── THE RECORD KEEPS THE NAME, NOT ONLY THE ID ────────────────────────────
-- `staff_actions.staff_name` is denormalised on purpose. A worker leaves, the
-- row is deleted, and a history that reads "· deleted ·" for a month of a
-- shop's operations is worth nothing to the owner reading it. The id goes null
-- (on delete set null) and the name stays.
--
-- It never holds a phone number. `customer` is the 4-character account code
-- when there is one, and "••• 123" when there is not — the same rule the till
-- itself obeys, so a shop's own operations log cannot become the customer list
-- the caisse deliberately refuses to print.
--
-- ── WHO CAN SEE WHAT ──────────────────────────────────────────────────────
-- Same shape as `visits` (0028), `renewal_requests` (0035) and
-- `early_access_requests` (0039): RLS on, NO policy, every privilege revoked
-- from public/anon/authenticated. Reachable only through the service role.
--
-- That matters here more than usual for one reason: `staff.pin_hash`. The rest
-- of these tables leak information; this one would hand a shop's till codes to
-- anyone who could read it, and REVOKE ... FROM PUBLIC is the line that stops
-- an `anon` client selecting it. It is spelled out in the guard at the bottom,
-- which fails the migration rather than the shop.
-- ===========================================================================

-- ── the people ────────────────────────────────────────────────────────────
create table if not exists staff (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,

  -- what the tile says. A first name is the whole convention here: it is read
  -- across a counter by people who already know each other.
  name        text not null check (length(btrim(name)) between 1 and 40),

  -- scrypt$salt$hash, exactly as accounts.pin_hash. Never a bare PIN.
  pin_hash    text not null,

  role        text not null default 'cashier'
                check (role in ('owner', 'manager', 'cashier')),

  -- kept rather than deleted when somebody leaves, so their history stays
  -- readable and their tile stops appearing
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists staff_business_idx on staff (business_id) where active;

-- One "Sami" per shop. Two identical tiles on the sign-in screen is a coin
-- toss over who gets blamed for the afternoon.
create unique index if not exists staff_name_unique
  on staff (business_id, lower(btrim(name))) where active;

-- ── the switch ────────────────────────────────────────────────────────────
alter table businesses
  add column if not exists staff_pins_enabled boolean not null default false;

-- ── what was done, and by whom ────────────────────────────────────────────
create table if not exists staff_actions (
  id          bigint generated always as identity primary key,
  business_id uuid not null references businesses(id) on delete cascade,

  -- null once that person is deleted; the name below is what survives
  staff_id    uuid references staff(id) on delete set null,
  staff_name  text not null,
  staff_role  text,

  kind        text not null check (kind in (
                'credit', 'stamp', 'collect', 'adjust',
                'set_stamps', 'pin_reset', 'sign_in', 'sign_out')),

  -- the account CODE, or a masked number. Never the digits.
  customer    text,
  points      numeric,
  amount_tnd  numeric,
  label       text,
  at          timestamptz not null default now()
);

create index if not exists staff_actions_feed_idx on staff_actions (business_id, at desc);

-- ── and the thing that makes four digits worth having ─────────────────────
create table if not exists staff_attempts (
  id       bigint generated always as identity primary key,
  staff_id uuid not null references staff(id) on delete cascade,
  at       timestamptz not null default now()
);

create index if not exists staff_attempts_idx on staff_attempts (staff_id, at desc);

-- ── locked to the service role ────────────────────────────────────────────
alter table staff          enable row level security;
alter table staff_actions  enable row level security;
alter table staff_attempts enable row level security;

do $$
declare t text;
begin
  foreach t in array array['staff', 'staff_actions', 'staff_attempts'] loop
    /*
      PUBLIC is named FIRST and it is the one that matters: `anon` and
      `authenticated` inherit from it, so revoking only those two leaves the
      grant standing underneath. That exact omission once shipped an anon
      super-admin bypass in this codebase.
    */
    execute format('revoke all on table %I from public, anon, authenticated', t);
    execute format('grant all on table %I to service_role', t);
  end loop;
end $$;

-- ── prove it, or fail the migration ───────────────────────────────────────
do $$
declare leaked text;
begin
  select string_agg(c.relname || ' → ' || g.grantee, ', ')
    into leaked
  from pg_class c
  join information_schema.role_table_grants g
    on g.table_name = c.relname and g.table_schema = 'public'
  where c.relname in ('staff', 'staff_actions', 'staff_attempts')
    and g.grantee in ('PUBLIC', 'anon', 'authenticated');

  if leaked is not null then
    raise exception 'staff tables are still reachable after 0048: %', leaked;
  end if;
end $$;

comment on table staff is
  'The people who work a shop''s till: a name, a 4-digit PIN (scrypt) and a '
  'role. Only consulted when businesses.staff_pins_enabled is true.';
comment on table staff_actions is
  'Who did what at a shop''s counter. staff_name is denormalised so the history '
  'stays readable after someone leaves. Never holds a customer''s phone number.';
comment on column businesses.staff_pins_enabled is
  'Off by default. When true, the owner app asks which person is holding the '
  'phone before it renders anything.';
