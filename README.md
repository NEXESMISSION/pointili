# Pointili

A café loyalty + games web app. Turns one-time customers into regulars by rewarding them for coming back.

**The loop — the whole product serves it:**

> ☕ Consume → ⭐ Earn points → 🎡 Play & 🎁 Redeem → 🚶 Return → ☕ Consume…

Points are earned by **buying** (credited by staff at the caisse), **never** by playing. Playing gives prize codes; points buy real rewards.

Built from `docs/POINTILI-BUILD-SPEC.pdf` (§ references throughout the code point back to it).

## Three hard rules

1. **Mobile-only.** Design at 375–430px. One layout, phone-sized, everywhere — a `max-w-[480px]` centered column. No `md:` / `lg:` breakpoints, no desktop or tablet layout. (The marketing landing page is the one exception — it sits outside the app and lays out responsively.)
2. **The server decides.** The client never determines anything of value. Balances, prize outcomes, cooldowns, and redemptions are computed by Postgres RPCs or service-role routes. The browser only _requests_. This is the anti-cheat foundation.
3. **Le Ticket, everywhere.** See below. `docs/POINTILI-ART-DIRECTIONS.html` rejects the default rounded-SaaS look by name — don't drift back into it.

## The design system

**Modern, Royal Mauve, Poppins headings + Inter body** — the brand-guide
identity, one look across the landing, the diner app, the owner app and the
console. Tokens live in `app/globals.css`.

| Role             | Token                | Value                 |
| ---------------- | -------------------- | --------------------- |
| Page background  | `cloud`              | `#F4F2FA`             |
| Cards            | `white` / `lilac-2`  | `#FFFFFF` / `#F6F3FF` |
| Text             | `charcoal` / `slate` | `#1B1524` / `#6B6484` |
| Hairlines        | `hair`               | `#ECE9F5`             |
| Primary          | `royal` / `royal2`   | `#5B3FD1` / `#7B61FF` |
| Badges / tints   | `lilac`              | `#ECE7FF`             |
| Points           | `gold`               | `#C98A00`             |
| Success / danger | `ok` / `seal`        | `#2F9E6E` / `#E5484D` |

- **Poppins** for headings, **Inter** for body, **Space Mono** only for codes and
  tabular numbers.
- White cards on a lilac-tinted page, soft shadows, solid hairline borders,
  rounded corners. No dashed borders, no kraft.
- An earlier "Le Ticket" (kraft/serif) design was replaced by this. The legacy
  token _names_ (`paper`, `ink`, `line`…) still exist in `globals.css` but are
  **remapped** to modern values, so old markup renders modern; prefer the modern
  names in new code.

## Stack

| Layer             | Choice                                          |
| ----------------- | ----------------------------------------------- |
| Frontend          | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling           | Tailwind v4 (tokens in `app/globals.css`)       |
| Backend           | Supabase — Postgres + Auth + Storage + RLS      |
| Privileged writes | Route handlers w/ service-role + Postgres RPCs  |
| Hosting           | Vercel + Supabase cloud                         |

## Getting started

```bash
npm install
cp .env.example .env.local        # fill in your Supabase keys
node scripts/migrate.mjs          # apply migrations (idempotent, re-runnable)
node scripts/seed.mjs             # profiles + a working café
node scripts/verify-db.mjs        # SECURITY GATE — must pass
npm run dev
```

`scripts/migrate.mjs --reset` drops and recreates the public schema. It is
destructive; `scripts/backup.mjs` dumps everything to `backups/` first.

| Migration       | What it does                                           |
| --------------- | ------------------------------------------------------ |
| `0001_init.sql` | Tables (§05)                                           |
| `0002_rls.sql`  | RLS on every table (§06)                               |
| `0003_rpcs.sql` | Server-authoritative RPCs + the EXECUTE lockdown (§06) |
| `0004_auth.sql` | PIN throttling, claim-once codes, diner code list      |

## Structure

```
app/
  page.tsx           marketing landing (responsive; outside the app)
  layout.tsx         fonts only — each section applies its own shell
  globals.css        Le Ticket tokens + printed helpers
  [slug]/            the diner app (phone column)
    rejoindre/       phone + PIN onboarding
    jeux/  boutique/
  owner/(auth)/      login + signup — OUTSIDE the guard (else redirect loop)
  owner/(app)/       dashboard · caisse · réglages (guarded)
  api/play/          server-authoritative spin
  owner/(app)/qr/    printable table tent — the product's front door
lib/
  data.ts            café config reads (Supabase)
  db.ts              everything value-bearing — service-role RPC calls
  stats.ts           analytics: retention + money, not vanity
  auth/              scrypt PINs, HMAC sessions, owner/diner guards
  supabase/          anon · cookie-bound server · service-role admin
proxy.ts             refreshes the owner's Supabase session (was middleware.ts)
supabase/migrations/ schema, RLS, RPCs
scripts/             db tooling, screenshots, e2e, security gate
docs/                build spec, design system, art directions
```

## Seeing and checking your work

The in-app browser pane renders with `visibilityState: "hidden"`, which silently
breaks screenshots, `requestAnimationFrame` and lazy-loading. Don't trust it for
UI work — drive real Chrome instead (uses the installed browser, no download):

```bash
node scripts/shot.mjs / /owner/qr    # screenshot any public routes
node scripts/shot-diner.mjs          # sign a diner in, shoot the hub
node scripts/shot-owner.mjs /owner   # sign the owner in, shoot the admin
node scripts/e2e.mjs                 # the whole loop, 23 checks
node scripts/test-platform.mjs       # subscriptions/ban/notices, 15 checks
node scripts/attack.mjs              # 12 attacks: anon key + cross-tenant
node scripts/verify-db.mjs           # RLS + RPC grants
node scripts/purge-test-data.mjs     # remove test diners (dry run by default)
```

`scripts/migrate.mjs --reset` **destroys every café**. It refuses to run when any
exist unless you add `--i-know`; back up first with `scripts/backup.mjs`.

`e2e.mjs` drives the real UI through the whole loop and asserts the rules that
actually matter — welcome-once, cooldown, claim-once, redeem, "the wheel never
awards points", and "identity comes from the session, not the request body". Run
it after any refactor; it exits non-zero on failure.

Some of those checks exist because the rule was already broken once. The wheel
shipped with `+5 points` / `+10 points` segments, which violates §00 ("points are
earned by buying, **never** by playing") _and_ did nothing when claimed. The test
is there so it can't come back.

> On Git Bash, prefix with `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'` or a bare
> `/` argument gets mangled into a Windows path.

## Roles

| Role            | Auth                                                                             | Can                                              |
| --------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Diner**       | Phone + 4-digit PIN (custom, _not_ Supabase Auth). Global identity across cafés. | Earn, play, redeem                               |
| **Owner**       | Supabase Auth (email + password). One café.                                      | Caisse, analytics, QR, every setting             |
| **Staff**       | Café PIN                                                                         | **not built** — the caisse rides on owner access |
| **Super-admin** | Supabase Auth + `profiles.role='super_admin'`                                    | `/admin`: plans, suspension, notices             |

## The platform layer (`/admin`)

**The console is a separate surface, not an owner page with a flag.**

A super-admin used to be exactly that — same login, same session, same cookie —
which meant one leaked owner session was the whole platform: suspend anyone,
grant free plans, read every ledger. A 90-day session is fine for "manage my
café"; it is not fine for "disable someone's business".

So `/admin` has its own door (step-up / "sudo mode"):

| Gate                  | Effect                                                         |
| --------------------- | -------------------------------------------------------------- |
| signed in             | else → `/owner/login`                                          |
| `role = super_admin`  | else → **404**. The console's existence is itself information. |
| step-up within 30 min | else → `/admin/login` — re-enter the password                  |

- The elevation cookie is **separate** from the owner session: its own secret
  (`ADMIN_STEPUP_SECRET`), `httpOnly`, `sameSite=strict`, `path=/admin` (never
  sent to the owner or diner app), 30-minute TTL, and bound to the user id so it
  can't be replayed under another account.
- **Nothing links to it.** The owner nav has no Admin tab — that would advertise
  it and invite one-tap access from a long-lived session.
- "Verrouiller" drops elevation but keeps you signed in as an owner.
- Failed step-ups are audited (`elevate_failed`).

Every action is _still_ guarded twice more: the RPC re-verifies the role in
Postgres against `profiles`, and EXECUTE is revoked from anon/authenticated.

`scripts/test-console.mjs` proves the boundary — 16 checks including a forged
cookie, a plain owner getting a 404, and "an owner session alone does NOT open
the console".

> **Gotcha:** the step-up verifies the password on a throwaway client and calls
> `signOut({ scope: "local" })`. The default scope is **global**, which revokes
> every refresh token for the user — verifying your own password would sign you
> out of the app you were standing in. That shipped once.

Under the door:

- **Subscriptions** — trial (30 days, automatic on café creation) / pro / free
  (unlimited). Granted in **hours, days or months** — a 48-hour grace extension
  while an owner sorts out payment is as real a need as a yearly plan. Extending
  adds to the _current_ expiry, not to today, so renewing early doesn't burn the
  remainder; a duration of **0** cuts them off immediately.
- Both sides see the clock: the owner's plan and time left sit permanently in
  Réglages → Abonnement (not only once it's nearly too late), and the console
  shows `12 h` / `5 j` / `3 mois` per café — never "0 j restants" for a
  half-day grant.
- **Teeth** — `cafe_is_live()` gates the diner app **and** `credit_points`,
  `play_game`, `redeem_at_counter`. An expired café keeps its data and its panel
  but cannot serve diners; the QR shows "momentanément fermé", never a 404. A
  plan expiry that nothing enforces is a promise, not a product.
- **Suspension** — offline immediately; a reason is mandatory.
- **Notices** — info/warning/urgent, to one café or all. Owners can read them,
  never write one — a café must not be able to forge a message from the platform.
- **Audit** — every privileged action lands in `admin_audit` (service-role only)
  with the actor's email.

The admin RPCs take the actor as an **explicit argument** instead of reading
`auth.uid()`. They're revoked from anon/authenticated, so the only caller is a
service-role route — which has no `auth.uid()`, so an `auth.uid()`-based check
silently never passes and every admin call returned empty. The app resolves the
actor from the session; the database re-verifies it.

## Build order

- [x] **Phase 1** — Supabase foundation: schema, RLS, RPCs, clients
- [x] **Phase 2** — Owner core: login/signup (Supabase Auth), café creation, dashboard
- [x] **Phase 3** — Diner + Ma carte: phone+PIN auth, balance, "almost there" nudge
- [x] **Phase 4** — Caisse (Consume→Earn): credit points, welcome bonus, "+points" moment
- [x] **Phase 5** — Games (the Spin): wheel, everyone-wins, cooldown, celebration
- [x] **Phase 6** — Boutique (the Reward): ladder, redeem, code validation
- [x] **Phase 7** — Owner control panel: every knob writes, grouped by moment
- [ ] **Phase 8** — Return layer: streaks, events, "your spin is ready"
- [~] **Phase 9** — Polish: Le Ticket applied to every surface; QA'd at 390px
- [+] **Café QR** — printable table tent at `/owner/qr`. The whole product starts here.
- [+] **Landing page** — built on request. Note: §01 lists it as explicitly out of scope.

### Security — the part that must not rot

The anti-cheat foundation is enforced by the database, not by the app, and it is
**verified, not assumed**:

```bash
node scripts/verify-db.mjs   # RLS on every table; anon cannot EXECUTE the RPCs
node scripts/attack.mjs      # 12 attacks: the anon key, and cross-tenant
```

`attack.mjs` also signs in as a **real owner** and tries to rename, re-price, rig
the wheel of, read the ledger of, and delete **another** café. `authenticated`
holds table-level write grants (it must, for owners to edit their own), so RLS is
the only thing between café A and café B. All 12 must stay blocked.

This regressed once, silently. `revoke execute ... from anon, authenticated`
looks correct and **does nothing**: Postgres grants EXECUTE to `PUBLIC` by
default and every role inherits it, so `credit_points()` stayed callable with the
anon key that ships in the browser. `security definer` meant it would have run as
the owner. Anyone could have minted themselves points. The fix is
`revoke ... from public` + `grant ... to service_role`; the two scripts above are
what stop it coming back. Run them in CI.

### Routing — why the owner groups are split

`app/owner/` has three route groups, and the split is load-bearing:

| Group     | Guard                | Why                                                                                       |
| --------- | -------------------- | ----------------------------------------------------------------------------------------- |
| `(auth)`  | none                 | login + signup. Nesting these under a guard that redirects _to_ them is an infinite loop. |
| `(setup)` | signed in            | `/owner/nouveau`. Signed in but **no café** — must be reachable, and has a logout.        |
| `(app)`   | signed in **+ café** | analytics, caisse, QR, réglages.                                                          |

An owner with no café goes to `/owner/nouveau` — **never** `/owner/login`. That
exact redirect shipped once and bounced every new signup between `/owner` and
`/owner/login` forever, with no reachable logout. `scripts/e2e.mjs` asserts the
hop chain so it can't come back.

`getOwnedCafe()` assumes **one café per owner**.

### GRANTs and RLS are two different gates

`0006_grants.sql` exists because `--reset` drops the privileges Supabase
provisions for `anon`/`authenticated`. Both gates must pass:

| Gate    | Question                               |
| ------- | -------------------------------------- |
| `GRANT` | may this role touch this table at all? |
| `RLS`   | which rows may it touch?               |

RLS without a GRANT is a **silent no-op** — and a zero-row `UPDATE` is not an
error in Postgres. That combination shipped once: Réglages showed "Enregistré ✦"
and saved nothing. Owner writes now use the owner's own session (so RLS enforces
ownership) and `assertWrote()` refuses to report success on zero rows.

`scripts/attack.mjs` proves the isolation from outside — 12 attacks, including a
signed-in owner trying to rename, re-price, rig, read and delete **another**
café. All must stay blocked.

### Not built yet — read before promising anything

- **Staff PIN auth (§04)** is missing — the caisse rides on owner access, so a
  barista would need full owner rights.
- **Engagement layer**: streaks/XP/passport/events exist in the schema and RPCs
  but nothing calls them; `getDiner` returns `streak: 0, xp: 0`.
- `.env.example` implies surfaces that don't exist: **Resend email, signup codes,
  password reset, QR sessions**.
- **Super-admin** has no UI; the role exists and RLS honours it.

## Working on this codebase

This is Next.js **16** — it differs from most training data. Read `node_modules/next/dist/docs/` before writing code. Gotchas that bite:

- `cookies()`, `headers()`, `params`, and `searchParams` are **async** — you must `await` them.
- `middleware.ts` is now **`proxy.ts`**, exporting `proxy()`. Node runtime only; no edge.
- `next lint` is removed — use `npm run lint` (ESLint directly). `next build` no longer lints.
- Turbopack is the default bundler.
