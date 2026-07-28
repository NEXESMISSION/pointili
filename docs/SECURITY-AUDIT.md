# THE SECURITY LIST

## 1. Verdict

Pointili is not shippable in its current state. One person with an email address and a browser can end the company: owner signup is open, `authenticated` holds UPDATE on `profiles`, and `pointili_owns_business()` treats super-admin as ownership of every row — so a self-service PATCH to your own profile row followed by one DELETE against `/rest/v1/businesses` erases every café, every ledger, every balance and every outstanding voucher on the platform, through 13 cascading foreign keys, using only the anon key that ships in the page bundle. Below that, the diner identity layer has no proof of possession anywhere: the join form mints an account for any phone number you type, with your PIN, permanently — which is simultaneously a "is this number a Pointili customer?" oracle over the whole Tunisian mobile range, a theft of any walk-in points a till has already parked against that number, and an irreversible lockout of the real owner, because no PIN reset exists in the product. Nothing in the entire codebase rate-limits anything except a per-phone PIN counter, so the same endpoint is also a free CPU amplifier (a full scrypt per unauthenticated request against a 4-thread libuv pool) and a slow-burn exhaustion of the 1,048,576-value global account-code namespace. And any owner — a role anyone can self-issue — can resolve any phone number or any 4-character code to a real diner's name and global code, unthrottled and unaudited, across every tenant.

**What I tried and could not make work.** The step-up elevation for `/admin` is genuinely good and I could not forge, replay or extend it: separate secret, constant-time compare, bound to the user id, 30-minute TTL, httpOnly + SameSite=Strict + path-scoped. (Its weakness is not the cookie — it is that the database-level super-admin power it guards needs no elevation at all.) `anon` cannot reach `accounts`, `pin_attempts`, `diner_cafes` or `diner_streaks` — the grant is revoked and RLS has zero policies; a live anon session was refused. `suspended_reason` is not actually leaking, because suspension sets `status='disabled'` which the public-read policy excludes. The cross-tenant resolver leaks far less than it first appears: balance, stamps and history are all fetched with the *attacker's own* café id, so a swept stranger returns 0, 0 and an empty list — and the 4-char code is not a spend credential, since no owner action redeems another person's points and the collect path needs a separate 6-char voucher. The `<img src>` CSRF against the join page does **not** fire: SameSite=Lax keeps the diner cookie off subresource requests, and the writes are idempotent anyway — only a visible top-level navigation works. The balance overflow does **not** work sequentially, because the adjust RPC recomputes the balance inside its own transaction and rolls itself back; it needs concurrent writers. Logo/reward images are directly writable past the app validation, but SVG is rejected and `javascript:`/SVG data URIs in `<img src>` are inert — beaconing only, no script. I could not demonstrate voucher-code prediction from Postgres `random()` through pooled backends, and the voucher collision defect is not attacker-controllable. No SQL injection anywhere — every RPC is parameterised. Server-action POST endpoints are covered by Next's own Origin check; I found no bypass.

---

## 2. Fix before launch

Ordered by how little effort the attack takes, not by how bad it sounds.

**1. One self-service PATCH promotes you to super-admin; the next DELETE erases the platform.**
*Attacker:* anyone who completes the open owner signup. *Attack:* PATCH `/rest/v1/profiles?id=eq.<own uid>` with `role=super_admin` (grant + `profiles_self` policy), then DELETE `/rest/v1/businesses?id=neq.<any uuid>` — `pointili_owns_business()` is `owner_id = auth.uid() OR is_super_admin()`, `businesses_owner_write` is FOR ALL so USING governs DELETE, and `authenticated` holds DELETE. Anon key only. *Gain:* read every tenant's ledgers, rewrite every tenant's rewards and wheel odds, and destroy all 13 child tables by cascade in a single request. Irrecoverable without a backup.
`supabase/migrations/0006_grants.sql:37` + `supabase/migrations/0002_rls.sql:18`
*Fix:* revoke UPDATE on `profiles` from `authenticated`, and split super-admin reach out of `pointili_owns_business` so it never lands on a FOR ALL delete path.

**2. Signup binds any phone number to the attacker's PIN, permanently.**
*Attacker:* anyone, unauthenticated, with one public café slug. *Attack:* POST `joinAction` with a victim's number and any PIN; an unknown number falls into account creation and returns a redirect plus a diner session, a known number returns the generic credential error — two distinguishable answers, and the per-phone throttle never fires across distinct numbers. *Gain:* a registered/not-registered map of any number range; permanent squat of every miss (no PIN reset exists); and any points a till already banked against that number as a walk-in, spendable at every shop on the platform.
`app/[slug]/rejoindre/actions.ts:90`
*Fix:* require an SMS one-time code for the number before `create_account` may bind a PIN to it.

**3. Every unauthenticated login attempt burns a full scrypt, and rotating the phone bypasses the only throttle.**
*Attacker:* anyone, one host, no session. *Attack:* POST `signInAction` at the fixed global `/moi` URL with a fresh number each time; the lockout is keyed per phone, and the code deliberately derives against a dummy hash for unknown numbers, so every request costs ~16 MB and ~37 ms of dedicated threadpool time before anything can reject it. *Gain:* a few hundred concurrent requests saturate the 4-thread libuv pool — shared with DNS, so outbound Supabase calls stall too — and the till, the diner cards and the login form all go down together. Free, stateless, indefinite.
`app/moi/actions.ts:62`
*Fix:* per-IP rate limit in `proxy.ts` in front of both PIN endpoints, before any scrypt runs.

**4. Account creation is unlimited and consumes a shared 1M-value namespace.**
*Attacker:* anyone with curl and one public slug. *Attack:* loop `joinAction` with fresh phone strings — the validator accepts any `+` and 8–15 digits, and a *successful* signup increments no counter anywhere. *Gain:* two scrypts and three service-role round trips per request as a CPU sink; and sustained signups eat the global 4-char code space until `create_account` starts raising "no free account code after 20 tries" and legitimate signups fail platform-wide. Each request also plants a membership row and a welcome ledger row at the targeted shop.
`app/[slug]/rejoindre/actions.ts:51`
*Fix:* per-IP rate limit plus proof of phone ownership before `create_account` mints a code, and widen the code to 5 characters.

**5. Five requests lock any diner out of their own account, forever.**
*Attacker:* anyone who knows a mobile number. *Attack:* five wrong PINs sets a 15-minute lock keyed on the phone alone, with no attacker-side cost and no decay; repeat 20 requests/hour to hold it indefinitely, thousands of victims concurrently from one host. Because the throttle is checked before the account lookup, the same five requests against an *unregistered* number block that person from ever signing up. *Gain:* total denial of a diner's points and codes at every shop, with no reset path and no support lever in the product.
`app/moi/actions.ts:64` + `supabase/migrations/0004_auth.sql:21`
*Fix:* key the throttle on (phone, source IP) with progressive delay instead of a hard per-phone lock.

**6. Any self-issued owner can turn any phone number or any 4-char code into a real diner's name.**
*Attacker:* anyone — signup is open and café creation is self-serve. *Attack:* POST `resolveCustomerAction` in a loop. The all-digits branch reads `accounts` filtered on phone with no business predicate; the alphanumeric branch matches `accounts.code` platform-wide with no business predicate. 32^4 = 1,048,576 codes, no rate limit, no lockout, no audit anywhere in the repo. *Gain:* name + global account code for every diner on the platform, plus a definitive "is this number a Pointili customer" oracle — precisely the oracle `/moi` burns a scrypt to avoid.
`app/owner/(app)/caisse/actions.ts:57` + `supabase/migrations/0019_resolve_by_account_code.sql:25`
*Fix:* resolve a global code or phone only when the business already has a relationship with it, and rate-limit + audit the resolver per owner.

---

## 3. Fix soon

**7. Owner session cookies are neither Secure nor HttpOnly and live 400 days.** Anyone on the same network as an owner, or any future XSS on the business host, reads `sb-*-auth-token` in cleartext — the package default is passed through untouched and there is no HSTS. The diner cookie is hardened; the owner one is not. *Fix:* pass `cookieOptions:{secure:true, httpOnly:true, maxAge:<short>}` in both server clients and add HSTS. `lib/supabase/server.ts:23`

**8. `anon` reads every column of every live café.** Row-level RLS with a table-wide grant: owner uuid, plan, plan_expires_at, design settings, the full loyalty economics, and every wheel's odds and rigged-to-lose segments — unauthenticated, and nothing in the app needs it (the only browser client is imported by zero files). *Fix:* column-level grant to `anon`, or revoke it entirely. `supabase/migrations/0006_grants.sql:24`

**9. Enrolment happens during a GET render.** A hostile owner sends a link; SameSite=Lax carries the diner cookie on the top-level navigation and the page enrols and credits before any interaction. The victim then appears in the attacker's till list with their raw phone number, name and global code. *Fix:* move the enrol + welcome writes behind an explicit POST action. `app/[slug]/rejoindre/page.tsx:36`

**10. The adjust RPC writes a ledger row for any phone with no membership check and no floor.** One call puts an attacker-named, attacker-logo card in a stranger's wallet showing −1,000,000, repeatable across harvested codes. *Fix:* refuse the write unless the phone already has a relationship with this business, and floor the balance at 0. `supabase/migrations/0011_stamps.sql:333`

**11. The balance sum is cast to `integer`.** Several concurrent adjust calls from a sum just under the boundary commit together (no advisory lock on this path); after that the wallet RPC throws for *every* café the victim has touched, the error is swallowed, and their entire wallet renders blank. *Fix:* return bigint, or clamp the sum before the cast. `supabase/migrations/0003_rpcs.sql:11`

**12. All auth traffic reaches GoTrue from the server's single IP, and every error collapses to one string.** One attacker consumes the project-wide sign-in budget for every owner on the platform, and the resulting outage is indistinguishable from a forgotten password. The unthrottled signup path also lets anyone mail-bomb arbitrary addresses with Pointili-branded confirmation mail. *Fix:* rate-limit both actions per client IP before calling Supabase and forward the real client IP. `app/owner/(auth)/login/actions.ts:27`

**13. Nothing caps row count or column length on any owner-writable table.** A self-issued owner POSTs directly to PostgREST with the anon key and their JWT — the app's 500 KB image cap is never reached. Unbounded storage billed to the platform, and the public shop page inlines every reward's data URI on every request. *Fix:* length CHECKs plus a per-business row-count trigger, and route writes through service-role RPCs. `supabase/migrations/0006_grants.sql:44`

**14. The till roster query materialises every cardholder on every load.** Balance plus three correlated counts plus a max-scan per row, with the limit applied afterwards and the CTE referenced twice — so mass-joining a competitor's shop with the unauthenticated signup primitive times out their caisse on load and on every keystroke. Analytics dies with it: the stats query pulls the whole ledger with no limit and no date filter. *Fix:* filter and paginate in one indexed query and precompute the per-card aggregates. `supabase/migrations/0019_resolve_by_account_code.sql:55`

---

## 4. Backlog

**15. The till ships every cardholder's raw phone number to the browser** — contradicting two comments that assert it does not, and the product's own "pas besoin de donner ton numéro" promise. Scoped to the shop's own customers, so the new exposure is diners who identified by code alone. *Fix:* return only the masked tail. `app/owner/(app)/caisse/actions.ts:130`

**16. Suspension and plan expiry are not enforced on the correction paths.** A café the platform switched off keeps appending points and setting stamps; the value cannot be spent while dark, but it inflates the moment the café is restored. *Fix:* add the same live-café guard to `owner_adjust_points` and `owner_set_stamps`. `app/owner/(app)/caisse/actions.ts:87`

**17. A diner session is a 90-day bearer token that nothing can revoke.** No jti, no version, no sessions table; logout is a cookie delete on the victim's own browser. Anyone who obtains the value once impersonates that diner for 90 days. *Fix:* put a token version in the payload, store it on the account, and bump it on logout. `lib/auth/diner.ts:25`

**18. Every pending voucher code in the shop is dumpable from the till browser, and burning one leaves no trace of who did it.** The session JWT is readable by JS, the grant includes the `code` column, and the claim only records a timestamp. Insider accountability gap, not a boundary break. *Fix:* drop `code` from what `authenticated` may select and record `claimed_by` on every claim. `supabase/migrations/0006_grants.sql:50`

**19. Voucher codes come from a simulation PRNG, and two of the three minting paths omit `stamp_rewards` from the collision check.** Latent, not exploitable — the space is 1.07e9 and the attacker controls neither the code nor the victim. *Fix:* mint from `gen_random_bytes()` and add the missing branch to the collision check. `supabase/migrations/0003_rpcs.sql:29` and `:261`

**20. The signup action returns the raw auth error verbatim,** thirty lines below a login action that is deliberately vague and says so in a comment — leaking GoTrue's throttle state and, depending on project settings, account existence. *Fix:* return the same generic notice on success and failure. `app/owner/(auth)/login/actions.ts:59`

---

## 5. The table

| # | Title | Attacker | Severity | File:line |
|---|---|---|---|---|
| 1 | Self-promotion to super_admin → DELETE cascades every café and ledger | Anyone (open signup) | critical | `supabase/migrations/0006_grants.sql:37` |
| 2 | Signup binds any phone to the attacker's PIN — oracle, squat, stolen walk-in points | Anon | high | `app/[slug]/rejoindre/actions.ts:90` |
| 3 | Unauthenticated scrypt amplification stalls the whole Node process | Anon | high | `app/moi/actions.ts:62` |
| 4 | Unlimited account creation exhausts the global 4-char code namespace | Anon | high | `app/[slug]/rejoindre/actions.ts:51` |
| 5 | PIN lockout as a weapon — indefinite denial, and pre-lock blocks signup | Anon | medium | `app/moi/actions.ts:64` |
| 6 | Phone→name and code→name resolvable platform-wide, unthrottled | Self-issued owner | medium | `app/owner/(app)/caisse/actions.ts:57` |
| 7 | Owner session cookies not Secure/HttpOnly, 400-day maxAge, no HSTS | Network / XSS | medium | `lib/supabase/server.ts:23` |
| 8 | `anon` reads every column of every live café (owner uuid, plan, wheel odds) | Anon | medium | `supabase/migrations/0006_grants.sql:24` |
| 9 | Enrolment + credit happen during a GET render; cookie is SameSite=Lax | Hostile owner | medium | `app/[slug]/rejoindre/page.tsx:36` |
| 10 | Adjust writes a ledger row for any phone — injects a branded card into a stranger's wallet | Owner | medium | `supabase/migrations/0011_stamps.sql:333` |
| 11 | Balance sum cast to `integer` — concurrent adjusts blank a wallet platform-wide | Owner | medium | `supabase/migrations/0003_rpcs.sql:11` |
| 12 | Auth proxied via one server IP; every error collapses to one string | Anon | medium | `app/owner/(auth)/login/actions.ts:27` |
| 13 | No row-count or length quota on any owner-writable table | Self-issued owner | medium | `supabase/migrations/0006_grants.sql:44` |
| 14 | Till roster query materialises the whole roster per load | Anon (via #4) | medium | `supabase/migrations/0019_resolve_by_account_code.sql:55` |
| 15 | Raw phone numbers shipped to the till browser | Cashier | low | `app/owner/(app)/caisse/actions.ts:130` |
| 16 | Correction paths skip the live-café gate | Suspended owner | low | `app/owner/(app)/caisse/actions.ts:87` |
| 17 | 90-day diner session with no revocation lever | Token holder | low | `lib/auth/diner.ts:25` |
| 18 | Pending voucher codes dumpable from the till; no `claimed_by` | Cashier | low | `supabase/migrations/0006_grants.sql:50` |
| 19 | Voucher codes from `random()`; collision check omits stamp rewards | Diner | low | `supabase/migrations/0003_rpcs.sql:29` |
| 20 | Signup returns the raw auth error | Anon | low | `app/owner/(auth)/login/actions.ts:59` |

---

## 6. The pattern

**Three habits produce almost every finding above.**

**There is no rate-limiting layer, anywhere.** A repo-wide search for any limiter returns exactly one hit: the per-phone PIN counter. That single absence is the load-bearing element of eight separate findings — the phone-number oracle, the account-code sweep, both DoS primitives, the namespace exhaustion, the auth-budget exhaustion, the till timeout. The proxy already sits in front of every request and already does host routing and session refresh; it is the obvious place, and it is empty. This is one piece of missing infrastructure, not eight bugs.

**Validation lives in the app layer while the browser holds a key that skips the app layer.** The image prefix check, the 500 KB cap, the single-adjust ceiling, the "the till never holds a phone number" comment — all of them are enforced in TypeScript that an attacker with the anon key and their own JWT simply does not execute. The grants file opens with a correct and well-argued explanation that GRANT and RLS are two gates and both must pass; it then hands `authenticated` table-wide INSERT/UPDATE/DELETE on six tables and UPDATE on `profiles`, and leaves column-level control and CHECK constraints entirely unused. RLS filters *rows*, and the codebase repeatedly reasons as if it also filtered columns and bounded values. It does neither.

**Identity is asserted, never proven.** A phone number is treated as an identity the moment someone types it — no OTP, no possession proof, no reset path, and `accounts.phone` as the primary key so the first typist owns it forever. The 4-char account code is likewise treated as an identifier that any till may resolve globally, when in practice it is a low-entropy bearer name for a real person. The one place identity *is* proven properly — the admin step-up, with its separate secret and constant-time compare and 30-minute TTL — is also the one place where proving it buys nothing, because the underlying database privilege it guards is reachable without it.

Underneath all three: **the trust boundary is drawn at the UI, not at the data.** The comments in this codebase are unusually thoughtful about *why* each mechanism exists — and they consistently describe the path a user takes through the interface, then assume it is the only path. Every one of the top six findings is someone declining to use the interface.

---

## 7. What would settle the unknowns

**The DoS numbers are per-machine, not per-deployment.** I measured ~37 ms of dedicated threadpool time per scrypt against a 4-thread pool on this machine. *Experiment:* on a staging box with the production instance size, run a fixed-rate load of unauthenticated `signInAction` POSTs with rotating phones and record p99 latency of an *unrelated* route (the till roster) as concurrency climbs. The number that matters is requests-per-second to first till timeout — that tells you whether this is a nuisance or an outage, and it is the only figure that justifies the priority I gave finding 3.

**Whether the shared GoTrue bucket actually collapses.** The mechanism is certain (no client IP is forwarded); the magnitude depends on Supabase's current per-IP limits and on how many egress IPs the host pool has. *Experiment:* from one host, drive failed logins at increasing rate against staging while a second client attempts a legitimate login every 5 seconds, and watch for a 429 surfacing as "E-mail ou mot de passe incorrect". If the legitimate client fails, this moves up to "fix before launch".

**Whether voucher codes are predictable.** Postgres `random()` is a simulation PRNG with per-backend state, but PostgREST's pooling interleaves tenants, so I could not establish that enough consecutive uninterrupted draws are observable. *Experiment:* mint several hundred codes from a single session as fast as possible while a second session mints concurrently, then test the observed 5-bit sequences against a xoroshiro128\*\* state solver. If state recovery succeeds, this jumps from "backlog hygiene" to a live cross-diner voucher theft.

**Whether the balance overflow is reachable in practice.** Sequential adjusts self-abort; the concurrent path is sound in theory but depends on read-committed snapshot timing under real connection pooling. *Experiment:* on a scratch business and a scratch phone, drive the sum to just under the boundary, then fire 8 concurrent adjusts and check whether any commit lands past 2^31−1. If they do not, this drops to backlog.

**Whether the till actually dies, and at what roster size.** The query shape is certain; the timeout is projected. *Experiment:* seed a scratch business with 10k, 50k and 100k membership rows and time the roster call cold — that tells you both the real threshold and whether pagination alone fixes it or the aggregates need precomputing.

**What the production cookie flags really are.** The package default is `httpOnly:false` with no `secure`, but a CDN, edge proxy or platform middleware can rewrite Set-Cookie in production. *Experiment:* curl the deployed login response and read the raw Set-Cookie headers. Thirty seconds, and it either confirms finding 7 or removes it.