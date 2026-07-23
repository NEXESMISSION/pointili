-- Pointili — schema (build spec §05)
-- Every café is a tenant (businesses); café-scoped data carries business_id.
-- Points are an append-only LEDGER — a balance is sum(delta), never a column.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Owners / super-admins (Supabase Auth accounts)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner','super_admin')),
  email      text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- The café (tenant)
-- ---------------------------------------------------------------------------
create table if not exists businesses (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references profiles(id) on delete cascade,
  name            text not null,
  slug            text not null unique,
  status          text not null default 'active' check (status in ('active','paused','disabled')),
  primary_color   text not null default '#5b3fd1',
  logo_url        text,
  design_settings jsonb not null default jsonb_build_object(
                    'loyaltyEnabled', true,
                    'showEngagement', true,
                    'pointsExpiryMonths', null
                  ),
  created_at      timestamptz not null default now()
);
create index if not exists businesses_owner_idx on businesses(owner_id);

-- ---------------------------------------------------------------------------
-- Global diner identity (phone + PIN, NOT Supabase Auth). One per phone,
-- shared across all cafés.
-- ---------------------------------------------------------------------------
create table if not exists accounts (
  phone      text primary key,
  pin_hash   text not null,
  name       text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Loyalty config (per café)
-- ---------------------------------------------------------------------------
create table if not exists loyalty_programs (
  business_id         uuid primary key references businesses(id) on delete cascade,
  active              boolean not null default true,
  points_per_tnd      numeric not null default 1,
  welcome_points      integer not null default 10,
  redeem_expiry_hours integer not null default 48
);

-- The boutique catalogue
create table if not exists loyalty_rewards (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  label       text not null,
  points_cost integer not null check (points_cost >= 0),
  image_url   text,
  active      boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists loyalty_rewards_business_idx on loyalty_rewards(business_id, position);

-- Source of truth for balances: +earn / -redeem / welcome / adjust
create table if not exists points_ledger (
  id             bigint generated always as identity primary key,
  business_id    uuid not null references businesses(id) on delete cascade,
  customer_phone text not null,
  delta          integer not null,
  reason         text not null check (reason in ('earn','redeem','welcome','adjust','expire')),
  created_at     timestamptz not null default now()
);
create index if not exists points_ledger_balance_idx on points_ledger(business_id, customer_phone);

-- A pending/claimed reward code, validated at the counter
create table if not exists loyalty_redemptions (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  phone       text not null,
  reward_id   uuid not null references loyalty_rewards(id) on delete restrict,
  code        text not null,
  status      text not null default 'pending' check (status in ('pending','claimed','expired','cancelled')),
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (business_id, code)
);
create index if not exists loyalty_redemptions_phone_idx on loyalty_redemptions(business_id, phone);

-- ---------------------------------------------------------------------------
-- Games — the wheel / slot
-- ---------------------------------------------------------------------------
create table if not exists games (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  type        text not null default 'wheel' check (type in ('wheel','slot')),
  active      boolean not null default false,
  config      jsonb not null default jsonb_build_object(
                'cooldownHours', 24,
                'slotEnabled', false,
                'qrGate', false,
                'gates', jsonb_build_array(),
                'prizeConfig', jsonb_build_object()
              ),
  created_at  timestamptz not null default now()
);
create index if not exists games_business_idx on games(business_id);

-- Wheel segments. Weights / isLose live in games.config.prizeConfig
create table if not exists prizes (
  id       uuid primary key default gen_random_uuid(),
  game_id  uuid not null references games(id) on delete cascade,
  label    text not null,
  position integer not null default 0,
  active   boolean not null default true
);
create index if not exists prizes_game_idx on prizes(game_id, position);

-- Play log — powers cooldown / rate-limit
create table if not exists plays (
  id          bigint generated always as identity primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  phone       text not null,
  device      text,
  game_id     uuid not null references games(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists plays_cooldown_idx on plays(game_id, phone, created_at desc);

-- A won prize code, claimed at the counter
create table if not exists wins (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  phone       text not null,
  prize_id    uuid not null references prizes(id) on delete restrict,
  code        text not null,
  status      text not null default 'pending' check (status in ('pending','claimed','expired','cancelled')),
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (business_id, code)
);
create index if not exists wins_phone_idx on wins(business_id, phone);

-- ---------------------------------------------------------------------------
-- Engagement layer (global per phone)
-- ---------------------------------------------------------------------------
create table if not exists diner_streaks (
  phone         text primary key references accounts(phone) on delete cascade,
  current       integer not null default 0,
  longest       integer not null default 0,
  xp            integer not null default 0,
  -- §05 calls this "freeze", but FREEZE is a reserved word in Postgres and the
  -- column can't be created unquoted. Renamed rather than quoted forever.
  freezes       integer not null default 0,
  play_count    integer not null default 0,
  last_play_day date,
  updated_at    timestamptz not null default now()
);

-- "Passport" — cafés a diner has visited
create table if not exists diner_cafes (
  phone           text not null references accounts(phone) on delete cascade,
  business_id     uuid not null references businesses(id) on delete cascade,
  first_played_at timestamptz not null default now(),
  primary key (phone, business_id)
);

-- Owner-scheduled boosts (double points/XP)
create table if not exists cafe_events (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  kind        text not null check (kind in ('points','xp')),
  multiplier  numeric not null default 2 check (multiplier > 0),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists cafe_events_active_idx on cafe_events(business_id, starts_at, ends_at);

-- Staff caisse identities
create table if not exists app_staff (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  pin         text not null,
  caps        jsonb not null default jsonb_build_object('credit', true, 'validate', true),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (business_id, pin)
);
