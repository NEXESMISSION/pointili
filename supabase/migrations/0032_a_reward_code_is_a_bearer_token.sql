-- ===========================================================================
-- 0032 · A reward code is a bearer token, so it is generated like one.
--
-- Two codes exist in this product and only one of them is a secret. Worth
-- saying plainly, because the fix is different for each:
--
--   accounts/diner_cafes.code (4 chars) is an IDENTIFIER. It says "this is
--   Yassine". Guessing one gets you nothing: to use it you must already be
--   signed in as the shop's staff, and all it does is open a customer's card
--   at the till. It stays 4 characters because a cashier reads it aloud.
--
--   loyalty_redemptions / wins / stamp_rewards .code is a BEARER TOKEN. It
--   says "give the holder a free coffee". Whoever presents it collects. That
--   is the one to harden, and it had two real weaknesses.
--
-- ── 1 · the randomness was not random ─────────────────────────────────────
-- pointili_gen_code() used random(), which is a deterministic PRNG seeded per
-- session. It is not unpredictable, and it was never meant to be: the Postgres
-- docs say so. Two codes minted in the same session are drawn from a sequence
-- an attacker who learns one can continue. gen_random_bytes() is pgcrypto's
-- CSPRNG and is the correct primitive for anything anyone can spend.
--
-- ── 2 · 6 characters was thin ─────────────────────────────────────────────
-- 32^6 is 1.07 billion, which sounds like plenty until you notice the guess is
-- scoped: a code is only checked against ONE shop, so the attacker's odds are
-- (that shop's pending codes) / 32^6. 8 characters is 32^8 = 1.1 TRILLION,
-- a thousandfold, for two more characters on a slip of paper.
--
-- ── why not a longer alphabet ─────────────────────────────────────────────
-- The alphabet stays at 32 and stays unambiguous (no 0/O/1/I). Adding lower
-- case would buy entropy and cost far more: this code is read across a counter,
-- often aloud, sometimes off a cracked screen. And 256 divides evenly by 32,
-- which is what makes the byte→character mapping below UNBIASED. A 58- or
-- 62-character alphabet would need rejection sampling to avoid favouring the
-- first characters, and a subtly biased token is worse than a shorter one.
--
-- Old 6-character codes keep working. Nothing re-issues them: they are in
-- people's hands and on their screens right now, they expire on use, and the
-- callers accept 6-8 (see caisse/actions.ts).
-- ===========================================================================

/*
  SCHEMA-QUALIFIED, and that is load-bearing.

  Supabase installs pgcrypto into `extensions`, not `public`. Every RPC that
  mints a code is `security definer set search_path = public`, so an unqualified
  gen_random_bytes() resolves fine in a migration session — where the default
  search_path still includes extensions — and then fails at runtime inside
  redeem_at_counter with "function gen_random_bytes(integer) does not exist".

  The self-check at the bottom of this file passed for exactly that reason and
  proved nothing about the path that matters. It now runs with the same narrow
  search_path the real callers use.
*/
create or replace function pointili_gen_code()
returns text language sql volatile
set search_path = public, extensions as $$
  select string_agg(
           substr(
             'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
             /*
               get_byte returns 0-255 and 256 = 8 x 32 exactly, so % 32 maps
               every byte onto the alphabet with equal weight. No modulo bias,
               no rejection loop.
             */
             (get_byte(b, i) % 32) + 1,
             1
           ),
           ''
           order by i
         )
  from (select extensions.gen_random_bytes(8) as b) s,
       lateral generate_series(0, 7) as i;
$$;

/*
  A quick self-check, run at migration time rather than trusted.

  Verifies the generator returns the right shape and that two consecutive calls
  differ — a generator that returned a constant would still satisfy every
  caller's uniqueness loop by looping forever, which is the failure mode that
  would not announce itself.
*/
do $$
declare a text; b text;
begin
  -- the narrow path a security-definer RPC actually runs under
  perform set_config('search_path', 'public', true);
  a := pointili_gen_code();
  b := pointili_gen_code();
  if length(a) <> 8 or a !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' then
    raise exception 'pointili_gen_code produced %, expected 8 chars from the safe alphabet', a;
  end if;
  if a = b then
    raise exception 'pointili_gen_code returned the same value twice: %', a;
  end if;
end $$;
