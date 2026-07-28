# POINTILI — Logic & Correctness Defect List

*Findings-only pass. 61 raw findings, deduplicated to 48 distinct defects. Every item below survived an adversarial refutation pass; severities are the corrected ones. No files were changed.*

---

## 1. Verdict

The **arithmetic is sound and the ledger is honest**. `points_ledger` is genuinely append-only, `pointili_balance` is a plain `sum(delta)` with no cached copy to drift, and the three high-traffic value RPCs (`credit_points`, `redeem_at_counter`, `add_stamp`) all take a `pg_advisory_xact_lock` on `business:phone` before their read-modify-write. I tried to make points appear or disappear through the normal earn/spend path and could not. What is wrong is almost entirely *around* that core.

The defects cluster in three places, and the clustering is more informative than any single item:

**(a) The Postgres grant surface — `supabase/migrations/0006_grants.sql`.** The whole privilege model assumes RLS constrains *what* you may write. It only constrains *which row*. `grant select, update on profiles to authenticated` plus a row-scoped `profiles_self` policy means every owner can write their own `role` column — that is the one critical finding, and it collapses every gate in the product at once. The identical shape on `businesses` lets any owner void their own subscription and un-suspend themselves. Two grants, no column lists, and the entire monetisation and moderation model is voluntary.

**(b) The stamps subsystem (0011 → 0015 → 0016 → 0019).** It was bolted onto a points system that already had its invariants and never inherited them. `add_stamp` drains its counter in a `while` loop with nothing normalising the counter when the requirement changes, so a routine "10 visites → 5 visites" promo change cashes out every part-filled card in the shop at multiple free rewards each. Its sibling `owner_set_stamps` skips the advisory lock `add_stamp` takes, writes no audit row (points get an `'adjust'` row; stamps get nothing), and preserves a lapsed `started_at` in direct contradiction of the comment two lines above it. Expiry is computed in exactly one of four readers, so the till, the client list, the wallet and the diner's own card show four different numbers for the same card.

**(c) `lib/stats.ts` — one 300-line file with five independent defects**, all pointing the same way: the owner is shown a wrong number on the screen that decides renewal. Revenue is back-computed from the *current* points-per-dinar, so changing a setting rewrites six months of history. The ledger read has no pagination. `customers` counts only phones with an `earn` row, and the page hides the entire dashboard when that is zero — reproducible on the live database today for `saif-sfax`.

A fourth, smaller cluster: commit `e6c3ade` removed the path rewrite and left `/console` and `/login` behind as targets in code that was not in that commit's file list. The comments still describe the deleted rewrite. Both are dead links on recovery paths.

**What I tried hard to break and could not:**

- **Cross-tenant access from an ordinary owner session.** `pointili_owns_business()` is applied consistently to every tenant-scoped policy; I found no table with a missing, over-broad, or forgotten policy for a plain `owner`. The one cross-tenant path (finding **M11**) requires already holding a *super-admin's* session, which is a different threat.
- **Spending points you do not have.** `redeem_at_counter` reads the balance under the advisory lock and compares against `points_cost` in the same transaction; `boutique/actions.ts` requires `currentDiner()`. Knowing someone's 4-char account code grants nothing — it is a token designed to be presented at a counter, and the phone never crosses to the browser.
- **Double-claiming a voucher.** `claim_code` updates only rows with `status = 'pending'` and returns through the `UPDATE … RETURNING`, so it is safe under concurrency. `peek_code`/`claim_code` also correctly refuse lapsed codes — every "expired code" finding below is a *counting* bug on an owner screen, not a reward that gets wrongly served.
- **The step-up elevation mechanism itself.** The cookie is bound to the user id, 30-minute TTL, verified server-side, and every `admin_*` RPC re-checks `is_super(p_actor)` independently. The defects are around it (dead redirect, not cleared on sign-out), not in it.
- **The open-redirect chain.** The `?next` guard really is bypassable with a backslash, but PKCE defeats the attack: the exchange needs the `code_verifier` cookie from the browser that *started* the flow, so an attacker-initiated reset lands the victim on the safe error branch. It is latent, not live.

Honest summary: **one critical, four high, twelve medium.** Fix the two grant statements and the `add_stamp` loop and the risk profile changes category. Everything else is a normal backlog.

---

## 2. Critical

### Tenancy

**C1 — Any owner can promote themselves to `super_admin` by PATCHing their own `profiles` row**
`supabase/migrations/0006_grants.sql:37`

*What breaks:* `grant select, update on profiles to authenticated` is a whole-table grant with no column list. The only policy, `profiles_self` (`0002_rls.sql:70-72`), is `for all using (id = auth.uid()…) with check (id = auth.uid()…)` — it filters rows, never columns. `'super_admin'` is a legal value under the CHECK at `0001_init.sql:12`. Nothing in the application ever *writes* to `profiles` (the only access is a read at `lib/auth/owner.ts:34-38`), so the UPDATE grant is pure excess privilege — and the comment above it justifies SELECT only.

*Repro:* Sign up as an ordinary owner (signup is open, `app/owner/(auth)/login/actions.ts:44`) → take the public anon key from the browser bundle (`lib/supabase/client.ts:11`) and your own access token → `PATCH /rest/v1/profiles?id=eq.<my-uid>` with `{"role":"super_admin"}`; RLS USING and WITH CHECK both pass on your own row → reload `/admin`, elevate with **your own** password (`app/admin/login/actions.ts:43` verifies the session's own email) → full console: `admin_set_plan`, `admin_set_suspended`, `admin_notice`, `admin_overview` all pass `is_super(p_actor)`. Simultaneously `pointili_is_super_admin()` makes `pointili_owns_business()` true for **every** business, giving direct PostgREST read/write on all tenants.

*Verified:* `information_schema.role_table_grants` on the live DB returns `authenticated → UPDATE` on `profiles` — a table-level grant, so `role` is writable.

*Smallest correct fix:* `revoke update on profiles from authenticated;` (nothing in the app writes to it).

---

## 3. High

### Tenancy / lifecycle

**H1 — Owners can self-grant an unlimited plan, lift a platform suspension, and take a reserved slug, by writing `businesses` directly**
`supabase/migrations/0006_grants.sql:43-45`

*What breaks:* Same shape as C1. `grant insert, update, delete on businesses … to authenticated` has no column list, and `businesses_owner_write` (`0002_rls.sql:79-80`) is row-scoped. But `businesses` is where the *platform's* state lives: `plan`, `plan_expires_at`, `suspended_at`, `suspended_reason`, `status`, `slug`. `cafe_is_live()` (`0007_platform.sql:82-91`) — the sole enforcement point for both subscription expiry and suspension — reads nothing but those columns. The `admin_set_plan`/`admin_set_suspended` RPCs are carefully revoked from `authenticated` and audited; a plain PATCH reaches the same effect and writes no `admin_audit` row.

*Repro:* Owner obtains an access token from Supabase Auth with the public anon key (they own the credentials) → `PATCH /rest/v1/businesses?id=eq.<their own id>` with `{"plan":"free","plan_expires_at":null,"suspended_at":null,"suspended_reason":null,"status":"active"}` → `cafe_is_live()` returns true forever, the console shows the café as GRATUIT / en ligne, and the audit log shows only the operator's original suspension, never the reversal. `{"slug":"admin"}` also succeeds, bypassing the reserved-slug lists that `create_cafe` and `slug_available` exist to enforce.

*Verified:* `information_schema.column_privileges` lists UPDATE for `authenticated` on `plan`, `plan_expires_at`, `status`, `suspended_at`, `suspended_reason`, `slug`; the update was executed and rolled back on the live DB.

*Smallest correct fix:* Replace with a column-scoped grant — `grant update (name, slug, logo_url, …) on businesses to authenticated` — omitting `plan`, `plan_expires_at`, `status`, `suspended_at`, `suspended_reason`.

### Stamps

**H2 — Lowering `stamps_required` mints one free-reward voucher per whole card, from a single "+1 tampon" tap**
`supabase/migrations/0015_stamp_expiry.sql:65`

*What breaks:* `add_stamp`'s completion loop is `while v_count >= v_req loop`, issuing one `stamp_rewards` row and incrementing `cycles` per iteration. Nothing normalises `loyalty_stamps.count` when the owner changes the requirement: `saveStampsAction` (`app/owner/(app)/reglages/actions.ts:106-113`) writes `stamps_required` with a plain UPDATE and never touches a `loyalty_stamps` row. `owner_set_stamps` — the only function that clamps to `required-1` — is never called on a settings save. Only the **last** code is returned (`'code', v_code`, `0015:96`), so `CaisseForms.tsx:432` announces one reward while five were created. `app/[slug]/page.tsx:319` patched only the *display* (clamping `shown` to `required-1`), with a comment acknowledging the counter can exceed the requirement.

*Repro (proved on `saif-sfax`, rolled back):* `stamps_required = 10`, a card at `count = 9`. Owner changes the setting to "carte de 2 visites" in `/owner/reglages`. Cashier taps "+1 tampon" **once**. `add_stamp` returned `{completed:true, count:0, required:2}` and **five** pending `stamp_rewards` rows were created (`R2EK5J`, `NSZ5GC`, `LLJTQB`, `AMMQDE`, `8RUCRQ`), cycles 0 → 5. A mild 10 → 5 change on a count of 9 still yields two. Each code is a real free item at the counter; the till shows one.

*Smallest correct fix:* In `saveStampsAction`, clamp existing counters in the same transaction — `update loyalty_stamps set count = least(count, <new required> - 1) where business_id = …` — or bound the loop to one iteration.

### Identity

**H3 — PIN lockout is check-then-act: concurrent sign-ins defeat the 5-try gate entirely**
`app/moi/actions.ts:46`

*What breaks:* `signInAction` reads the lock state (`pinLockedFor`, :46), derives the key (`verifyPin`, :62), then records the failure (`pinFail`, :64). Nothing serialises the three and nothing reserves an attempt up front, so the lock exists between requests but never within a batch. Critically, the gate read happens **before** the scrypt (`lib/auth/crypto.ts:49`), so every request arriving inside one scrypt latency reads `locked_until` before the 5th `pin_fail` commits. Worse, `pin_fail` sets `count = 0` when it locks (`0004_auth.sql:39`), so each 15-minute window hands back a *fresh full budget* rather than escalating. `app/[slug]/rejoindre/actions.ts:50` has the identical shape. A repo-wide grep for rate limiting finds nothing else — the `pin_attempts` row is the entire defence, and `lib/auth/crypto.ts:20-25` says so explicitly.

*Repro:* Pick any Tunisian 8-digit number. POST `signInAction` 1000× **concurrently** with PINs 0000–0999; all 1000 read the gate before any sibling's `pin_fail` commits, so all 1000 are actually tested. Wait 15 minutes for the lock to lapse (count is already back to 0), fire the next batch. Ten batches ≈ 2.5 hours covers the whole 10,000-PIN keyspace; sequentially it would need ~500 hours. Payload is a 90-day session cookie (`crypto.ts:88`) over the whole cross-shop wallet and every spendable balance.

*Smallest correct fix:* Make `pin_fail` reserve the attempt *before* verification (increment-and-check in one statement), and stop resetting `count` to 0 on lock.

### Races

**H4 — Till credit has no idempotency; an Enter-key double-fire mints points twice for one sale**
`app/owner/(app)/caisse/CaisseForms.tsx:509` → `supabase/migrations/0003_rpcs.sql:84`

*What breaks:* `credit()` (`CaisseForms.tsx:393`) starts a transition with no `if (busy) return` guard, and the amount input's Enter handler at :509 is **not** disabled while the submit button at :528 is (`disabled={busy || !amount}`). Keyboard auto-repeat re-enters `credit()` with the unchanged `amount` state (only cleared on success). Server-side, `credit_points` takes `pg_advisory_xact_lock` — which **serialises but does not dedupe** — then does a bare `insert into points_ledger(… 'earn')` with no idempotency token. Two firings, two rows. `stamp()` at :418 has the same missing guard, so one visit can add two stamps and falsely complete a card.

*Repro:* Open a customer, type an amount, hold/press Enter twice quickly (or Enter then click Créditer). Balance increases by 2× for one purchase. Server actions are public endpoints, so a replayed POST does the same.

*Smallest correct fix:* Add `if (busy) return;` at the top of `credit()` and `stamp()`, and pass a client-generated request id that `credit_points` stores and rejects on repeat.

---

## 4. Medium

### Points & money

**M1 — A suspended or expired café can still mint unlimited points through "Corriger"**
`supabase/migrations/0011_stamps.sql:329`
`owner_adjust_points` is the only value-writing RPC with no `cafe_is_live()` gate — `credit_points` (`0003:61`), `play_game` (`0003:130`), `redeem_at_counter` (`0003:233`) and `add_stamp` (`0015:38`) all have one. Its caller `adjustByCodeAction` (`caisse/actions.ts:85-100`) checks neither `cafe.live` nor `program.active`, and the owner shell deliberately keeps rendering under a red banner for a dark café (`app/owner/(app)/layout.tsx:94`). `owner_set_stamps` is missing the same gate. Repro: let a trial lapse or suspend the shop → the Caisse still renders → resolve any customer → Corriger → `+1000` → Appliquer → `ok:true`, ledger row written, up to 1,000,000 per call. The minted points are *not* spendable while dark (every redemption path is gated), so this is subscription and ban evasion on the shop's own ledger, not creation of redeemable value — the balances become spendable the moment the café is reinstated. **Fix:** add the `if not cafe_is_live(p_business_id) then return …` prologue to `owner_adjust_points` and `owner_set_stamps`.

**M2 — A points correction can drive a balance arbitrarily negative, with no floor at any layer**
`app/owner/(app)/caisse/actions.ts:89`
The action validates only `delta !== 0` and `Math.abs(delta) <= 1_000_000`; `owner_adjust_points` (`0011:329-337`) inserts whatever it is handed; `pointili_balance` (`0003:9-14`) is a bare `coalesce(sum(delta),0)` with no `greatest(0, …)`; there is no CHECK constraint. Repro: customer at 20 points, cashier means −5 and types −500 → balance −480, rendered raw on `/[slug]` and `/cartes`, and `redeem_at_counter` (`0003:244-250`) then refuses every reward until 480 points of real purchases have silently paid off a debt the customer was never told about. **Fix:** in `owner_adjust_points`, reject when `p_delta < 0 and current_balance + p_delta < 0`.

**M3 — Revenue is back-computed at the *current* earn rate, so changing points-per-dinar rewrites all history**
`lib/stats.ts:158`
`pointsPerTnd` is read live at :113 and divides every revenue figure (:158, :162, :187, :199, :230, plus `avgTicketTnd` :290 and `netTnd` :292). The rate in force when each row was written is nowhere recorded — the ledger stores only the resulting integer. Repro: six months at `points_per_tnd = 1` shows "30 000 TND passés par la caisse"; the owner changes it to 2 in Réglages; reload → the same six months read "15 000 TND", with a fabricated −50 % Delta. (`credit_points` also multiplies by an event multiplier at `0003:81` that stats never divides back out, though no application code writes `cafe_events` today.) **Fix:** stamp `points_per_tnd` onto each `earn` ledger row and divide by the stored value.

**M4 — Analyses reads only the first page of the ledger; every money figure freezes past ~1000 rows**
`lib/stats.ts:95`
`db.from("points_ledger").select(…).eq("business_id", …).order("created_at")` — no `.range()`, no `.limit()`, no pagination loop, and `lib/supabase/admin.ts` sets no override. PostgREST truncates at the project's max-rows silently, and because the order is ASC what survives is the **oldest** rows. Every downstream figure derives from that slice: pick "7 jours" and revenue reads 0 while the till is taking money; "Tout" stops growing; "Points en circulation" reports the liability as it stood at row 1000. Line 123 also rebuilds each customer's array per row (`[...(byPhone.get(p) ?? []), at]`), O(n²) over a shop's history. **Fix:** paginate with `.range()` in a loop (or aggregate server-side in SQL).

**M5 — Analyses shows "Pas encore de client" for a shop with real cardholders, balances and redemptions**
`lib/stats.ts:127`
`customers = byPhone.size`, and `byPhone` is built (:120-124) exclusively from rows with `reason === "earn"` (:119) — directly under a comment at :126 claiming the opposite ("every phone the café has ever touched, incl. welcome-only signups"). `analyses/page.tsx:65` then does `s.customers === 0 ? <Empty/>`, replacing the whole dashboard — including the outstanding-liability card. Reproducible on the live DB now: `saif-sfax` has 4 ledger rows across one enrolled phone with a 130-point balance and two issued codes, and zero `earn` rows. `customers` is also the denominator of `repeatRate` and the MIN_SAMPLE gate. **Fix:** build `byPhone` from all rows, and keep a separate `purchasers` set for retention maths.

### Stamps

**M6 — `owner_set_stamps` keeps a lapsed `started_at`, so the next stamp silently deletes the owner's correction**
`supabase/migrations/0016_client_fixes.sql:123`
The comment two lines above says "a correction starts a fresh card"; the code does the opposite — `started_at = case when v_c > 0 then coalesce(loyalty_stamps.started_at, now()) else null end` preserves the OLD timestamp whenever a row exists. If it is already past `stamp_expiry_days`, `add_stamp`'s lapse branch (`0015:56-60`) zeroes the count on the very next stamp. Proved on `saif-sfax` (rolled back): row at count=4 with `started_at = now()-90 days`, `owner_set_stamps(…, 7)` → count=7, `started_at` still 90 days old → one `add_stamp` → count=1. The customer is told "7 tampons" at the till and sees 1/10 after their next coffee. Gated on `stamp_expiry_days > 0`, which is not the default. **Fix:** set `started_at = now()` whenever `v_c > 0`.

**M7 — Card expiry is applied only on the diner's shop page; the till, the client list and the wallet all show stale progress**
`app/owner/(app)/caisse/actions.ts:198`
`stampCardView` (`app/[slug]/page.tsx:309-333`) is the only reader that computes the lapse and clamps to `required-1`; its comment says "what we display has to match what the next stamp will actually do". Every other reader returns the raw count: `getStamps` (`lib/db.ts:134-146`) → `resolveCustomerAction` → `CaisseForms.tsx:486`; `owner_cards.stamps` (`0019:72`) → `CaisseForms.tsx:348`; `diner_wallet.stamps` (`0016:83`) → `WalletView.tsx:184`. Nothing resets a lapsed row in the background. Repro: card at 7 with `started_at` 90 days ago and `stamp_expiry_days=30` → diner sees 0/10, cashier sees 7/10, Clients row 7/10, wallet "7 tampons" — then one tap makes it 1/10, matching none of them. **Fix:** move the lapse computation into a shared SQL helper and call it from `getStamps`, `owner_cards` and `diner_wallet`.

### Identity & tenancy

**M8 — `card_by_code` resolves a shop's own legacy printed code to a stranger's account**
`supabase/migrations/0019_resolve_by_account_code.sql:22`
The function unions the global `accounts.code` namespace (src=1) with the per-shop `diner_cafes.code` namespace (src=2) and `order by src limit 1` makes the account branch always win — at the very shop the legacy code came from, contradicting the migration's own header ("every code … keeps working at the shop it came from. Nothing is stranded", `0019:5-8`). The namespaces were never made mutually exclusive: `0013:36` indexes `diner_cafes(business_id, code)` per-shop only, `0018:64` mints account codes checking only `accounts`, and `enroll_diner` still mints per-shop codes checking only that business. Repro: Bob's printed card at shop X reads `AB12`; Alice's account code is also `AB12`; the cashier types it, `resolveCustomer` (`caisse/actions.ts:47-51`) returns Alice, and `creditAction` credits Alice. Deterministic, so it repeats every visit. Zero collisions exist today (38 accounts, 2 cards); expected ≈ (#accounts × #cards) / 1,048,576. **Fix:** scope the account branch — `order by src` should prefer the shop's own `diner_cafes.code` when one matches.

**M9 — `createCafeAction` never re-checks "already has a café": unlimited businesses and permanent slug squatting**
`app/owner/(setup)/nouveau/actions.ts:24`
The one-café rule lives solely in the page (`nouveau/page.tsx:9`, `if (await ownerCafe()) redirect("/")`), which a direct POST never runs. `create_cafe` (`0020:15-53`) validates the slug only, and `businesses` has no unique index on `owner_id` (confirmed: `businesses_owner_idx` is a plain index). Repro: create one café legitimately, pull the action id from the client chunk, POST it with fresh slugs — each succeeds with its own 14-day trial, `loyalty_programs` row and reward ladder. `getOwnedCafe` (`lib/data.ts:126-136`) orders by `created_at` and takes the first, so every café past #1 is live and publicly joinable but unreachable from any owner screen: diners enrol, earn welcome points, and accrue balances at a counter that can never serve them. **Fix:** add `if (await ownerCafe()) return { error: … }` at the top of the action (and a unique index on `owner_id`).

**M10 — `pin_fail` is called for phones with no account: free targeted lockout and unbounded table growth**
`supabase/migrations/0004_auth.sql:31`
`pin_fail` upserts on `phone` with no existence check, and both callers invoke it unconditionally on failure (`app/moi/actions.ts:64`, `rejoindre/actions.ts:73`). The lock is keyed purely on the victim's phone — no IP, device or session dimension — and only `pin_clear` (on a successful login) ever deletes a row, so a counter parked at 4 survives indefinitely and the diner's next typo months later locks them out on the first try. Repro: send 5 `signInAction` POSTs with a target's phone and any wrong PIN; repeat every 15 minutes from a script; the victim is locked out of `/moi` indefinitely. There is no PIN reset anywhere in the codebase. **Fix:** only record a failure when the account exists (and add an IP dimension to the key).

**M11 — `super_admin` is an implicit owner of every business in RLS, so a non-elevated session has full cross-tenant write access**
`supabase/migrations/0002_rls.sql:18`
`pointili_owns_business(bid)` is `owner_id = auth.uid() or pointili_is_super_admin()`, and every tenant policy builds on it (`businesses_owner_write`, `programs_/rewards_/games_/prizes_/events_/staff_owner_write`, plus `ledger_/redemptions_/plays_/wins_/stamps_owner_read`). The 30-minute step-up cookie is path-scoped to `/admin` (`lib/auth/elevate.ts:98`) and has no bearing on RLS, and RLS carries no audit trail — contradicting the guarantee at `elevate.ts:25` ("possession of a stolen session is no longer enough"). Repro: with a super-admin's ordinary session and the public anon key, `PATCH`/`DELETE` any business (cascading its whole ledger), or `GET points_ledger?business_id=eq.<victim>`; `admin_audit` records nothing. `scripts/attack.mjs` only tests owner→owner isolation, so this never fails CI. Precondition is possession of the platform's most-privileged session, which is why this is medium and not high. **Fix:** drop `or pointili_is_super_admin()` from `pointili_owns_business` and route all admin writes through the audited RPCs.

### Routing

**M12 — Successful console step-up sends the super-admin to `/console`, a route deleted with the path rewrite**
`app/admin/login/ElevateForm.tsx:18`
`window.location.assign("/console")` — `/console` was the public alias of `/admin` under the old rewrite; commit `e6c3ade` removed `toInternal`/`toPublic` but `ElevateForm.tsx` was not in that commit. The stale premise survives verbatim in `app/admin/login/actions.ts:90,101`. Verified: `curl -D- http://app.localhost:3000/console` → 308 with `location: /console` (infinite loop); on the apex it falls through to `app/[slug]` and 404s. The cookie *is* minted before the navigation, so `/admin` works if you know to type it — this is a dead landing hop, not a lockout, but the operator sees an apparent failure and retypes the password, writing another `admin_log` row each time. **Fix:** `window.location.assign("/admin")`.

---

## 5. Low

### Points & money — analytics and till

**L1 — "Codes déjà émis, pas encore récupérés" counts codes that lapsed months ago, forever.** `lib/stats.ts:263` and `owner_cards.pending` (`0019:76-81`) filter on `status = 'pending'` with no expiry predicate — `stats.ts` does not even select `expires_at`. Nothing ever writes `status = 'expired'`; `0016_client_fixes.sql:9` names this exact bug and fixed only `diner_wallet`. Live: 4 pending redemptions, two already lapsed; the cashier's client row shows a reward the customer's phone says does not exist, and the owner's liability figure can only rise. *(Merges three reported findings.)* **Fix:** add `and (expires_at is null or expires_at > now())` to both readers.

**L2 — A fractional correction is silently discarded while the till reports "Solde corrigé".** `caisse/actions.ts:88` rejects only `delta === 0`, then :94 sends `Math.round(delta)` = 0; `owner_adjust_points` (`0011:332`) guards with `if coalesce(p_delta,0) <> 0` and still returns `ok:true` with the unchanged balance, which `CaisseForms.tsx:579` renders as a green confirmation. Type `0,4` → success banner, no ledger row. **Fix:** reject `Math.round(delta) === 0` in the action.

**L3 — The till's "→ N points" preview can be one point below what is credited.** `CaisseForms.tsx:391` floors an IEEE-754 double; `credit_points` (`0003:82`) floors exact `numeric`. At `points_per_tnd = 50`, `0.58` previews 28 and writes 29 (also 1.14, 1.16, 2.26, 2.28, 2.30, 4.02…). The preview also omits `pointili_active_multiplier` entirely. **Fix:** compute the preview in integer cents, or return the computed figure from the server before confirming.

**L4 — Analytics day boundaries use the server's timezone, not Tunisia's.** `lib/stats.ts:179` and :210 use `setHours` (process-local) while :186 labels the bucket with `toISOString()` (UTC); nothing stores or reads a café timezone. On a UTC host a "day" is 01:00–01:00 Africa/Tunis, so late-night trade lands on the wrong bar and can fall into the previous period. The comment at :209 is true only on a Tunis-local server. **Fix:** bucket with an explicit `Africa/Tunis` offset on both the boundary and the label.

### Vouchers

**L5 — `redeem_at_counter` never checks `loyalty_programs.active`; the pause is TypeScript-only.** `0003:233` checks `cafe_is_live()` and the reward's own flag but not the programme; `credit_points` (`0003:66`) and `add_stamp` (`0015:43`) both check it in SQL. Verified live (rolled back): with `active=false`, the RPC returned `{ok:true, code:'DWHMMQ'}` and debited 40 points. Reachable through the app only as a sub-millisecond check-then-act race against `saveEarnAction`, since `boutique/actions.ts:42` guards it per request. **Fix:** add the `loyalty_programs.active` check to the RPC.

**L6 — `redeem_expiry_hours` has no CHECK constraint; `0` mints dead-on-arrival vouchers that destroy the points.** `0001_init.sql:56` declares it `integer not null default 48` with no CHECK, while both sibling columns on the same table got one. The 1..8760 range lives only in `reglages/actions.ts:57`, and owners hold a direct UPDATE grant, so a PostgREST PATCH bypasses it. `coalesce(v_hrs, 48)` (`0003:270`) does not catch 0. Verified: redemption succeeded, points debited, `peek_code` immediately returned `status:'expired'`, `diner_codes` hid it. **Fix:** `alter table loyalty_programs add constraint … check (redeem_expiry_hours between 1 and 8760)`.

**L7 — `peekCode` and `getCodes` turn a database failure into "this voucher does not exist".** `lib/db.ts:272` is `if (error) return { found: false, status: "not_found" }`, which `peekAction` (`caisse/actions.ts:310`) renders as "Code introuvable."; `getCodes` (`lib/db.ts:241-248`) destructures only `data` and returns `[]`, so `/[slug]/codes` shows "Aucun code en attente". A transient pooler timeout is indistinguishable from a forged code, with no retry prompt. **Fix:** propagate the error and render a distinct "réessayez" state.

**L8 — `peek_code` reports a `cancelled` voucher as `'valid'`; `claim_code` then refuses it as "expiré".** `0011:159-165` branches only on `'claimed'` and the timestamp, then falls through to `'valid'`, while the schema allows four statuses and `claim_code` updates only `'pending'` rows. Verified (rolled back). Currently latent — nothing writes `'cancelled'` or `'expired'` — but `CaisseForms.tsx:743` shows "Collecter ✦" only for `'valid'`, so the first refund or expiry-sweep feature produces a till that offers a reward and then refuses it. **Fix:** return the raw status instead of falling through to `'valid'`.

**L9 — `redeem_at_counter` and `play_game` omit `stamp_rewards` from the code-collision check.** `0003:259-266` and `0003:188-195` check only `loyalty_redemptions ∪ wins`; `add_stamp` checks all three (`0015:70-77`), which is the evidence that per-business global uniqueness is the intended invariant. Enforcement is three separate per-table `unique (business_id, code)` constraints. On collision (~1e-9), `claim_code` serves the redemption in its fixed order and the stamp voucher stays pending forever while `peek_code` reports it "claimed" — a completed stamp card destroyed with no trace. *(Merges two findings.)* **Fix:** add `stamp_rewards` to both `not exists` checks.

**L10 — Code-mint loops are check-then-insert with no `unique_violation` retry.** `0003:257-268`, `0003:186-198` and `0015:70-81` guard only with a prior SELECT; the advisory locks are keyed on business+phone, so two diners at one shop mint in parallel. A genuine concurrent duplicate raises an error that aborts the transaction (rolling back the points debit) rather than retrying — unlike `create_account` (`0018:92-106`) and `enroll_diner` (`0013:49-61`), which do catch it. **Fix:** wrap each insert in `exception when unique_violation then continue`.

**L11 — `play_game`'s passport insert relies on the `diner_cafes.code` DEFAULT with no retry.** `0003:178-181` inserts with `on conflict (phone, business_id) do nothing`, letting `pointili_gen_short()` fill `code`; a collision raises `unique_violation` on the *different* index `diner_cafes_code_uidx`, which that ON CONFLICT target does not absorb, aborting the spin. Confirmed latent: `playGame` has no caller anywhere (`lib/db.ts:202` only). **Fix:** call `enroll_diner` instead of inlining the insert.

**L12 — Points spent on a voucher are destroyed when the shop goes dark before the code is collected.** `redeem_at_counter` debits and mints atomically, but every diner screen that could *show* the 6-char code re-checks liveness (`codes/page.tsx:30`, `page.tsx:26`, `profil/page.tsx:28`) while `diner_wallet` (`0016:65-108`) applies no liveness filter and keeps rendering a "N à récupérer" badge that links only to `/{slug}` (`WalletView.tsx:159`). Nothing writes a compensating `reason='expire'` row, and re-redeeming is refused. Note this is the general voucher-expiry policy, not a dark-shop bug — an uncollected code in a healthy café burns the same points as silently. **Fix:** exempt `/[slug]/codes` from the liveness gate (or surface the code in the wallet).

### Stamps

**L13 — A phone that only ever received stamps is invisible in the owner's client list.** `owner_cards` builds `people` as `diner_cafes ∪ points_ledger` (`0019:55-59`); `add_stamp` writes neither, and `diner_cafes.phone` has an FK to `accounts` so a walk-in cannot be there. `0017`'s header claims "every phone this business has touched". Proved (rolled back): `add_stamp` for a walk-in created the card, `owner_cards` returned `total=1` with no entry for it. Correction is still reachable by typing the phone directly, and codes issued to a mistyped number are inert (no account, so `diner_codes` is never queried) — so this is unauditable data, not leaking value. **Fix:** union `loyalty_stamps.phone` into `people`.

**L14 — Switching the stamp card off does not pause the expiry clock.** The lapse test (`0015:56-57`) has no notion of a pause, nothing records when `stamps_enabled` flipped, and `saveStampsAction` (`reglages/actions.ts:110`) touches no `loyalty_stamps` row — contradicting the header at `0015:9` ("Disabling stamps freezes progress"). A two-month refit with `stamp_expiry_days=60` wipes every card older than the window on the first day back. Only bites when expiry is configured, which is not the default. **Fix:** record `stamps_paused_at` and exclude paused intervals from the lapse test.

**L15 — `owner_set_stamps` takes no advisory lock while `add_stamp` does.** `add_stamp` opens with `pg_advisory_xact_lock(hashtext(business || ':stamp:' || phone))` (`0015:36`), reads `count` with a plain SELECT (`0015:50-51`, no FOR UPDATE) and writes back an absolute value (`0015:88`). `owner_set_stamps` (`0016:111-127`) upserts the same row with no lock, so the two collide only on the row lock: an owner correction committing inside `add_stamp`'s window is overwritten wholesale, and `loyalty_stamps` has no audit trail to show it ever happened. *(Merges two findings.)* **Fix:** take the same advisory lock in `owner_set_stamps`.

### Identity

**L16 — `normalisePhone` strips the trunk zero only on bare numbers.** The `+` branch (`lib/auth/crypto.ts:132`) and the `00` branch (:134) skip the strip that the bare branch does at :148, and `isValidPhone` accepts the 13-digit result. `"+216 (0) 20 123 456"` and `"00216020123456"` yield `+216020123456` — a second, fully valid identity — while the three ordinary spellings all collapse to `+21620123456`. The docstring at :124-128 says they MUST collapse. Signup uses a free-text `tel` input. **Fix:** strip leading zeros after the country code in all three branches.

**L17 — A successful signup never clears `pin_attempts`.** At `rejoindre/actions.ts:90`, `existing` is reassigned only inside the `if (!created.ok)` branch (:91-94), so on the success path the `if (existing)` block at :97-103 — the only caller of `pinClear` — is skipped. Mistype a phone four times on the "j'ai déjà une carte" tab, then sign up successfully on that number: the new account starts with `count = 4` and the next wrong PIN locks it immediately. Capped at 4, since `pin_fail` resets on lock. **Fix:** call `pinClear(phone)` on the account-created path too.

**L18 — `getAccount` discards Supabase errors, so a DB blip counts as a failed PIN against the victim.** `lib/db.ts:31-37` returns `data ?? null` with no error branch; `app/moi/actions.ts:61-64` treats that null as a bad credential and calls `pinFail`. Five transient failures during legitimate sign-ins lock the account for 15 minutes and tell the user their PIN is wrong. **Fix:** return a distinct error and skip `pinFail` when the lookup itself failed.

**L19 — The till's customer resolver is an unrate-limited platform-wide directory oracle.** `card_by_code`'s account branch (`0019:22-25`) matches globally with no business predicate, `resolveCustomerAction` (`caisse/actions.ts:170-200`) returns the holder's `name` with no attempt counter or throttle (the only rate limiting in the repo is the two diner PIN paths), and the all-digits branch (:53-58) is a yes/no membership oracle for any phone. Admission is one confirmed email plus a 14-day trial. The payload is thin — the phone is never returned, `balance`/`stamps` are computed against the attacker's own café so they read 0, and knowing a code grants no ability to spend — so this is enumeration and spam, not a data breach. *(Merges two findings.)* **Fix:** rate-limit `resolveCustomerAction` per owner and log misses.

**L20 — `/[slug]/rejoindre` is the only diner surface with no `cafe.live` gate.** Every sibling page carries `if (!cafe.live) return <CafeClosed …>` with the identical comment about layouts not re-running on client transitions (`page.tsx:26`, `boutique:20`, `codes:30`, `historique:39`, `profil:28`, `scanner:28`); `rejoindre/page.tsx:16` and `joinAction` (`actions.ts:47-48`) stop at `if (!cafe)` and then **write** — `enrollDiner` at :119 (and `enroll_diner` has no `cafe_is_live` gate either) and `creditPoints` at :124, whose `ok:false` result is discarded. No points are minted (`credit_points` fails closed), so the residue is an orphan `diner_cafes` row that shows as a dead card in `/cartes` forever. *(Merges three findings.)* **Fix:** add the liveness check to `rejoindre/page.tsx` and `joinAction`.

### Routing & cache

**L21 — Expired or reused Supabase e-mail links redirect to `/login`, which is not a route.** `app/auth/callback/route.ts:33`. There is no `app/login`; the owner login is at `/owner/login`, and "login" is in `RESERVED_SLUGS` and both SQL copies, so `/[slug]` `notFound()`s. On the app host the path is not business-classified, so proxy 308s it to the apex and it 404s there. Verified: `curl` → `307 http://localhost:3000/login?lien=expire` → 404. The `?lien=expire` hint is never rendered by anything. *(Merges two findings.)* **Fix:** redirect to `/owner/login?lien=expire`.

**L22 — Open redirect in `/auth/callback`: the `?next` guard blocks `//` but not `/\` or `/<tab>/`.** `route.ts:22` accepts anything matching `startsWith("/") && !startsWith("//")`, then :28 does `new URL(safeNext, url.origin)`; the WHATWG parser treats backslash as a separator and strips tabs, so `/\evil.com` and `/%09/evil.com` both resolve to `https://evil.com/`, contradicting the comment at :16. Reproduced. **Not currently exploitable:** the redirect fires only after a successful PKCE exchange, which needs the `code_verifier` cookie from the browser that *initiated* the flow, and nothing in the codebase ever sets `redirectTo`/`emailRedirectTo` or links to the callback with a `next`. **Fix:** validate with `/^\/[a-z0-9\-_/?=&.]*$/i` after rejecting backslashes and control characters.

**L23 — The app-host → apex 308 emits a relative `Location` on `app.localhost`, so every customer path on the business host redirects to itself forever.** `proxy.ts:62` sets `to.host = apexHost(host)`, but in dev Next resolves `request.url` against the server's own origin, so the target equals the origin and Location serialises bare. Verified: `curl -D- http://app.localhost:3000/moi` → `308` + `location: /moi`; `curl -L` exits 47. The control `-H 'Host: app.example.test:3000'` correctly emits an absolute URL, pinning the cause to localhost. Confined to `next dev` — but AGENTS.md documents `app.localhost:3000` as the business side, and this masks L21/M12 as redirect loops instead of 404s (likely why `scripts/test-console.mjs:77` was believed to pass). **Fix:** build the redirect from `request.nextUrl` with an explicit absolute origin.

**L24 — PASSTHROUGH prefixes are not reserved slugs.** `lib/hosts.ts:24-28` short-circuits all host enforcement for `/favicon`, `/icon`, `/apple-icon`, `/robots`, `/sitemap`; the reserved lists contain only the *dotted* filenames, which the slug regex can never produce anyway. `slug_available('icon'|'robots'|'sitemap'|'favicon')` all return true. A café slugged `robots` answers on **both** hosts, breaking the one-address invariant proxy.ts exists to enforce — and since `pointili_diner` is host-only on the apex, the diner signs in again on the business host and grows a second independent session. **Fix:** add the bare words to `RESERVED_SLUGS` and both SQL copies.

**L25 — "console" is missing from `RESERVED_SLUGS` and both SQL copies.** `lib/data.ts:28-31`, `0020:28-29` and `0020:57-58` omit it, though it is still the post-elevation target (`ElevateForm.tsx:18`) and is named as a live path at `lib/hosts.ts:5`. `slug_available('console')` returns true on the live DB. Once a shop registers it, the broken elevation hop stops 404ing and instead drops a platform operator into an arbitrary merchant's `/console/rejoindre` signup form. **Fix:** add `"console"` to all three lists.

**L26 — `appHost()` blindly prefixes `"app."`.** `lib/hosts.ts:47-49` returns `app.${host}` with no allowlist, and `proxy.ts:65-69` sends every `/owner` and `/admin` request there. Verified: `-H 'Host: www.pointili.online'` → `location: http://app.www.pointili.online:3000/owner`. Any alias, preview URL, staging domain or IP yields a name with no DNS record, and a 308 is browser-cached so the breakage outlives the fix. **Fix:** derive the target from an env-configured canonical host rather than the inbound `Host`.

**L27 — Owner sign-out leaves the 30-minute elevation cookie alive.** `app/owner/(auth)/login/actions.ts:66-72` calls `signOut()` and redirects but never `clearElevation()` — and clearing would work from there, since `elevate.ts:105` deletes by explicit `path: "/admin"`. Only `adminLogoutAction`/`dropElevationAction` clear it, and neither is reachable from the owner app. The residue is narrow (`requireElevatedSuperAdmin` calls `requireSuperAdmin()` first, so the orphan cookie grants nothing without a live session), but it is exactly the "leaked session" threat `elevate.ts:25` claims to have closed. **Fix:** call `clearElevation()` in `logoutAction`.

### Platform lifecycle

**L28 — `admin_set_plan` is a read-modify-write with no lock; concurrent grants lose a subscription extension.** `0008_plan_units.sql:47-48` reads the baseline into `v_from` with no FOR UPDATE, computes `v_until` at :51, and UPDATEs at :54-56 — the second writer blocks on the row lock but does not re-read, so two "+1 month" grants produce +1 month. It is the only lock-free read-modify-write among the value RPCs. Requires two super-admins acting simultaneously. **Fix:** compute the new expiry inside the UPDATE (`plan_expires_at = greatest(now(), coalesce(plan_expires_at, now())) + …`).

**L29 — `admin_set_plan`'s "0 = cut off now" silently does the opposite on a café already on the free plan.** `0008:35-37` sets `v_until := null` for `p_plan = 'free'` and returns before the `p_amount = 0 → now()` branch at :51 is reached, and `cafe_is_live` treats a null expiry as live. The plan `<select>` defaults to the café's current plan (`CafeControls.tsx:49`), so a free café arrives pre-selected on the one plan where 0 means "forever". Mitigated: the same help text says «Gratuit» = sans limite, and the real emergency lever is Modération → Suspendre. **Fix:** move the `p_amount = 0` check ahead of the plan branch.

**L30 — Retracting a platform notice writes no audit row.** `admin_dismiss_notice` (`0007:231-240`) checks `is_super` and then UPDATEs with no `perform admin_log`, while `admin_set_plan` (:160), `admin_set_suspended` (:191) and `admin_notice` (:223) all log — and the file header at :60 says "every privileged action is written down, immutably", echoed at `admin/(console)/actions.ts:31-33`. Nothing ever sets `active` back to true, so an urgent platform-wide message can be permanently killed with no record of who did it. **Fix:** add the `admin_log` call.

**L31 — A notice posted with 0 days never expires, while 0 means "immediately" for the plan lever in the same drawer.** `0007:220` is `case when p_days > 0 then now() + make_interval(days => p_days) end` with no ELSE, so 0 (or a negative from a crafted request — `actions.ts:152` checks only `Number.isInteger`) yields NULL, which both the RLS policy (:55) and `owner_notices` (:327) treat as never-expiring. Both `min={0}` inputs sit in the same drawer meaning opposite things. **Fix:** `else now()` in the CASE, and reject negative `p_days`.

---

## 6. Full table

| # | Title | Area | Sev | file:line |
|---|---|---|---|---|
| C1 | Owner self-promotes to `super_admin` via `profiles` UPDATE grant | tenancy | **critical** | `supabase/migrations/0006_grants.sql:37` |
| H1 | Owner self-grants unlimited plan / lifts suspension via `businesses` UPDATE grant | tenancy | high | `supabase/migrations/0006_grants.sql:43` |
| H2 | Lowering `stamps_required` mints multiple free vouchers in one tap | stamps | high | `supabase/migrations/0015_stamp_expiry.sql:65` |
| H3 | PIN lockout is check-then-act; concurrency defeats the 5-try gate | identity | high | `app/moi/actions.ts:46` |
| H4 | Till credit/stamp has no idempotency or busy guard | races | high | `app/owner/(app)/caisse/CaisseForms.tsx:509` |
| M1 | `owner_adjust_points` has no `cafe_is_live` gate | lifecycle | medium | `supabase/migrations/0011_stamps.sql:329` |
| M2 | Adjust can drive a balance arbitrarily negative | points-money | medium | `app/owner/(app)/caisse/actions.ts:89` |
| M3 | Revenue back-computed at the current earn rate | points-money | medium | `lib/stats.ts:158` |
| M4 | Ledger read is unpaginated; figures freeze past ~1000 rows | points-money | medium | `lib/stats.ts:95` |
| M5 | `customers` counted from `earn` only; dashboard suppressed | points-money | medium | `lib/stats.ts:127` |
| M6 | `owner_set_stamps` keeps a lapsed `started_at` | stamps | medium | `supabase/migrations/0016_client_fixes.sql:123` |
| M7 | Stamp expiry applied in only one of four readers | stamps | medium | `app/owner/(app)/caisse/actions.ts:198` |
| M8 | `card_by_code` shadows a legacy printed code with a stranger's account | identity | medium | `supabase/migrations/0019_resolve_by_account_code.sql:22` |
| M9 | `createCafeAction` never re-checks "already has a café" | lifecycle | medium | `app/owner/(setup)/nouveau/actions.ts:24` |
| M10 | `pin_fail` on nonexistent phones: targeted lockout DoS | identity | medium | `supabase/migrations/0004_auth.sql:31` |
| M11 | `super_admin` is an implicit owner in RLS | tenancy | medium | `supabase/migrations/0002_rls.sql:18` |
| M12 | Elevation success redirects to `/console`, a deleted route | routing | medium | `app/admin/login/ElevateForm.tsx:18` |
| L1 | Pending-voucher counts include lapsed codes forever | points-money | low | `lib/stats.ts:263` / `0019:77` |
| L2 | Fractional correction discarded, "Solde corrigé" shown | points-money | low | `app/owner/(app)/caisse/actions.ts:94` |
| L3 | Preview floors in doubles, RPC floors in numeric | points-money | low | `app/owner/(app)/caisse/CaisseForms.tsx:391` |
| L4 | Analytics day boundaries use the server timezone | points-money | low | `lib/stats.ts:179` |
| L5 | `redeem_at_counter` ignores `loyalty_programs.active` | vouchers | low | `supabase/migrations/0003_rpcs.sql:233` |
| L6 | `redeem_expiry_hours` has no CHECK; 0 mints dead vouchers | vouchers | low | `supabase/migrations/0001_init.sql:56` |
| L7 | `peekCode`/`getCodes` swallow DB errors as "not found" | vouchers | low | `lib/db.ts:272` |
| L8 | `peek_code` reports `cancelled` as `valid` | vouchers | low | `supabase/migrations/0011_stamps.sql:165` |
| L9 | Mint loops omit `stamp_rewards` from the collision check | vouchers | low | `supabase/migrations/0003_rpcs.sql:259` |
| L10 | Mint loops have no `unique_violation` retry | races | low | `supabase/migrations/0003_rpcs.sql:258` |
| L11 | `play_game` relies on the `diner_cafes.code` DEFAULT | races | low | `supabase/migrations/0003_rpcs.sql:179` |
| L12 | Spent points destroyed when the shop goes dark pre-collection | lifecycle | low | `app/[slug]/codes/page.tsx:30` |
| L13 | Stamps-only phone invisible in `owner_cards` | stamps | low | `supabase/migrations/0019_resolve_by_account_code.sql:56` |
| L14 | Disabling stamps does not pause the expiry clock | stamps | low | `supabase/migrations/0015_stamp_expiry.sql:56` |
| L15 | `owner_set_stamps` skips `add_stamp`'s advisory lock | races | low | `supabase/migrations/0016_client_fixes.sql:119` |
| L16 | `normalisePhone` skips the trunk zero on `+`/`00` forms | identity | low | `lib/auth/crypto.ts:131` |
| L17 | Successful signup never clears `pin_attempts` | identity | low | `app/[slug]/rejoindre/actions.ts:90` |
| L18 | `getAccount` swallows errors → blip counts as a failed PIN | identity | low | `lib/db.ts:38` |
| L19 | Unrate-limited platform-wide directory oracle at the till | tenancy | low | `app/owner/(app)/caisse/actions.ts:47` |
| L20 | `/[slug]/rejoindre` has no `cafe.live` gate and writes on GET | lifecycle | low | `app/[slug]/rejoindre/page.tsx:16` |
| L21 | Auth-callback failure redirects to `/login`, not a route | routing | low | `app/auth/callback/route.ts:33` |
| L22 | `?next` guard misses `/\` and `/<tab>/` (latent open redirect) | routing | low | `app/auth/callback/route.ts:22` |
| L23 | Relative `Location` on `app.localhost` → infinite 308 loop in dev | routing | low | `proxy.ts:62` |
| L24 | PASSTHROUGH prefixes are not reserved slugs | routing | low | `lib/hosts.ts:24` |
| L25 | `"console"` missing from `RESERVED_SLUGS` and both SQL copies | routing | low | `lib/data.ts:28` |
| L26 | `appHost()` blindly prefixes `"app."` | routing | low | `lib/hosts.ts:47` |
| L27 | Owner sign-out leaves the elevation cookie alive | routing | low | `app/owner/(auth)/login/actions.ts:66` |
| L28 | `admin_set_plan` lost update (no lock) | races | low | `supabase/migrations/0008_plan_units.sql:47` |
| L29 | `admin_set_plan` "0 = cut now" is unreachable on the free plan | lifecycle | low | `supabase/migrations/0008_plan_units.sql:35` |
| L30 | `admin_dismiss_notice` writes no audit row | lifecycle | low | `supabase/migrations/0007_platform.sql:237` |
| L31 | Notice with 0 days never expires | lifecycle | low | `supabase/migrations/0007_platform.sql:220` |

---

## 7. What I could not settle

Five things are genuinely unresolved. I would rather flag them than assert them.

**7.1 — Is the PostgREST row ceiling actually 1000 on this project? (M4)**
The code defect is certain — there is no `.range()` and no pagination loop. What I could not confirm is where truncation bites. `select setconfig from pg_db_role_setting` shows no `pgrst.*` entry for this project (only `statement_timeout` and `lock_timeout`), so the 1000 figure rests on the Supabase hosted default rather than on anything in this repo. *Settled by:* checking `db-max-rows` in the project's API settings, or inserting 1500 ledger rows for one business and counting what `getStats` receives.

**7.2 — Does the PIN race actually land a full concurrent batch? (H3)**
The check-then-act window is unambiguous in the code, and the gate read genuinely precedes the scrypt. What I did not do is fire the batch. Next's server-action handling, the Supabase connection pool, and scrypt's cost could serialise requests enough to reduce the practical parallelism well below 1000 — which changes the sweep from 2.5 hours to something longer, though not to "safe". *Settled by:* a concurrency harness against the dev server counting how many of N simultaneous wrong-PIN POSTs get past `pinLockedFor`. This is the single most valuable experiment on the list.

**7.3 — What timezone does production actually run in? (L4)**
Nothing in the repo sets `TZ` and nothing stores a per-café timezone, so the bug is real either way — but *which* bug depends on the host. On UTC, the buckets are UTC days and late-night Tunis trade lands on the previous bar. On `Africa/Tunis`, the buckets are right and the `toISOString()` **label** names the wrong date. *Settled by:* reading `Intl.DateTimeFormat().resolvedOptions().timeZone` on the deployed runtime.

**7.4 — Does the till double-fire reproduce on real hardware? (H4)**
The missing `busy` guard and the missing `disabled` on the Enter handler are both plain in the source, and the server has no dedupe. But whether React 19's transition batching plus the browser's key-repeat timing actually produces two committed POSTs — rather than one — I did not observe. *Settled by:* holding Enter at the till with the network panel open, or replaying the action POST twice with the same payload and diffing `points_ledger`. Note the replay half needs no observation: server actions are public endpoints and there is no idempotency token, so a deliberate replay definitely doubles.

**7.5 — Migration re-runnability.**
I read all twenty migrations and found no obviously non-idempotent statement — the function definitions are `create or replace` throughout and the DDL is guarded. But I did **not** execute the set against a fresh database, which is the only real test, and several later migrations redefine functions from earlier ones in ways that make ordering load-bearing (`owner_set_stamps` is defined in 0011 and redefined in 0016; `create_cafe` in 0016 and again in 0020). *Settled by:* `supabase db reset` against a scratch project, twice.

One non-finding worth recording: I specifically looked for a business row without a `loyalty_programs` row (which would let `getLoyaltyProgram`'s `active: true` default at `lib/data.ts:161` bypass the TypeScript pause gate) and there are **zero** — both versions of `create_cafe` seed the row in the same transaction. That path is closed.

---

## 8. Confirmed against the LIVE database (added after the audit)

These four were checked directly against production data rather than inferred
from source, so they carry evidence rather than reasoning.

**E1 — C1 and H1 are real, verified on the live grant table.** `information_schema.role_table_grants` returns, for grantee `authenticated` in `public`:
`profiles` → SELECT, **UPDATE**; `businesses` → SELECT, INSERT, **UPDATE**, DELETE.
Both are table-level with no column list. The only policy on `profiles` is
`profiles_self`, `cmd = ALL`, with both USING and WITH CHECK equal to
`((id = auth.uid()) OR pointili_is_super_admin())` — a ROW filter. Nothing
constrains the `role` column. Signup is open, so the escalation is reachable by
anyone. **This is the single most important item on the list.**

**E2 — `status = 'expired'` is never written by anything.** Live counts:
`loyalty_redemptions` is `{pending: 3}` and `stamp_rewards` is empty — no row in
either table has ever reached `expired` or `cancelled`. Two of those three
pending rows are already past `expires_at` (2026-07-26 and 2026-07-27). So the
`status` column does not mean what its name says: "pending" includes "dead".
Confirms **L1** with data — every consumer that filters on status alone
over-counts, including the owner's "Codes déjà émis, pas encore récupérés".

**E3 — `pin_attempts.count` never decays, confirmed on live rows.** Three phones
still carry `count = 1` with `locked_until = null` and `updated_at` three days
old. Nothing reads `updated_at` to age the counter and `pin_clear` only fires on
a *correct* PIN. Consequence in both directions: every phone has exactly four
free lifetime guesses that trip no lockout, and a real customer who fumbles four
times over six months is locked out on their fifth ever mistake.

**E4 — The legacy per-shop code still shadows one account.** One `diner_cafes`
row has a `code` differing from its owner's `accounts.code`. That is the
expected outcome of the 0018 backfill (the oldest card won), but
`card_by_code` still resolves the legacy value, so **two different 4-character
codes reach the same person at the same shop** — and the diner is only ever
shown one of them. Related to **M8**; it is the reason that finding is
reachable at all. It stays true until `diner_cafes.code` is dropped.

### Invariants that HELD on live data
Worth recording, because they are the ones that would hurt most:
no negative balances · no duplicate account codes · no account without a code ·
no ledger row for a phone with no account · no `welcome` granted twice for the
same (business, phone) · no stamp counter at or above its shop's requirement ·
no café with an expired plan still marked `status = 'active'`.
