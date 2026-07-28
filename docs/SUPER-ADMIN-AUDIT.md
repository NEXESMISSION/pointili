Repo root: `C:/Users/Med Saief Allah/Desktop/POINTILI`. Every path below is under it; an absolute-path index is at the end.

---

# The super-admin console: what is actually wrong

## 1. The verdict

**The console is not broken. Every button runs, and the row it means to change does change. What is wrong is the model: it was built as an editor for three columns of the `businesses` table, and it is being used as the control room of a platform.** That mismatch produces the four things the owner described, and they are not four bugs — they are four consequences of two root causes. **First: there is no choke point.** "Suspended" is not a state the system enforces; it is a convention that nine value-writing RPCs are each free to honour or ignore, and four of them ignore it — so a café you have switched off can still put points on a customer's card from its own till, one tap below the button that correctly refuses. **Second: every confirmation the console shows describes the request, not the result.** The RPCs return a bare `ok:true` with no row count and no post-state; the server action then composes its French sentence from the form values it sent, in a branch order that does not match the one Postgres actually used. So the console will tell you « Formule gratuite (illimitée) appliquée » at the exact moment it took the shop dark, tell you « Café réactivé » about a café that is still off, and tell you « Café suspendu » about a café that does not exist. On top of those two: the queue — the surface the page was redesigned around — physically cannot display a message, because its actions return `void` into plain `<form action>` elements; and every number on the screen is computed from `points_ledger`, a table that gets a row written into it the moment somebody types a PIN, which is why the column headed **Clients** is really a count of QR scans. Underneath all of it sits the structural problem: `businesses` is the only root in the console's data model, so diners, owners who never opened a shop, money, and history have nowhere to live — and the operator's real job is made mostly of those four things.

**Calls I am making where the traces disagree:**

- **`revalidatePath("/owner")` was never the bug and is not the fix.** It runs inside the *operator's* request and cannot reach the owner's browser; `/owner` is `force-dynamic`, so there is no server cache to bust either. The line in `setPlanAction` and `dismissNoticeAction` is decorative; adding it to `setSuspendedAction` would change nothing. The real defect is that the owner's only signal lives in a **layout**, and Next does not re-run layouts on client transitions.
- **"Réactiver reports success on a dark café" and "Gratuit + durée 0 kills the café" are the same defect**, not two. Both are root cause #2. Fix them together by returning post-state from the RPC, not by patching two sentences.
- **"No payment records" is not a defect** — the product never modelled money. But I rank it high in the build order anyway, because "am I making money, and who owes me" is the operator's first question and the console cannot form it.
- **The 30-minute step-up no longer exists** (`lib/auth/owner.ts:132` is `return requireSuperAdmin()`). Findings that blame lapsed elevation for silent buttons are right about the silence and wrong about the cause. The silence still matters.
- **The polluted audit table is not a code bug.** 213 of 368 audit rows point at cafés that never existed, and 45 of the 46 counted "diners" are fixtures, because **the test suite runs against production**. That is why the journal looks broken today. It needs fixing separately and first-ish.

---

## 2. What does not reach where it should

### 2.1 Suspension does not reach the till — the shop can work around it from its own counter `CRITICAL`

| | |
|---|---|
| **Operator expects** | The confirm dialog they just accepted says it: « Les clients perdront l'accès immédiatement. » Breaker off. The shop cannot put value on any card until I press Réactiver. |
| **Actually happens** | The « Montant » button is dead (`credit_points` → "café indisponible"). The button directly beneath it, « Corriger / Historique », opens *Corriger les points*; +10 → Appliquer succeeds and flashes « Solde corrigé : 60 ». « Tampons → Définir » works too. So does collecting outstanding reward codes. |
| **Mechanism** | `cafe_is_live()` is called by `credit_points` (0003:61), `play_game` (0003:130), the redeem RPC (0003:233) and `add_stamp` (0015:38). It is **not** called by `owner_adjust_points` (`supabase/migrations/0011_stamps.sql:329`), `owner_set_stamps` (0011:340), `claim_code` (0011:170) or `enroll_diner`. `adjustByCodeAction` / `setStampsByCodeAction` (`app/owner/(app)/caisse/actions.ts:85,102`) check only `ownerCafe()`. Nothing under `app/owner/(app)/` gates on `cafe.live` — the layout renders a banner and then renders `<main>{children}</main>` anyway, so the caisse is fully mounted. |
| **Why it matters** | Suspension is the operator's only leverage over a shop that has not paid. It is circumventable by the suspended party, without leaving the page, while the console shows a red dot and the operator believes the shop is dark — and `admin_overview.pointsIssued` keeps climbing as they watch. |

### 2.2 Suspension and expiry never reach the diner's wallet `MEDIUM`

`/cartes` renders the dark café as a normal card — logo, live balance, stamp count, and a gold « 3 à récupérer » badge inviting the diner to come collect. Tapping it lands on `CafeClosed`. Walking in works: `claim_code` has no live gate, so the suspended shop hands out the coffee.

`diner_wallet` (`supabase/migrations/0016_client_fixes.sql:65`) selects `from businesses b where b.id in (…ledger ∪ diner_cafes)` with **no** `status` / `suspended_at` / `plan_expires_at` predicate, and returns no live flag. `WalletCafe` (`lib/db.ts:295`) therefore has no such field, and `components/WalletView.tsx:186` has nothing to branch on.

The card itself should stay — the points are preserved and `CafeClosed` says so. What is wrong is the unqualified invitation, and `claim_code` being the one value RPC without the guard.

### 2.3 The owner is not told mid-session — and the banner is the only channel that exists `LOW, but structural`

The « Café hors ligne / Suspendu : {reason} » banner lives only in `app/owner/(app)/layout.tsx:94`. `OwnerTabs` / `OwnerSidebar` navigate with `next/link`, so an owner already in the app can move between Caisse, Analyses, QR and Réglages indefinitely without the layout re-running. Combined with 2.1 — the till still working — nothing at all signals the change. The diner side was already fixed for exactly this (`app/[slug]/page.tsx:23-25` documents it and adds a per-page re-check); no page under `app/owner/(app)/` has one.

Same limitation applies to notices: a posted notice and a retracted notice are both invisible until a full document load or one of the caisse actions happens to call `revalidatePath("/owner")` from the owner's own request.

### 2.4 The operator's own console does not reach the operator `HIGH`

The queue is where the work happens — « +6 mois », « +1 an », « Réactiver ». All three go through `quickRenewAction` / `quickUnsuspendAction` (`app/admin/(console)/actions.ts:206-213`), which are `Promise<void>` wrappers that discard the `AdminState`. The forms at `page.tsx:214,245` are plain `<form action>` in a Server Component with no `<Result>` slot.

On failure the bail happens at `actions.ts:77` — **before** `revalidatePath("/admin")` at :81 — and Next's own docs for this version are explicit that an action which does not revalidate/redirect/refresh carries only its return value and does not re-render the route. So a failed click produces a **byte-identical page**: no toast, no error, no refresh. The operator concludes the button is broken. That is the literal shape of the complaint.

On success it is barely better: the only feedback is the row disappearing, and if the café was `soon` rather than expired it may still be there with a different label — which also reads as "nothing happened".

The drawer (`CafeControls.tsx`, `useActionState` + `<Result/>`) renders all these messages correctly. The path an operator actually uses renders none of them.

### 2.5 The reason, and everything else the log records, reaches no screen `LOW ×3, together significant`

`admin_audit.detail` is a jsonb column carrying `{reason}` for suspensions and `{plan, amount, unit, until}` for plan changes. `admin_recent_actions` returns it (0007:308), `lib/platform.ts:87` types it, and `page.tsx:143-148` renders only the label and the café name. So:

- Granting a year and cutting a shop off instantly (`amount: 0`) are the **same line** in the journal.
- The reason the operator was *forced* to type (`setSuspendedAction:111` refuses to suspend without one) is displayed nowhere in the product once the café is reactivated — `businesses.suspended_reason` is NULLed and its only two readers are gated on `suspended_at`.
- The date is `dd/MM` with no time, so six plan changes twelve seconds apart are six identical lines. Production has exactly that.

### 2.6 Smaller leaks in the same family

- **A stale `/rejoindre` page still enrols into a suspended café.** It is the only page under `app/[slug]` without a `cafe.live` re-check, and `joinAction` reads `getCafe(slug)` purely for the id. The diner gets a permanent empty card for a shop they were never allowed to join. `LOW`
- **A notice with an emptied « jours » box is dead on arrival.** `Number(formData.get("days") ?? 14)` — an emptied `<input type=number>` submits `""`, `Number("")` is `0`, and `Number.isInteger(0)` passes the guard. `admin_notice` then writes `expires_at = now()`. `owner_notices` excludes it on the next read, `activeNotices()` filters it out of the console, and the operator gets « Message envoyé à tous. » The message exists in no visible place on the platform and there is no way to notice the loss. `MEDIUM`
- **A broadcast greets cafés that signed up after it was sent.** `owner_notices` matches `business_id is null` for every caller with no comparison against the business's `created_at`, so a shop created after « Maintenance prévue dimanche » opens its brand-new dashboard to it. `LOW`
- **Notices reach nobody without a café.** `layout.tsx:26` short-circuits to `[]` when the signed-in owner has no `businesses` row. Ten owner profiles, two cafés. There is no email, SMS or push anywhere in the repo — the banner is the entire delivery channel. `LOW code / HIGH consequence`

---

## 3. What shows a number that is not true

The numbers are **fresh** — `force-dynamic`, recomputed every request, `revalidatePath` on every action. Caching is not the culprit anywhere. They are simply not measuring what their labels say. Live values, read from production today:

| On screen | Reads as | Actually is | Truth today |
|---|---|---|---|
| « **46 diners** » | people carrying a Pointili card | `count(*) from accounts` — a table with no `business_id` and no FK to `businesses` | **1** phone holds a card anywhere on the platform (`diner_cafes ∪ points_ledger`). The other 45 are test fixtures. |
| « **336 points émis** » | loyalty value the platform generated | `sum(delta) where delta > 0`, unfiltered by `reason` | **116** were ever earned at a till. 200 are one owner's manual `adjust`; 20 are signup welcome bonuses. |
| **Clients** column | this café's customers — sortable, and `admin_overview`'s own header calls these "the numbers that decide whether it is worth keeping" | `count(distinct customer_phone) from points_ledger`, unfiltered | Identical to "people who scanned the QR": `rejoindre/actions.ts` fires `credit_points(cafe, phone, 0)` on every join, and `credit_points` writes the `welcome` row *before* it looks at the purchase amount. |
| **Points** column | same | same | For `saif-sfax`: renders « 1 client · 210 pts » for a shop whose single phone has `welcome(+10)`, `adjust(+200)` and two redeems, and **has never rung a sale through Pointili**. Its owner's own Analyses page for the same café renders « Pas encore de client ». |
| **0 / 0** for a stamp-card café | dead shop, sorts to the bottom, candidate for cut-off | both console numbers read only `points_ledger`; `add_stamp` writes only `loyalty_stamps` | A café with 300 stamp cardholders and welcome points set to 0 reads as abandoned. Its owner's Clients page lists every one of them. Not live today, but one owner toggle away. |
| « **Journal (12)** » | 12 things have happened | `actions.length` on a hard-coded `recentActions(12)` | **368** rows spanning 11 days. The drawer one line above, « Annonces actives (N) », *is* a real total — which makes the false one look trustworthy. |
| **Nothing at all** | — | `suspended`, `expiring7d`, `expired`, `owners`, `plays` are computed in Postgres and shipped on every render; `AdminCafe.plays` and `.lastActivity` too | 5 of 9 platform stats and 2 of 15 per-café fields are queried, sent over the wire, and never rendered. |
| **Cumulative counters on a suspended café** | frozen with the shop | plain lifetime aggregates with no live filter | Keep climbing while the till keeps writing (see 2.1). |

One word, three definitions, all shipped: the console's **Clients** = anyone with a ledger row; the owner's **Analyses** = distinct phones with an `earn` row (and `lib/stats.ts:118` documents *why* the other definition is wrong: "Welcome bonuses aren't visits — counting them would make every signup look like a paying customer"); the owner's **Clients page** and the diner wallet = `diner_cafes ∪ points_ledger`. The console does exactly the thing the owner's own code names as wrong.

---

## 4. What is missing that the job requires

Everything below is a real operator task with **no button anywhere**. "What they do today" is not rhetorical — I checked for the capability, not just the UI.

| The call that comes in | What the console offers | What actually has to happen |
|---|---|---|
| "I forgot my PIN, I can't get into my card" | Nothing. The one search box filters `businesses` by name/slug/ownerEmail. There is no diner surface under `app/admin/` at all. | **The capability does not exist to expose.** `accounts.pin_hash` is written by exactly one statement in the entire system — the INSERT inside `create_account` (0018:95-96). There is no UPDATE path in any migration, RPC, action or script. No diner, no owner, no operator can ever change a PIN. Today: a hand-written UPDATE against production, or the account and every balance on it are gone. |
| "Your cashier credited me 500 instead of 50" | Nothing. No admin adjust, no ledger view, no diner lookup. | Ask the owner to do it from their till with `owner_adjust_points` — which takes any signed integer, has no bounds, no live gate and **writes no audit row**. |
| "Café X paid 80 TND on the 3rd, closed on the 20th, refund the rest" | Nothing. | There is **no payments, invoices or subscriptions table in any of the 21 migrations**. A repo-wide grep for payment/facture/stripe/billing returns the admission at `reglages/page.tsx:112` and nothing else. `admin_set_plan` grants time and records zero dinars. The prices (65 / 80 TND) exist only as JSX on the owner's settings page. |
| "What is my revenue this month? Who has not paid?" | « 2 cafés · 2 en ligne · 46 diners · 336 points émis ». | Guesswork. There is no revenue field in `PlatformStats` because there is no revenue data to put in it. |
| "Who suspended this café in March, and why?" | The last 12 rows, no paging, no date filter, no per-café filter — `admin_recent_actions` takes `p_limit` only, there is no `business_id` parameter to pass. The café's own drawer shows no history for the café it is about. | Raw SQL against production. 97% of the audit trail is unreachable from the product. |
| "How many people signed up and never opened a shop?" | `admin_overview`'s FROM clause is `from businesses b left join profiles p`, so a profile with no business appears in no list, no filter, no search, no queue. `admin_platform_stats` computes `owners` and the page drops it. | Raw SQL. And they cannot be contacted either — `owner_notices` returns nothing for an owner with no café. |
| "This shop closed for good, take it off the platform" | Suspension, which leaks (2.1). | Nothing. There is no delete or archive path — `0021:47` revokes DELETE on `businesses` from `authenticated` and no admin RPC replaces it. |
| "The owner sold the café / changed their email" | Nothing. `pg_proc` confirms the `admin_*` family is exactly the six RPCs the console already calls. | Raw SQL. And `profiles.email` is a signup-time snapshot with an INSERT trigger and no UPDATE trigger, so it silently rots — while the console header three inches above reads the *live* address from `auth`. |
| "Who has been in the console?" | Nothing since commit `18442ff`. | The 90 `elevate` + 45 `elevate_failed` rows in production were the access record; the step-up screen that wrote them was removed and nothing replaced it. Reading every café's owner email, customer count and points via `admin_overview` now leaves **no trace at all**, and a run of failed attempts to reach the console is invisible. `lib/auth/owner.ts:118-131` names the trade-off it accepted — "a STOLEN owner session can reach the console" — while the compensating control went out in the same commit. |
| — | — | **And: the test suite writes to production.** 368 audit rows, 213 against cafés that never existed; 45 of 46 "diners" are fixtures. Every number in section 3 is describing test residue as if it were a business. |

---

## 5. What the console should be

**The operator's unit of work is not a row in `businesses`.** It is an *account* — a shop, the human who owns it, what they were sold, what they have paid, and what they are currently allowed to do — and an *incident*: a diner locked out, a credit that went in wrong, a shop that has gone quiet, an announcement that has to land. The console should be a **case-work tool over three nouns — Shop, Person, Money — governed by one law: every privileged effect passes through a single gate, and every screen states the resulting state rather than the attempted action.** Concretely that means (a) `platform_is_live(business_id)` becomes a mandatory guard that *every* value-writing RPC calls, enforced by a test that fails if a new RPC touches `points_ledger` / `loyalty_stamps` / `wins` without it — not a function each author may remember; (b) every admin RPC returns `{ok, changed_rows, resulting_state}` and every message in the UI is rendered from `resulting_state`, so « réactivé » can say « réactivé — toujours expiré, renouvelez » because the database told it so; and (c) the console stops being one page.

**The screens that implies:**

- **Today** — the queue, kept, but with the money and the reason on the row: what is at stake, why it is here, what happens if you do nothing. Every button on it can display a result.
- **Shop** — one page per café, the workhorse. Current state in plain words (live / dark and *which of the three reasons*), the levers with post-state confirmation, this café's plan and payment history, this café's audit history, this café's active notices, and counters that are labelled what they measure (cardholders, earning customers, points earned vs. adjusted, last real sale).
- **People** — searchable by phone, 4-char code, and email. Two kinds of row: owners (including the ones with no shop, who are the funnel) and diners. Per diner: their cards, their balances, their lockout state, and the two buttons that do not exist today — **reset PIN** and **clear lockout**, both audited. Per owner: their shops, their email, contact.
- **Money** — payments recorded against grants. What was sold, what was collected, what is owed, what a refund is worth today. This is the screen the product does not have data for yet, and the reason phase 5 exists.
- **Announcements** — compose with a preview of *who will actually see this* (including "and 8 owners with no café, who will see nothing"), a targeting choice that is not just one-or-all, retract with an archive rather than a permanent delete, and a visible list of what has expired.
- **Journal** — the full table, filterable by café / actor / action / date, with `detail` rendered, timestamps to the second, labels for historical action codes, and **console access events written back in**.

---

## 6. Build order

### Phase 0 — Make the switch a switch `S` · ~1 day
Add `cafe_is_live()` to `owner_adjust_points`, `owner_set_stamps`, `claim_code`, `enroll_diner`. Gate `app/owner/(app)/` on `cafe.live` at the page level (the till and the corrections panel refuse to mount, not just a banner). Add the missing `cafe.live` check to `[slug]/rejoindre`.
**Unblocks:** suspension becomes real leverage. Without this, nothing else in the console matters — the operator's only enforcement tool is advisory.

### Phase 1 — Make the console tell the truth about what it just did `S` · ~1 day
`admin_set_plan` and `admin_set_suspended` get `if not found → {ok:false,'not_found'}` and return the resulting `{plan, expires_at, live}`. All UI messages render from that, killing the "Gratuit + 0", "Réactiver on an expired café", and "phantom success" defects in one change. Give the queue forms `useActionState` + a `<Result>` (or make the quick actions return `AdminState`). Fix `Renew`'s plan passthrough so `free` + an amount is rejected rather than silently granting forever. Reject `days=""` in `noticeAction`.
**Unblocks:** every lever becomes trustworthy. This is the single highest-leverage change against "it doesn't really work".

### Phase 2 — Make the numbers mean their labels `M` · ~2–3 days
Redefine `customers` as distinct phones with an `earn` row **or** a stamp event **or** a `diner_cafes` row — pick one and use the same definition in `admin_overview`, `lib/stats.ts` and `owner_cards`, so the console and the owner's own page can never disagree about the same café again. Split `pointsIssued` into earned / adjusted / welcome. Make `diners` mean cardholders, not `accounts` rows. Render the five dropped stats and `lastActivity`. Add a live flag to `diner_wallet` and stop the wallet advertising collectable rewards at a dark shop.
**Unblocks:** renewal and cut-off decisions stop being made on a QR-scan count. **Do the test-isolation work here too** — until the suite stops writing to production, no number on this screen describes the business.

### Phase 3 — The Shop page and a real Journal `M` · ~3–4 days
Add `p_business_id` and `p_offset` to `admin_recent_actions`; render `detail`, full timestamps, and labels for `elevate` / `elevate_failed`; fix `actionTarget` by returning `business_id` alongside the name so "deleted café" and "platform-wide" stop being the same value. Give each café a page with its own history and notices. Log console *access*, not just mutations.
**Unblocks:** "who suspended this café, and why?" — the question an audit trail exists for, currently unanswerable from the product.

### Phase 4 — People `M` · ~3–4 days
`admin_find_account(phone|code)`, `admin_reset_pin` (the first UPDATE `accounts.pin_hash` in the system's history — audited), `admin_clear_lockout`, a diner detail view with their cards and ledger, and an owner list that includes owners with no shop. Notices gain a "no café yet" audience.
**Unblocks:** the support calls that today end in hand-written SQL or a permanently dead account.

### Phase 5 — Money `L` · ~1–2 weeks
`payments` table; `admin_set_plan` takes an optional payment reference so a grant is tied to what was collected; revenue, outstanding, and refund-value views; prices move out of JSX into data.
**Unblocks:** "am I making money" and "refund the rest" — the two questions the console currently cannot even form. Large, and it is the one item here that is new product rather than repair, which is why it is last despite being what the operator asks for first.

### Phase 6 — Lifecycle `S/M`
Archive-a-café (a real end state, distinct from suspension), owner transfer, `profiles.email` re-sync on `auth.users` UPDATE, un-retract / archive for notices.

---

## Path index

- `C:/Users/Med Saief Allah/Desktop/POINTILI/app/admin/(console)/actions.ts` — the four mutating actions; :86 the inverted message, :206-213 the silent quick actions
- `C:/Users/Med Saief Allah/Desktop/POINTILI/app/admin/(console)/page.tsx` — :36 the hard-coded 12, :59-67 four of nine stats, :143-148 the journal render, :247 the plan passthrough, :300 `actionTarget`
- `C:/Users/Med Saief Allah/Desktop/POINTILI/app/admin/(console)/CafeControls.tsx` — :49 the plan default, :54-62 the amount input, :134-142 the days input
- `C:/Users/Med Saief Allah/Desktop/POINTILI/app/admin/(console)/CafeTable.tsx` — :70-72 the search predicate, :148 the "Clients" column
- `C:/Users/Med Saief Allah/Desktop/POINTILI/lib/platform.ts` — types, `remaining()`, `activeNotices()`; :5-17 a docstring describing a step-up that no longer exists
- `C:/Users/Med Saief Allah/Desktop/POINTILI/lib/auth/owner.ts` — :118-134 `requireElevatedSuperAdmin` is now `requireSuperAdmin`
- `C:/Users/Med Saief Allah/Desktop/POINTILI/app/owner/(app)/layout.tsx` — :26 notices, :30-36 the plan chip, :94-112 the offline banner (layout-only)
- `C:/Users/Med Saief Allah/Desktop/POINTILI/app/owner/(app)/caisse/actions.ts` — :85 `adjustByCodeAction`, :102 `setStampsByCodeAction`, :318 `collectAction` — the three ungated tills
- `C:/Users/Med Saief Allah/Desktop/POINTILI/app/[slug]/rejoindre/actions.ts` — `joinAction`, no live check
- `C:/Users/Med Saief Allah/Desktop/POINTILI/components/WalletView.tsx` — :186 the « N à récupérer » badge with nothing to branch on
- `C:/Users/Med Saief Allah/Desktop/POINTILI/lib/stats.ts` — :118-127 the owner's *correct* definition of a customer
- `C:/Users/Med Saief Allah/Desktop/POINTILI/supabase/migrations/0007_platform.sql` — :82-91 `cafe_is_live`, :169-197 `admin_set_suspended`, :246-273 `admin_overview`, :276-294 stats, :298-314 `admin_recent_actions`, :317-330 `owner_notices`
- `C:/Users/Med Saief Allah/Desktop/POINTILI/supabase/migrations/0011_stamps.sql` — :170 `claim_code`, :329 `owner_adjust_points`, :340 `owner_set_stamps` — all ungated
- `C:/Users/Med Saief Allah/Desktop/POINTILI/supabase/migrations/0016_client_fixes.sql` — :65-110 `diner_wallet`, no live filter
- `C:/Users/Med Saief Allah/Desktop/POINTILI/supabase/migrations/0018_account_code.sql` — :95-96 the only write of `accounts.pin_hash` in the system
- `C:/Users/Med Saief Allah/Desktop/POINTILI/supabase/migrations/0021_admin_hardening.sql` — :60-117 `admin_set_plan` (:88-92 the branch order), :167-181 `admin_dismiss_notice` (the one RPC that checks `found`)