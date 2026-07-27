# Pointili — UX review

*Read time ~5 min. Every claim below points at a real file and line; nothing here is speculative.*

---

## 1. Verdict

**What's genuinely good.** The core loops work and they're short. A diner scans a table QR and has a working card in three fields — no email, no app, no password reset dance. The till resolves a customer three different ways (scan, keypad, recent faces) and credits them in two taps. The stamp and points mechanics coexist cleanly in the data. Réglages splitting a settings *list* from focused editor sheets is the right pattern, and the QR print kit is a genuinely thoughtful piece of work. Analyses tries to say something in plain French instead of dumping a chart, which most products this size never attempt. The tu/vous split as the only signal separating two identically-coloured apps is a smart, cheap idea.

**The problems cluster into three themes.**

**Theme 1 — the product is honest about what it does, then goes silent at the exact moment of consequence.** Points are spent and the voucher's 48-hour fuse is never mentioned on the screen where you spend them. A reward is deleted with no confirm and no acknowledgement. A trial banner says your shop is about to go dark and gives you nothing to click. The pattern is consistent: the irreversible or costly moments have the weakest guards and the least feedback, while routine moments are fine.

**Theme 2 — one word, several meanings; several words, one meaning.** "Code" is the secret PIN, the public 4-character account code, *and* the 6-character voucher — two of them are the same length and both are shown to the diner as "mon code". Meanwhile the pile of vouchers is called five different things across five screens. This isn't polish; it's the reason a diner types their password into a field a cashier can see.

**Theme 3 — screens built for a device they can't run on.** The whole owner app is locked inside the 480px diner phone column, so the laptop sidebar it ships with has nowhere to live. The super-admin console is a 448px column wrapped around a 560px table. Both are one deleted CSS class away from working, and both are the primary daily surface for the person paying you.

Two things are missing outright rather than broken: **there is no way to recover a forgotten PIN**, and **there is no way to pay from inside the product**.

---

## 2. The customer side

**1. Forget your 4-digit code and your points are gone — permanently.**
[`app/[slug]/rejoindre/JoinForm.tsx:105`, `app/moi/SignInForm.tsx:58`]
Phone + PIN is the only door. There is no "Code oublié ?" anywhere — a repo-wide grep for `oubli|forgot|reset.?pin` turns up one unrelated comment. Five wrong tries locks the account for 15 minutes (`lib/db.ts:112`). The "Nouvelle carte" tab doesn't help: it finds the existing phone and falls through to the same PIN check (`rejoindre/actions.ts:81-101`). And nobody at the shop can help — `pin_hash` is written in exactly one place, at account creation, never from the owner or admin apps. A diner who changes phone loses every card they own.
**Smallest fix:** an owner-side "réinitialiser le code" action in the till (the cashier already identifies the diner by phone), plus a link under both sign-in buttons saying what to do: *"Passe au comptoir avec ton numéro."* The copy alone would be a lie without the reset.

**2. "Code" means three different things, and two of them are four characters.**
[`components/WalletView.tsx:98`, `app/moi/SignInForm.tsx:34`, `app/[slug]/codes/page.tsx:40`]
The secret PIN is "ton code à 4 chiffres". The public account code is "Mon code" in the wallet header, on Profil, and at 32px on the scanner screen — 4 characters from a 32-symbol alphabet that is mostly letters (`lib/code.ts:8`). Vouchers are "Mes codes". A diner who has been staring at "Mon code : K7FQ" then signs out and is asked for "ton code" has every reason to type it. `moi/actions.ts:69` answers "Numéro ou code incorrect" — no hint which code was wrong — while burning one of five attempts.
**Smallest fix:** call the PIN **"code secret"** everywhere (including the two validation messages) and the account identifier **"mon code client"** everywhere. Pure copy.

**3. The join screen never says which shop you're joining.**
[`app/[slug]/rejoindre/page.tsx:45`]
The rendered page is exactly: *"Ta carte de fidélité · 10 points offerts ⭐ … · [numéro] [code] [prénom] · Activer ma carte"*. The café is fetched at line 15 and its name and logo are never used; `TopBar` returns null on this exact path (`components/TopBar.tsx:29`) and `BottomNav` does the same. This is the one screen where someone hands over a phone number and invents a credential, and it is anonymous — after scanning a sticker taped to a table.
**Smallest fix:** an eyebrow line above the h1: the shop's logo/emoji + `cafe.name`.

**4. You spend your points and nothing tells you the code expires in 48 h.**
[`app/[slug]/boutique/RedeemForm.tsx:63`]
`redeemAction` returns `{ code, label, balance }` and the success chip renders "Code · comptoir" plus six characters. The expiry is real (`redeemExpiryHours`, default 48) and the countdown *is* rendered — but only on the card screen and Mes codes, i.e. only if you go looking. Redeem on Friday, come back Monday, lose both the reward and the points, having never seen a deadline.
**Smallest fix:** return `expiresAt` and print the existing `expiresIn()` string under the code: *"K7FQ2M · expire dans 48 h · retrouve-le dans Mes cartes"*.

**5. You invent your permanent PIN blind.**
[`app/[slug]/rejoindre/JoinForm.tsx:64`]
`type="password"`, no reveal toggle, no confirm field, and you're signed in immediately so the typo never surfaces. The product already solves this on the other side — the owner password field has a Voir/Cacher toggle (`AuthForm.tsx`).
**Smallest fix:** the same toggle, in "Nouvelle carte" mode only.

**6. A paused shop looks perfectly healthy in Mes cartes — and its rewards are unreachable.**
[`components/WalletView.tsx:156`]
`diner_wallet` selects shops purely by ledger/membership with no plan or status filter (`0016_client_fixes.sql:100-106`), so a lapsed shop renders as a normal row — logo, balance, even a gold "2 à récupérer" badge. Tapping it replaces everything with CafeClosed (`app/[slug]/layout.tsx:27`), and `/[slug]/codes` is inside the swallowed subtree, so those live vouchers quietly expire where nobody can open them.
**Smallest fix:** add a `live` flag to the wallet payload; dim the row, show an "En pause" pill, suppress the badge.

**7. Points are quoted everywhere and defined nowhere.**
[`app/[slug]/page.tsx:68`]
"10 points offerts", "450 points 🪙", a balance badge — and no earn rate anywhere on the diner side. `pointsPerTnd` exists and is already returned by `getLoyaltyProgram`; it's only shown to owners. "Encore 450 points" is unreadable: three coffees, or three months? Line 68 sits in exactly the right slot and spends it on "Merci pour votre fidélité !".
**Smallest fix:** replace that filler with *"1 point par dinar dépensé"*, and repeat it next to the welcome bonus on the join screen.

**8. The pile of vouchers has five names.**
[`profil/page.tsx:41`, `app/[slug]/page.tsx:119`, `codes/page.tsx:40`, `RedeemForm.tsx:63`, `WalletView.tsx:188`]
"À récupérer" / "Cadeaux à récupérer" / "Mes codes" / "Code · comptoir" / a bare "2 à récupérer" with no noun at all. A first-timer can't tell these are one list and hunts for a second place their rewards might be.
**Smallest fix:** pick **"Cadeaux à récupérer"** and use it as the Profil tile, the page heading and the wallet badge.

**9. The bottom nav has no active tab on Offres, Mes codes or Ma carte.**
[`components/BottomNav.tsx:35`]
`href === "" ? pathname === base : pathname.startsWith(to)` — none of the three tests pass on `/boutique`, `/codes` or `/scanner`, so all three tabs render at `text-white/45`. The bar looks switched off on the three deepest screens.
**Smallest fix:** let the Carte tab own the shop subtree — any `/[slug]/*` that isn't `/historique` or `/profil`.

**10. The promised welcome bonus lands with no acknowledgement.**
[`app/[slug]/rejoindre/actions.ts:128`]
The action credits the points then does a bare `redirect("/{slug}")`. On a stamps shop the screen that greets you is an empty punch card reading "0 / 10 — Encore 10 visites pour votre récompense"; the ten points you were just promised are an 18px number in the corner. The join screen's only argument was "10 points offerts" and the payoff screen reads "you have nothing yet".
**Smallest fix:** `?bienvenue=10` and a dismissible "+10 points de bienvenue ✦" banner.

**11. "Changer de compte" signs you out on one tap.**
[`app/[slug]/profil/page.tsx:127`]
A full-width button posting `logoutDinerAction`, sitting two rems under "Voir toutes mes cartes →". It reads like a card switcher. No confirm, no warning that coming back needs the phone + PIN.
**Smallest fix:** rename it "Se déconnecter" and confirm with the cost stated.

**12. The card says "ta" and "votre" in the same paragraph.**
[`app/[slug]/page.tsx:68, 226, 229`]
"Ta récompense t'attend 🎉" four lines above "Encore 3 visites pour **votre** récompense", under "Merci pour **votre** fidélité !". The wallet footer says "Vous êtes commerçant ?" while the identical sentence on /moi says "Tu es commerçant ?". The project's own comment (`app/moi/page.tsx:19-22`) says voice is the only thing separating the two apps.
**Smallest fix:** two words on the card screen; pick one for the merchant footer.

**13. The wallet's back arrow navigates forward.**
[`components/WalletView.tsx:78`]
`router.push('/' + (backSlug ?? shown[0]?.slug))`. Arriving from /moi there is no `backSlug`, so a chevron labelled "Retour" drops you inside whichever shop sorts first.
**Smallest fix:** render the arrow only when `backSlug` is set.

**14. After redeeming there is no route to your codes.** [`RedeemForm.tsx:62`] The success chip is client state that dies on navigation, and the only link into `/[slug]/codes` in the entire app is one Profil tile labelled "À récupérer". Minor — the card screen lists the codes in full — but the success state should link onward.

---

## 3. The shop side

**1. BLOCKER — the whole owner app is squeezed into a 480px column on a laptop.**
[`app/owner/(app)/layout.tsx:40`]
The root is `class="app-shell a-shell flex min-h-dvh md:items-start"`. `.app-shell` is the *diner phone column*: `max-width: 480px`, unlayered CSS, so it beats any Tailwind utility. Meanwhile `md:` fires at 768px, so from there up the 248px `OwnerSidebar` appears **and** the bottom tabs hide — sidebar and content now share 480px, leaving ~230px for the till keypad, the settings list and the QR artwork. The `max-w-[680px]` on `<main>` never gets a chance. Git history shows `app-shell` predates the sidebar redesign and was simply never removed. A café owner who just paid opens their dashboard on a 1280px screen and sees a ribbon.
**Smallest fix:** delete `app-shell` from that div. Keep `a-shell` for the background. One word.

**2. A shop that runs on stamps is told "Pas encore de client".**
[`app/owner/(app)/analyses/page.tsx:65`]
The entire page is gated on `s.customers === 0`, and `customers` counts only phones with an `earn` row in `points_ledger`. `add_stamp` never touches the ledger. So three weeks in, sixty stamped cards, a dozen rewards handed out — and Analyses says nobody has ever joined and advises putting the QR on the counter, which he did. The "what you still owe" card is swallowed by the same gate.
**Smallest fix (not small):** base the empty check on activity across both mechanics — stamps issued, pending codes, claimed rewards — and render stamp figures when there are no points.

**3. "Net" books a free coffee as a 50 TND loss.**
[`app/owner/(app)/analyses/page.tsx:308`]
`rewardCostTnd = pointsRedeemed / pointsPerTnd` (`lib/stats.ts:171`), so at the seeded 1 pt/dinar a 40-point espresso is booked as a 40 TND cost against a drink that cost the owner two. `netTnd = revenue − that`. On the exact screen where he decides whether to renew, the product tells him loyalty ate 97% of his till — wrong by roughly a factor of twenty. The figure is hardcoded green, so welcome bonuses can produce a green minus number.
**Smallest fix:** rename the line "Valeur offerte en récompenses" and **delete the net figure**. The data to compute a real margin doesn't exist — `loyalty_rewards` has `points_cost` and no TND cost.

**4. The trial warnings lead nowhere; you cannot pay from inside the product.**
[`app/owner/(app)/layout.tsx:98`]
"Votre essai se termine dans 12 j", then "Votre abonnement a expiré — vos clients ne peuvent plus scanner". Neither is a link. The Réglages "Formule" row is a static div. There is no billing route in the owner app at all; prices exist only on the apex marketing page, whose CTA is "Commencer l'essai gratuit" — the thing this owner already did. Plans are settable only from the super-admin console.
**Smallest fix:** make all three link to one page showing the 65/80 TND options and a WhatsApp/email contact. That closes the loop without building payments.

**5. "Supprimer" destroys a reward instantly, with no confirm and no acknowledgement.**
[`app/owner/(app)/reglages/SettingsForms.tsx:530`]
10.5px underlined text, 12px from "Enregistrer" in the same row, and the destructive one is the smaller target. `deleteRewardAction` returns void and silently falls back to `active: false` when a redemption references the row — so the owner is told nothing either way and can't tell which happened.
**Smallest fix:** two-step the label ("Confirmer ?") and return a "Récompense supprimée" line.

**6. The camera reads one QR, then is dead until you leave the screen.**
[`components/QrScanner.tsx:90`]
On a successful read the loop sets `cancelled = true` and stops every track; the effect's only dependency is `[facing]`, so it can never restart. The till leaves `stage === "scan"` and the scanner is never unmounted (`CaisseForms.tsx:154-166`), so after you credit Ali and tap ×, the viewfinder is a frozen frame with the caption still reading "Pointez le QR du client". The next five people in the queue can hold their phones up forever; the cashier blames their phones.
**Smallest fix:** a `key={scanKey}` on `<QrScanner>` bumped in the sheet's `onClose`.

**7. Green success and red failure can be on screen at once.**
[`app/owner/(app)/caisse/CaisseForms.tsx:377`]
`credit()` and `stamp()` clear `err` but never `flash`; the correction handlers clear neither. Banners render flash-then-err, so a stale green "+12 points · nouveau solde 40" can sit *above* a fresh red "Montant invalide" — reading as confirmation of the sale that just failed. The cashier's only question is "did that go through?" and the screen answers both.
**Smallest fix:** `setFlash(null); setErr("")` at the top of every handler.

**8. You cannot type a minus sign in the field for taking points back.**
[`CaisseForms.tsx:544`]
`inputMode="numeric"`, `placeholder="+10 ou -5"`. The phone soft keypad has no "−". The handler accepts negatives fine — this is purely an input-mode mismatch, and subtracting (you credited 120 instead of 12) is the entire reason the field exists.
**Smallest fix:** `inputMode="text"`.

**9. "+1 tampon" sits 10px under "Créditer" and can mint a real reward.**
[`CaisseForms.tsx:514`]
Two full-width buttons in the thumb zone, `mt-2.5` apart, no confirm. When the card is one stamp short, `add_stamp` immediately inserts a pending reward with a live code, and nothing in the till can revoke it — `owner_set_stamps` only rewrites the counter. A mis-aimed thumb during a rush gives away a product permanently.
**Smallest fix:** when `stamps === required - 1`, two-step the button ("Compléter la carte ?"). Widen the gap to 24px.

**10. Four example rewards are live to customers before the owner has seen them.**
[`SettingsForms.tsx:551`]
`create_cafe` seeds Espresso 40 / Cappuccino 80 / Pâtisserie 120 / Brunch 300, all `active = true`, for **every** business type — a coiffeur gets coffee. Nothing in Réglages marks them as examples; the row reads "4 visibles · dès 40 pts", which looks finished. /nouveau does say they're editable, which softens it.
**Smallest fix:** seed them `active = false` and make "Rendre visible" the act that ends setup. Or one banner line in the editor.

**11. Day one, "Mes clients" is a heading, a "0" and a search box.**
[`CaisseForms.tsx:269`]
The faces strip is gated on `cards.length > 0`, the result list (including "Aucune carte.") on a non-empty query — so a new shop gets neither, plus no loading skeleton on first paint. A first-timer reads a search field as "your customers are in here somewhere" and types into it to find out why it's empty.
**Smallest fix:** an `!q && cards.length === 0` branch — *"Vos clients apparaîtront ici après leur premier passage"* with a link to /qr.

**12. The keypad can't type a customer code — and codes are mostly letters.**
[`CaisseForms.tsx:71`]
`KEYS` is digits, "." and "⌫". The account code draws 4 characters from a 32-symbol alphabet of which 24 are letters, so roughly 1 code in 250 is all digits. The big pad filling the screen is useless for the till's own primary identifier; the cashier taps the input and the OS keyboard covers the pad. (Mitigated: the input is deliberately `inputMode="text"`, Enter submits, and the recents strip resolves with no typing.)
**Smallest fix:** an ABC/123 toggle on the pad in "Un client" mode.

**13. The owner error screen is near-black text on a near-black background.**
[`app/owner/(app)/error.tsx:13`]
`<ErrorScreen>` with no `tone`, so it defaults to `"light"`: `#1a1330` title and `#625c7d` body on the owner shell's `#08040f`. The `tone="dark"` variant exists and isn't passed. The message also says "Réessaie" — tu-form, on the vous side, at the worst possible moment.
**Smallest fix:** pass `tone="dark"`; change to "Réessayez".

**14. Signup ends on the same form, in the wrong voice, with English errors.**
[`app/owner/(auth)/login/actions.ts:52`]
Success returns "Compte créé. **Vérifie tes** e-mails…" — the only tu sentence on the owner side — as a green line under a button that still says "Créer mon compte". Failure passes Supabase's raw message through: "User already registered". The first thing the product says to a shop owner is in the customer's register, in English.
**Smallest fix:** vouvoyer it, replace the form with a confirmation state naming the address, translate the two common auth errors.

**15. "Points en circulation : 4 200 ≈ 4 200 TND" is not what he owes.**
[`analyses/page.tsx:362`] Under a heading that says "Ce que vous devez encore", a four-figure dinar number reads as a debt. `outstandingPoints` sums every ledger row, so free welcome bonuses count as liability. "Codes en attente : 3" has no explanation and nowhere to go.
**Smallest fix:** drop the TND conversion, express it as "≈ N récompenses à venir", exclude welcome points.

**16. Tapping a period does nothing until the server answers.** [`analyses/page.tsx:52`] Plain `<Link>`s changing `?p=`; the segment is `force-dynamic` and a params-only change doesn't remount the loading boundary, while `getStats` pulls the entire ledger with no date filter. Zero pixels change — the old highlight, the old numbers. **Fix:** `useLinkStatus` in the pill, or move the highlight optimistically.

**17. "Baissez le prix de la première récompense" — with no way to do it.** [`analyses/page.tsx:280`] Every verdict branch ends in an instruction about reward pricing, and the chip is a plain `<div>`. **Fix:** wrap it in a link to /reglages.

**18. "Entre deux visites : 9 j" describes three people.** [`analyses/page.tsx:286`] The median pools every gap from every customer, so one daily regular with 20 visits contributes 19 of them. Sitting beside "Clients au total : 40" it reads as a statement about the customer base. Renders a bare "—" when nobody has returned. **Fix:** label it "· clients revenus"; replace "—" with a sentence.

**19. A comped shop is told it's on a trial, forever.** [`layout.tsx:34`] The chip has branches for `pro` and `expired` only, so plan `free` with a null expiry falls through to "Essai · illimité". Réglages gets it right ("Gratuite"); the header doesn't. **Fix:** one branch.

**20. Recent faces: 40px targets in a scroll strip, no feedback on tap.** [`CaisseForms.tsx:276`] Under the 44px minimum, inside a horizontal scroller, so a swipe can land as a tap on the wrong person; the busy state is surfaced on the keypad button, nowhere near the thumb. **Fix:** 48px chips, spinner on the tapped one.

**21. The only exit from a customer is a × in the far corner.** [`CaisseForms.tsx:443`] The sheet is `inset-0` so there's no backdrop, there's no Escape handler, and after a credit the primary button stays "Créditer" (disabled). One-handed, ending a sale means stretching to the opposite corner, all shift. **Fix:** after a success, swap the primary button to "Terminé · client suivant".

**22. On the Story format, "Imprimer" is dead and the reason never appears.** [`qr/PrintKit.tsx:221`] `disabled={!fmt.page}` with the explanation in a `title` — disabled elements don't fire mouse events, so hovering shows nothing. "Télécharger" is 8px away. **Fix:** print the sentence as visible helper text.

---

## 4. The console

**1. A 448px phone column wrapped around a 560px table.** [`app/admin/(console)/layout.tsx:33`] `max-w-md` plus `px-5` gives ~408px of content at any width, and `CafeTable` declares `min-w-[560px]`. On a 1920px laptop the table scrolls sideways forever with two-thirds of the screen blank; you can never see Café / Clients / Points / Abonnement together. The table's own header comment says the point is comparison — *"you cannot compare two shops that are 400 pixels apart."* **Fix:** `max-w-5xl` on the console shell.

**2. The error screen's escape button lands on a 404.** [`error.tsx:22`] `homeHref="/admin/login"`, but `/admin/*` is internal — the app-host proxy rewrites it to `/owner/admin/login`. Confirmed: `/admin/login` returns 404, `/console/login` returns 307, and the layout already redirects to the latter. **Fix:** change the href. While in the file, line 19 says "Ta session" in an otherwise-vous console.

**3. The "you're about to be locked out" banner is invisible.** [`layout.tsx:46`] `bg-[#fff3d6]` with `text-[#ffc861]` — about **1.4:1**. The warning that stops you losing a half-typed broadcast renders as a blank cream stripe. Same defect on the "À traiter" block (`page.tsx:43`, ~3.4:1 at 12.5px), which is the most important panel on the page. The header countdown badge is just "30 min" with no label. **Fix:** dark amber text; label the badge.

**4. "Durée 0" cuts a live café off instantly with no confirm — while Suspendre demands a typed reason *and* a confirm.** [`CafeControls.tsx:68`] Same blast radius for the shop's customers, opposite guards, and the unguarded one is easier to hit: a 60px number input where a scroll wheel turns 1 into 0, next to the primary purple button. Switching a café off "Gratuit (illimité)" has the same shape. **Fix:** mirror the confirm that's already six lines below.

**5. "Envoyer à tous les cafés" broadcasts on one click, and never says how many.** [`CafeControls.tsx:191`] No confirm, no count on the button, and the receipt is "Message envoyé à tous." The widest-reach action in the product is the least guarded. **Fix:** confirm with the row count already on the page; return the count.

**6. "Retirer" on a live announcement: no confirm, no feedback, silent on failure.** [`page.tsx:98`] A bare bound-action form with an 11px button against the message text. `dismissNoticeAction` returns void and swallows a lapsed elevation with `catch { return; }`. Retracting isn't undoable — restoring means retyping the kind, body and expiry from memory. **Fix:** `useActionState` + the same `<Result>` the other three levers use, plus a confirm naming the notice.

**7. Rows are clickable but not keyboard-reachable, and the drawer ignores Escape.** [`CafeTable.tsx:164`] `<tr onClick>` with no tabIndex, role or key handler, so the console's only path to every action it offers is mouse-only. The hint that rows are clickable is 10.5px grey text printed *below* the table. The drawer closes on backdrop and ✕ but not Escape, and focus is never moved into it. **Fix:** focusable name cell; move the hint above; add the keydown.

**8. The journal shows a bare "26/07" and never says what changed.** [`page.tsx:135`] Day and month only — twelve actions this afternoon are indistinguishable — and the stored `detail` (plan, amount, unit, until, suspension reason) is fetched and never rendered. **Fix:** add time; append the detail.

**9. Status is an 8px dot whose meaning lives in a `title`.** [`CafeTable.tsx:250`] No legend anywhere, and a suspended café's Abonnement cell still reads "PRO · 3 mois" — the row actively reassures you. The "À traiter" counts use the exact words of the filter chips but aren't clickable. **Fix:** a "SUSPENDU" chip in the plan cell; make the counts set the filter.

---

## 5. Prioritised plan

Ordered by pain ÷ effort, not by severity.

| # | Change | Side | Why | Effort |
|---|--------|------|-----|--------|
| 1 | Delete `app-shell` from the owner layout root | Shop | The paid daily product is unusable on a laptop; the sidebar it ships has nowhere to live | **S** |
| 2 | Confirm step + result message on "Supprimer" a reward | Shop | Irreversible, unconfirmed, unacknowledged, next to Enregistrer | **S** |
| 3 | Remount the QR scanner after each read | Shop | Scanning dies after customer #1 with six people waiting, and nothing says so | **S** |
| 4 | Clear `flash`/`err` at the start of every till handler | Shop | The screen says "yes" and "no" to the same sale | **S** |
| 5 | Console shell `max-w-md` → `max-w-5xl` | Console | The operator's only comparison screen is 400px wide | **S** |
| 6 | Show the shop's name + logo on the join screen | Customer | The one screen where you hand over a phone number is anonymous | **S** |
| 7 | Rename: "code secret" (PIN) / "mon code client" (account) everywhere | Customer | Two 4-character objects share a name; one is a password | **S** |
| 8 | Show `expire dans 48 h` in the redeem success chip | Customer | Points are spent irreversibly against a hidden clock | **S** |
| 9 | `inputMode="text"` on the points-correction field | Shop | The minus sign is untypeable in the field that exists to subtract | **S** |
| 10 | Delete the "net" figure; rename to "Valeur offerte en récompenses" | Shop | The renewal screen overstates the programme's cost ~20× | **S** |
| 11 | Fix the console error screen href → `/console/login` | Console | The only escape button 404s | **S** |
| 12 | Dark amber on the lockout banner and the "À traiter" panel | Console | 1.4:1 — the warning that prevents lost work is invisible | **S** |
| 13 | Empty state for "Mes clients" + link to /qr | Shop | Day one on the most-visited screen is a search box for nothing | **S** |
| 14 | Carte tab owns the shop subtree in the bottom nav | Customer | Three screens with no active tab read as disabled | **S** |
| 15 | Show the earn rate on the card and the join screen | Customer | "Encore 450 points" is meaningless without a rate | **S** |
| 16 | One noun for vouchers: "Cadeaux à récupérer" | Customer | Five names for one list sends people hunting | **S** |
| 17 | Reveal toggle on the PIN field (new-card mode) | Customer | The one field that must be right is the one you can't see | **S** |
| 18 | `tone="dark"` on the owner error screen + vouvoyer it | Shop | Unreadable exactly when it's needed | **S** |
| 19 | Confirm on "Durée 0" and on leaving `free`; confirm + count on Broadcast | Console | The two widest-blast actions are the two least guarded | **S** |
| 20 | Two-step "+1 tampon" when the card is one stamp from full | Shop | The only unrevokable till action has the loosest guard | **S** |
| 21 | Confirm on "Changer de compte" + rename to "Se déconnecter" | Customer | Reads as a card switcher; costs the whole wallet | **S** |
| 22 | Welcome-bonus banner on first arrival | Customer | The join screen's only promise lands invisibly | **S** |
| 23 | Seed example rewards inactive (or banner them) | Shop | Live commitments the owner never agreed to | **S** |
| 24 | Trial banners + Réglages "Formule" → a page with prices and a contact | Shop | The product says you're going dark and offers no way to pay | **M** |
| 25 | `live` flag in the wallet; dim paused shops, suppress the badge | Customer | The wallet advertises rewards the next tap refuses to show | **M** |
| 26 | Vouvoyer + translate the owner signup result | Shop | First sentence to a merchant, wrong voice, English errors | **M** |
| 27 | Owner-side PIN reset at the till, then honest "Code oublié ?" copy | Customer | Today the answer to "j'ai oublié mon code" is silence | **M–L** |
| 28 | Base the Analyses empty gate on stamps + points | Shop | Stamp shops are told they have no customers | **L** |

Items 1–23 are all S. If nothing else happens this month, ship 1–12: that's roughly two days of work and it removes the blocker, the two data-loss risks and the three invisible-feedback bugs.

---

## 6. Do NOT do this

- **Don't add a "Code oublié ?" link before the reset exists.** A link that leads to an explanation of why you can't be helped is worse than the current silence — it promises recovery and then admits there is none. Ship the till-side reset first, or ship copy that names the *real* path ("passe au comptoir avec ton numéro") and nothing more.
- **Don't fix the 480px column by piling `md:max-w-*` utilities on top of `app-shell`.** `.app-shell` is unlayered CSS and beats Tailwind utilities — the codebase already learned this once (see the comment in `SettingsForms.tsx:511`). Remove the class; don't out-specify it.
- **Don't "fix" the Net figure by adjusting the formula or the colour.** There is no per-reward cost anywhere in the schema, so any number you compute is a guess presented as accounting. Delete the metric. And do **not** add a "coût réel" field to every reward as the first move — that's a new data model plus a setup chore, to rescue a number nobody asked for.
- **Don't fix the stamps analytics gate by writing synthetic `earn` rows when a stamp is added.** It would fix one screen and corrupt revenue, the points liability and the reward-cost line simultaneously. Fix the gate, not the ledger.
- **Don't add a confirm dialog to "Créditer".** It runs dozens of times a shift and it's fully reversible from "Corriger". Guards belong on the three genuinely irreversible actions — completing a stamp card, deleting a reward, retracting a broadcast. Confirmation fatigue would make the guards that matter invisible.
- **Don't auto-close the customer sheet after a successful credit.** A sheet that vanishes on its own removes the confirmation the cashier is looking for. Give them an explicit "Terminé · client suivant" and let them press it.
- **Don't rename the `/boutique` or `/codes` routes to match the labels.** The user never sees a route. Fix the visible nouns; URL churn buys nothing and risks the printed QR flow.
- **Don't solve the seeded-rewards problem with 26 business-type templates.** Guessing a coiffeur's price ladder is the same mistake at greater cost. Seed inactive and let "Rendre visible" be the deliberate act.
- **Don't fix the wallet back arrow by swapping the push for `router.back()`.** From /moi that lands on a page that redirects signed-in diners straight back to /cartes — a loop. Hide the arrow when there's nothing to go back to.
- **Don't answer the console status-dot problem with a bigger dot or a tooltip legend.** Put the word "SUSPENDU" in the row. A status that has to be decoded is a status that gets missed.
- **Don't build a payment integration to close the trial dead end.** A page with the two prices and a WhatsApp link solves the actual problem — an owner with money in hand and nobody to give it to — this week instead of next quarter.
- **Don't touch the colour system.** The deep purple is not what's wrong here; every finding above is behaviour, wording or layout. Two contrast fixes in the console and one `tone="dark"` prop are the entire visual debt.