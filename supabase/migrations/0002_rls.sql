-- Pointili — Row-Level Security (build spec §06)
-- RLS ON for every table. Owners touch only their own café's rows; anon/public
-- may read only active cafés + their public catalogue. Service role (used inside
-- trusted server routes/RPCs) bypasses all of this.

-- ---------------------------------------------------------------------------
-- Helpers (security definer → they bypass RLS so policies don't recurse)
-- ---------------------------------------------------------------------------
create or replace function pointili_is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'super_admin');
$$;

create or replace function pointili_owns_business(bid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from businesses
    where id = bid and (owner_id = auth.uid() or pointili_is_super_admin())
  );
$$;

create or replace function pointili_owns_game(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from games g
    where g.id = gid and pointili_owns_business(g.business_id)
  );
$$;

create or replace function pointili_business_public(bid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from businesses
    where id = bid and status in ('active','paused')
  );
$$;

create or replace function pointili_game_public(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from games g
    where g.id = gid and g.active and pointili_business_public(g.business_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table profiles            enable row level security;
alter table businesses          enable row level security;
alter table accounts            enable row level security;
alter table loyalty_programs    enable row level security;
alter table loyalty_rewards     enable row level security;
alter table points_ledger       enable row level security;
alter table loyalty_redemptions enable row level security;
alter table games               enable row level security;
alter table prizes              enable row level security;
alter table plays               enable row level security;
alter table wins                enable row level security;
alter table diner_streaks       enable row level security;
alter table diner_cafes         enable row level security;
alter table cafe_events         enable row level security;
alter table app_staff           enable row level security;

-- ---------------------------------------------------------------------------
-- Policies
-- profiles: a user sees/edits their own row; super-admin sees all
-- ---------------------------------------------------------------------------
drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles
  for all using (id = auth.uid() or pointili_is_super_admin())
  with check (id = auth.uid() or pointili_is_super_admin());

-- businesses: public reads active/paused; owner manages own
drop policy if exists businesses_public_read on businesses;
create policy businesses_public_read on businesses
  for select using (status in ('active','paused') or pointili_owns_business(id));
drop policy if exists businesses_owner_write on businesses;
create policy businesses_owner_write on businesses
  for all using (pointili_owns_business(id)) with check (pointili_owns_business(id));

-- loyalty config + catalogue: public read (active), owner manage
drop policy if exists programs_public_read on loyalty_programs;
create policy programs_public_read on loyalty_programs
  for select using (pointili_business_public(business_id) or pointili_owns_business(business_id));
drop policy if exists programs_owner_write on loyalty_programs;
create policy programs_owner_write on loyalty_programs
  for all using (pointili_owns_business(business_id)) with check (pointili_owns_business(business_id));

drop policy if exists rewards_public_read on loyalty_rewards;
create policy rewards_public_read on loyalty_rewards
  for select using ((active and pointili_business_public(business_id)) or pointili_owns_business(business_id));
drop policy if exists rewards_owner_write on loyalty_rewards;
create policy rewards_owner_write on loyalty_rewards
  for all using (pointili_owns_business(business_id)) with check (pointili_owns_business(business_id));

-- games + prizes: public read (active), owner manage
drop policy if exists games_public_read on games;
create policy games_public_read on games
  for select using ((active and pointili_business_public(business_id)) or pointili_owns_business(business_id));
drop policy if exists games_owner_write on games;
create policy games_owner_write on games
  for all using (pointili_owns_business(business_id)) with check (pointili_owns_business(business_id));

drop policy if exists prizes_public_read on prizes;
create policy prizes_public_read on prizes
  for select using ((active and pointili_game_public(game_id)) or pointili_owns_game(game_id));
drop policy if exists prizes_owner_write on prizes;
create policy prizes_owner_write on prizes
  for all using (pointili_owns_game(game_id)) with check (pointili_owns_game(game_id));

-- events: public read (client shows active boost), owner manage
drop policy if exists events_public_read on cafe_events;
create policy events_public_read on cafe_events
  for select using (pointili_business_public(business_id) or pointili_owns_business(business_id));
drop policy if exists events_owner_write on cafe_events;
create policy events_owner_write on cafe_events
  for all using (pointili_owns_business(business_id)) with check (pointili_owns_business(business_id));

-- Owner-read-only ledgers (writes happen via service-role RPCs)
drop policy if exists ledger_owner_read on points_ledger;
create policy ledger_owner_read on points_ledger
  for select using (pointili_owns_business(business_id));
drop policy if exists redemptions_owner_read on loyalty_redemptions;
create policy redemptions_owner_read on loyalty_redemptions
  for select using (pointili_owns_business(business_id));
drop policy if exists plays_owner_read on plays;
create policy plays_owner_read on plays
  for select using (pointili_owns_business(business_id));
drop policy if exists wins_owner_read on wins;
create policy wins_owner_read on wins
  for select using (pointili_owns_business(business_id));

-- Staff: owner manages their café's caisse identities
drop policy if exists staff_owner_write on app_staff;
create policy staff_owner_write on app_staff
  for all using (pointili_owns_business(business_id)) with check (pointili_owns_business(business_id));

-- accounts, diner_streaks, diner_cafes: NO anon/owner policies.
-- They hold global diner data (incl. pin_hash) and are reachable only via the
-- service role inside trusted server routes/RPCs. RLS is on with zero policies
-- → every non-service request is denied by default.
