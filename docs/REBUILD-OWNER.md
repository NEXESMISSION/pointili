# Rebuilding the owner app

Produced by a five-way parallel audit of every owner surface (onboarding, till,
clients, settings, shell) plus one synthesis pass. Kept in the repo because the
findings are measured, not opinions, and because the next person to open these
screens should not have to re-derive them.

Read this before changing anything under app/owner.

I have what I need. One note before the plan: `/owner/signup` is live and ungated while `paymentsLive` is false — a shop can sign up today, get 14 days, and meet a renewal screen that tells them not to pay and locks them out if they do. That shapes the build order below.

---

# POINTILI OWNER — REBUILD PLAN

## 1 · DIAGNOSIS

**The correct decisions are all in this codebase, written as comments, and they were applied file-by-file instead of built into shared primitives** — so every screen hand-rolls its own button, save model, row and banner, each fix reached only the files that were open at the time, and the app now disagrees with itself about the same fact: two colour editors with two previews that draw different cards, two ticket constants that price the same espresso at 8 visits and at 1, a customer printed as both a habitué and lost on one screen, and eleven docstrings describing behaviour their own file does not have.

**The app asks the owner to resolve ambiguity the system has already resolved** — which of two identical code fields, which of two colour pickers, which reward price to believe, what their own address turned out to be — **while leaving unanswered the four questions an owner actually opens it with**: is my first reward reachable, who is slipping, how do I get the QR onto a table, and how do I pay or get back in.

**And on every screen the vertical budget runs backwards**, with chrome, arithmetic and restated numbers stacked above the one control the screen exists for: measured at 390px, the onboarding finish button sits 88px below the fold, the first customer name on the page called "Vos clients" is at y=752 of a 775px fold, the line the receipt exists to say is fifth from the top in 13px on a four-second fuse, and the till carries ~130px of undismissable banner above a keypad used dozens of times a shift.

---

## 2 · THE DESIGN SYSTEM

### 2.1 The eleven primitives

Everything in the owner app is one of these. Nothing else gets invented.

| # | Primitive | What it is | When |
|---|---|---|---|
| 1 | **Shell** | `.a-shell` + sidebar + `owner-main` + width attribute | The frame. One instance. |
| 2 | **Strip** | One 40px line of state + a chevron, opening a Sheet | Anything the app needs to *say*: offline, trial, notice, undo, save result |
| 3 | **Card** | `.a-card` — one subject, radius 22, 1px `--o-edge` | Grouping. Never nests. |
| 4 | **Row** | One fact, at most one destination | Lists: settings, people, rewards, prizes |
| 5 | **Sheet** | One subject filling the screen (<lg) / 860px dialog (≥lg) | Any focused edit or moment |
| 6 | **Button** | `.a-btn`, `.a-btn--ghost`, `.a-btn--dark`, `.a-scan` | All actions |
| 7 | **Field** | `.a-field` | All typed input |
| 8 | **Choice** | A row of ≥48px single-select chips. **Switch** is its boolean form. | Presets, segments, swatches, methods, periods, types |
| 9 | **Figure** | A number, its label, and optionally one comparison number | Stats, balances, counters, receipt hero |
| 10 | **Empty** | Icon · 17px lead · ≤2 lines of 13px · exactly one `.a-btn` | Every zero state |
| 11 | **Preview** | The real artefact at real proportions — the card, the QR poster | Anywhere the owner is deciding how something will look |

**There is no chart primitive.** A chart is a row of Figures with a proportional bar drawn behind each. This is a rule, not a style: it makes the 7.36px bar whose value lives in a `title=` attribute structurally impossible, because a Figure always prints its number.

**There is no keypad primitive.** The drawn pad is a 12-cell grid of Buttons.

### 2.2 Layout unit

**Row** — one fact and at most one destination. Min-height 56px; 64px when it carries two lines (people, rewards). The label never wraps and the value truncates (existing rule, keep). A chevron appears only if tapping navigates. A Row contains no form control except one trailing Switch, and that Switch has its own column with a 16px gutter from the row's tap area.

**Card** — a group of Rows, or one subject's controls, under one heading. A Card never contains a Card. At most one primary Button per Card, and it is the last child.

**Sheet** — one subject. Full-bleed at <lg, centred 860px dialog at ≥lg (existing, keep). Portalled to `<body>` (existing, keep — the tab bar's `backdrop-blur` reason still holds). Three new laws:

1. **Every Sheet is a route**, via a Next intercepting route (`@editor/(.)…`). No `useState<PanelId>`. This one change fixes Android back, deep-linkability, `?panel=` sticking in the URL, and the entire lost-work-on-back-gesture class.
2. **A Sheet never opens a Sheet.** Kills the reward-editor-inside-the-rewards-editor.
3. Every Sheet has Escape, a focus trap, and `inert` on the background.

**Widths** — `680px` default, `[data-owner-wide]` 1080px for the pages read at a desk, `[data-owner-full]` for the poster. All three already exist in `globals.css`; the third currently has no caller and gets one.

### 2.3 Type

The nine-step scale in `globals.css:258` is correct and stays. What is missing is enforcement and weight.

| px | Role | Weight |
|---|---|---|
| 10 | eyebrow — uppercase, tracking .1em, `--o-muted` | 800 |
| 12 | small — helper text, values, axis labels | 500 prose / 600 value |
| 13 | body — sentences the owner reads | 500 |
| 15 | strong — row label, button label | 600 / 800 on `.a-btn` |
| 17 | lead — the heading of an Empty | 800 |
| 20 | title — a page or Sheet title | 800 |
| 24 | figure — a supporting number, a Sheet hero | 800 |
| 30 | the biggest thing on a crowded screen | 800 |
| 44 | display — the one number a screen exists to show | 800 |

**Three weights only: 500 / 600 / 800.** `font-bold` (700) is not in the system — a greppable rule.

**Half-sizes are already banned and are already back.** `SettingsList.tsx` — the file the brief names as the pattern — uses `text-[14.5px]` for its row label and `text-[12.5px]` for its value; `OwnerNav` uses `text-[10.5px]`; `.ticket-label` is 11px. These are the twenty-eighth, twenty-ninth and thirtieth sizes the comment warns about. Row label → 15, row value → 12, sidebar slug → 10, `.ticket-label` → 10.

**No primary action is ever smaller than the prose above it.** Currently the onboarding finish button is 12px against 15px body copy.

### 2.4 Spacing

**Every spacing value is a multiple of 4.** Tailwind `1 / 2 / 3 / 4 / 5 / 6 / 8 / 12` = 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48. **Half-steps (`-1.5`, `-2.5`, `-3.5`) are not in the system** — same argument as the type scale, same grep.

Fixed structural values, unchanged: card radius 22, inset 16, field 14, button 14, page gutter 20 (`px-5`), Sheet gutter 12.

**Tap-target ladder** — no exceptions, and every current failure below is named in the audits:

- **44px** — anything tappable at all (logo Retirer at 19px, `<details>` summaries at 30px, reward visibility toggle at 34px, period tabs at 41px, theme swatches at 40px — 37 of the theme sheet's 42 targets fail this today)
- **48px** — anything tapped during service or that changes a price (the −/+ steppers at 36px)
- **52px** — `.a-btn`
- **56px** — the scanner, Créditer, Collecter
- **64px** — tab bar, person rows

### 2.5 How state is shown

**Pending** — the control that was pressed changes, and nothing else changes. No `loading.tsx`, no page spinner, no skeleton, no layout shift. Navigation: the pressed tab lights (existing `useLit`, keep). Buttons: the label is replaced in place by a three-dot pulse at the same width. Rows: a spinner replaces the chevron.

**Empty** — the Empty primitive. **There are as many empty states as there are causes.** The clients screen already gets this right ("no cards yet" is a QR problem; "cards but no purchases" is a counter problem) and it generalises: an empty state that cannot name the cause is a bug, not a state.

**Error** — one French sentence, in the app's voice, directly under the control that caused it, naming the mistake *and* the way out. Never a raw server string (`tillMessage()`'s rule, generalised to every surface). Never a toast. Never `confirm()` or `alert()` — a native dialog is blocked in some in-app browsers, which silently made a two-tap delete one tap. If the way out is another screen, the link renders **inside** the error box (existing decision — "nobody reading a red box looks there").

**Success** — **the ceremony matches the cost of being wrong, not the difficulty of the code.** Three tiers, and only three:

1. A setting committed → the footer Strip: `✦ Enregistré  [Annuler]`, 3s, then settles to `Enregistré`.
2. Money moved → the full-screen receipt Sheet.
3. Something irreversible handed to a customer → the same full-screen Sheet, gold.

This is the rule that fixes the inverted ceremony: crediting points currently gets confetti and a halo while handing over a free coffee gets a small green inline box.

**And success is never reported without proof** — `assertWrote()` stays and extends to every write. A write that touched no rows is not a success.

### 2.6 What colour is allowed to mean

Five meanings. Nothing else is coloured.

- **Violet `--o-accent` #5b3fd1 — the one action this screen exists for.** *Exactly one violet element per screen or per Sheet.* If two things are violet, one of them is wrong. This single rule fixes the two-violet-slab till (where the rare `Vérifier` outshouts the `Chercher` used dozens of times a shift), the QR screen making a preview louder than printing, and the violet tile behind every settings icon.
  - Where two actions compete, the responsive split already in `.a-scan` is the pattern: on a phone `Scanner` is violet and `Chercher` fills to `.a-btn--dark`; at ≥md `.a-scan` goes outlined and `Chercher` takes the violet.
- **Red #e5484d — the shop cannot serve customers, or this action failed.** **Never a metric.** A quiet week is not a failure, which is why the four `▼ −100%` badges go.
- **Amber #a06e00 — this needs a decision, and there is time.** Trial ending, wheel on but empty, a first reward priced above `EASY_FIRST_VISITS`, dev build.
- **Gold — a customer is getting something free right now.** Only two places ever: the `Peut prendre maintenant` line and the reward-collected receipt.
- **Green — the shop's own live status.** Nowhere else. The green success box at the end of signup and the green voucher panel both become other things.

**The shop's brand colour appears only where the shop's own artefact is being shown** — the card Preview, the QR poster, the sidebar identity chip. Never on a control.

**Colour is never the only carrier.** Every coloured state also has a word.

### 2.7 Two cross-cutting rules

**One field, not two.** Where the system can decide, it decides. The till's routing is fully determined by length against formats the codebase already fixes (`0019`: account codes are 4; `pointili_gen_code`: vouchers are 6; Tunisian local numbers are 8 digits). Two boxes that differ only by their label reinstate a choice the tabs were deleted to remove.

**One save model, scoped by whether the record exists.**
- **Create** (signup, /owner/nouveau, new reward) — a form with one submit. The record does not exist yet; there is nothing to save into.
- **Edit** (everything in Réglages, the reward editor) — **nothing is ever "unsaved".** Discrete choices (Switch, Choice chip, swatch, preset, Look) commit on tap; typed values commit **on blur or 600ms idle** — never per keystroke, so a half-typed shop name never reaches a customer's card. Every `Enregistrer` button in Réglages is deleted, and the footer Strip reports the result with `Annuler`.

This is the Réglages auditor's model with the text-field hazard closed. It is the only model that works on a form whose button is off-screen for 90% of the interaction, and it removes the data-loss class rather than warning about it.

---

## 3 · SCREEN BY SCREEN, IN BUILD ORDER

### A · THE FRAME

**A1 · Shell** — `app/owner/(app)/layout.tsx`
*Puts every owner screen inside a quiet frame carrying at most one line of state.*

**ON:** sidebar (md+) + column. Inside the column, a **safe-area wrapper** (`safe-t [--safe-pt:0.75rem]`) containing **Strip then `<main>`**. `<main>` keeps `px-5 pb-5 md:px-8 md:py-8` and **loses `safe-t`** — the inset moves up so nothing the layout can render is ever under the notch.

The **Strip** is at most one element, chosen by priority: (1) shop dark — suspended or expired — red; (2) plan ends ≤7 days — amber; (3) the single highest-kind undismissed notice; (4) nothing, zero pixels. Shape: `px-5 py-2`, one 12px/500 sentence truncated to one line, trailing `›`. Tapping opens the Sheet at `/owner/etat` — it does not navigate.

The Sheet holds today's 130px of prose, wording unchanged: the status line and date; *"Rien n'est effacé : vos clients et leurs points vous attendent, intacts, le jour où vous rallumez."*; and **one** `.a-btn` —
- expired → `Renouveler mon abonnement`
- **suspended → `Appeler Pointili` (`tel:` `settings.supportPhone`) with ghost `Écrire` (`mailto:` `settings.supportEmail`), reason above.** The operator's number is already in the database and no owner screen renders it; a suspended shop is never again given a band with nothing to press.
- notice → the full message and `J'ai compris`, writing the id to `localStorage`. Only `info` and `warning` are dismissible.

Strip suppresses itself on `/owner/renouveler` and `/owner/etat`. `ownerNotices` folds into the `ownerCafe` RPC — one round trip fewer on every navigation of an app whose only loading feedback is a lit tab.

**REMOVED:** the four stacked bands; the unbounded, undismissable notice list; both banner links that point at the page the owner is already on; `safe-t` on `<main>`. The dev banner stops being a layout band and becomes a 10px mono `⚠ DEV` pill pinned bottom-left over the tab bar, so dev and production have the same vertical rhythm.

**Primitives:** Shell, Strip, Sheet, Button.

**A2 · Nav** — `components/OwnerNav.tsx`
*Five destinations, the same five on both machines.*

**ON:** unchanged — one `TABS` array, `prefetch`, `useLit`, 64px, sidebar from md. **Changes:** tab 5 label → `Compte`; `isActive` takes `match: string[]`; tab 5 matches `["/owner/reglages", "/owner/renouveler"]`, so the paying screen finally lights a tab. Sidebar footer reorders to **plan chip → Ma carte client → Le site Pointili → Se déconnecter**; today the chip representing the only decision in that footer sits below two outbound links, and the only `logoutAction` in the owner app is three scroll-lengths inside Réglages.

**REMOVED:** the `md:hidden` BackLink on `/owner/renouveler`; the `<details>` price fold as the only calm route to paying.

**A3 · `InstallPrompt`** — `dark = false` for the owner audience. The comment justifying a black slab describes a dark app that no longer exists.

**A4 · `error.tsx`** — `"Réessayez — c'est souvent momentané."` The owner shell vouvoies everywhere else.

---

### B · THE TILL — `/owner`

**B1 · The till at rest**
*Gets from a person at the counter to that person's screen in one action.*

Target ≤250px, everything above the fold at 390px. Today it is 1225px.

**ON:**
1. `Scanner` — `.a-btn .a-scan`, 56px, full width, violet. The screen's one violet element on a phone.
2. **One Card, one Row:** a single `.a-field` placeholdered `Code, numéro ou récompense`, and `Chercher` — outlined until the field has content, then `.a-btn--dark` on phone / violet at ≥md.
3. One 12px Row, tappable: `243 TND · 31 passages · hier 189` → expands Aujourd'hui in place. Collapsed by default at <lg; at lg nothing changes, Today keeps its five columns always open. This finally ships the fold `Today.tsx`'s own header already documents.
4. The **undo Strip**, when a credit has happened: `+174 à Habitué · Annuler`.

**ROUTING on submit** — exhaustive, no new judgement. Strip spaces and dashes, uppercase, then:

| Input | → |
|---|---|
| `/^\d{8}$/` | phone → customer sheet (walk-in is not an error) |
| length 4 | `resolveCustomerAction` → customer sheet |
| length 6 | `peekAction` → voucher sheet |
| length 7–8 alnum | `peekAction` (tolerance — it already accepts 6–8) |
| anything else | one sentence under the field: *"Un code client fait 4 caractères, une récompense 6, un numéro 8 chiffres."* |

The camera calls the same function with the same rules. **There is no wrong field, because there is one field.**

**REMOVED:** the entire `Valider une récompense` card — eyebrow, field, button, hint and second violet slab; the choice between two visually identical cards 16px apart; `Today` rendering unconditionally at 744px.

**Primitives:** Shell, Card, Row, Field, Button, Strip, Figure.

**B2 · The customer sheet** — *keep as built; three changes.* It measures well and reads at arm's length; header, balance line, amount box, drawn pad, Créditer, `+1 tampon` behind its confirm, `Corriger / Historique` behind their disclosure all stay.
- (a) The amount box stops raising the OS keyboard on touch: `inputMode="none"` under `(pointer: coarse)`. Typing and the Enter handler stay live on the laptop. Two number pads on one screen, with the confirm button behind the system keyboard, is not a choice anyone made.
- (b) `QrScanner` **unmounts** whenever `customer` or `voucher` is set. The lens is dark for the length of the transaction — which is what the file's own battery argument requires — and it removes the stray-decode path that wipes a half-typed amount.
- (c) Walk-in only (`!enrolled`): one ghost `Montrer le QR` under Créditer, full-screen. On this sheet only, for a person who has no card — not a third copy on the resting till.

**B3 · The voucher sheet** *(new)* — mirrors B2. Full-screen, same header and ×. Eyebrow `Gain`, label at 24px, code in mono beneath, `Collecter` as a 56px violet button, `Annuler` ghost. Expired and claimed keep their red panel and offer only `Nouveau code`. Peek-then-collect unchanged. On success it opens **the same receipt Sheet, gold**, with the reward name as the hero.

**B4 · The receipt, reordered** — tick → who → **the actionable line** → the number → the exits.
- `unlocked.length > 0` → the gift block is the hero at 24px gold: `Peut prendre maintenant : Café offert`. `+{earned} points` drops to a 17px line beneath.
- Otherwise `+{earned}` keeps the 44px display and the `next` nudge stays under it.
- **Both Fact tiles deleted** — `Nouveau solde` repeats the pill 100px above verbatim, `Montant` restates what the cashier typed four seconds ago. Removing them lifts the gift line ~180px.
- Unchanged: `Annuler` ghost, `Client suivant` violet, confetti, halo, veil scroll, and the `data-receipt` / `data-earned` / `data-balance` hooks the e2e reads.

**B5 · The undo outlives the receipt** — the one behaviour change. Keep the 4-second auto-release exactly as it is; the argument for it is right and a till still bound to the previous customer is worse than anything it costs. **Hoist the last credit out of `CustomerSheet` into `CaisseDesk`** so the reversal survives the unmount. It calls the same `undoCredit` **with the amount**, so Analyses nets the sale out of takings. This is the first time `DoneSheet`'s own claim — *"Undo stays reachable underneath either way"* — is true on the exit that is actually taken.

Secondarily: give `Corriger` an `amountTnd`, or relabel it `Corriger les points seulement`. Right now it silently does half the job and leaves phantom dinars in the day.

---

### C · THE QR KIT — `/owner/qr`

*Gets the code onto a table, and shows the owner what their customers will read.*

**ON:** (1) the QR plate — white, dark modules, glow, 300px cap, unchanged. (2) Directly beneath it, the fact that is currently invisible: `Vos clients lisent : 10 visites = un café offert.` — the `promise` string `page.tsx` already computes and passes only to `PrintKit` — with `Modifier` → `/owner/recompenses`. (3) The address in full, selectable, `k-num`. (4) Two ghosts side by side: `Copier le lien` `Voir la carte`. (5) **One violet `.a-btn`: `Imprimer l'affiche de table`.**

That button opens a Sheet holding the poster at real proportions (the existing `@container`/`cqw` card, untouched) with `Imprimer` and `Télécharger`. **The poster is rendered in exactly one DOM node, ever.** At lg the Sheet becomes the right-hand column, open by default — still one node. Print CSS: `print:hidden` on everything except that node, `@page { size: A6 portrait; margin: 0 }` emitted once. The double-page bug becomes structurally impossible rather than patched. `QrScreen` switches to `data-owner-full` when the poster panel is open on desktop, which is what `globals.css` already documents that attribute for and nothing has ever used.

**REMOVED:** the second `{children}` render at line 153; the violet on `Voir la carte client`; the collapsed grey row hiding both the print action and the promise line.

---

### D · ONBOARDING — four screens, each one thumb-height

**D0 · Auth layout** — wordmark at 40px, h1 at ~y=90 instead of y=182. The `Retour au site` pill above the fold is deleted; the exit becomes a plain text link under the card, where someone who has read the page will look. 22% of the fold is currently two copies of the same way out, above the first word that says what the page is.

**D1 · Compte** (`/owner/signup`) — chip `1 sur 4`.
One Card: `Créez votre compte` / `Quelques secondes, et vos clients peuvent scanner` / the violet `✦ 14 jours gratuits — sans carte bancaire` strip / e-mail / password + `Voir` / `Créer mon compte` / `Déjà un compte ?`. Under the CTA, three dots labelled `Votre carte · Vos récompenses · Votre affiche`, so the owner knows the size of what they are starting.
**Keep every input attribute on `AuthForm` byte-for-byte** — the autoCapitalize/autoCorrect/spellCheck hardening and the controlled e-mail surviving React 19's post-submit reset are load-bearing.
`Mot de passe oublié ?` beside the password label, **and the route behind it** — `resetPasswordForEmail` → `/auth/callback?next=/owner/mot-de-passe` → a set-new-password form, in `(auth)`, outside the café gate. There is nothing today: no link, no route, no call anywhere in the codebase.
**Fix the ending.** `signupAction` inspects its result: a live session redirects straight to `/owner/nouveau`. No session swaps the card for a confirmation state — not a green box inside the form: `Vérifiez votre boîte mail` / `Un lien est parti vers karim@gmail.com.` / `[Ouvrir ma boîte mail]` full-width / `[Renvoyer le lien]` secondary with a 60s cooldown that states the cooldown / `Ce n'est pas la bonne adresse ? Modifier`. Pass `emailRedirectTo: ${origin}/auth/callback?next=/owner/nouveau` so the link lands inside the flow instead of depending on a dashboard setting the repo does not express. Vouvoyer the notice.

**D2 · Votre carte** (`/owner/nouveau`) — chip `2 sur 4`. ~480px.
Card Preview at the top, verbatim, including the white-ink fix and the subtitle that is *always* the address. Name field (autoFocus, 60 chars). Collapsed `BusinessTypePicker` with `guessBusinessType`. Derived slug, server-side auto-disambiguation.
`Retirer le logo` moves **onto the card** as a 44px `×` badge on the logo square. It does not belong inside a collapsed panel named after two unrelated fields.
The primary button becomes `.a-btn` and is **not disabled on load** — an empty name produces an inline error under the field on submit. Today the first thing a new owner sees on the first screen is a pale lilac slab that reads as a rendering fault, which is the exact failure `globals.css` writes out in full.
**REMOVED:** the entire `<details>` "Adresse et téléphone" panel. The address derives and disambiguates itself; the phone creates nothing. Removing it removes the only control here that can raise an error naming a string the owner never typed.

**D3 · Votre première récompense** (`/owner/nouveau/recompenses`) — chip `3 sur 4`. ~620px against 1050px today.
This screen currently asks four questions and captures none. **It asks one.**
Top: the same card Preview, now carrying **the real slug the server claimed** (`pointili.online/cafe-central-2`). This is where the derived-address promise gets paid; today nothing ever tells them, and they read the URL off the preview onto a sticker.
Body: `Votre première récompense` / `C'est celle que vos clients regardent. Les autres peuvent attendre.` / label field prefilled from `rewardIdeas(businessType)` / `Après combien de visites ?` / **`VISIT_PRESETS` as 48px Choice chips `[2][3][5][8][12][autre]`** / the sentence in French under them / the amber warning above `EASY_FIRST_VISITS` (the constant, not a hardcoded 6).
Then **one collapsed Row**, not three cards: `3 autres récompenses déjà prêtes · Voir`. Then `Terminer` as a full-width `.a-btn` at 15px, and `Je le ferai plus tard` beneath.
**Two fixes behind it, both blockers:**
- **(a)** The chip handler passes `cost: null`. Today the stepper's handlers are `set(i, { visits: … })` and never clear the seeded cost, so on 100% of real signups the control is decorative: the owner sets 2 visits, sees "2", presses Terminer, and the database stores 8 points = 3 visits, silently. This is the single decision the screen exists to capture.
- **(b)** The seeded ladder must match the trade. `create_cafe` inserts four café rewards before `setBusinessType` runs, so a barber's step 2 opens pre-filled with `Cappuccino offert` and `rewardArtFor` attaches coffee photos. Cheapest correct fix with no migration: `createCafeAction` already holds the validated type — rewrite the four labels from `rewardIdeas(type)` and clear their `image_url` before redirecting. Better fix: give `create_cafe` a `p_type` argument and seed per-trade in the transaction. Either way, pre-filled text is the wrong nobody notices.
**REMOVED:** the −/+ steppers (36px, nine taps from 3 to 12, and they hide the range); three of the four pre-filled cards; the bare `+ Ajouter une récompense` text button; the three dead `hover:text-slate` no-ops.

**D4 · Votre affiche** (`/owner/nouveau/affiche`) *(new — the flow ends here)* — chip `4 sur 4`.
`Votre carte est en ligne.` The poster at full width — **the same component as C**. `[Télécharger l'affiche]` `[Envoyer sur WhatsApp]` — a Tunisian shop's printer is a phone and the copy shop on the corner, and a download-only button is a dead end on iOS. Then secondary `Aller à ma caisse`.
This is `createCafeAction`'s own argument applied one step further: *"Réglages is a screen you go looking for once you already know it exists, and a new owner does not."* The same is true of `/owner/qr`, whose own file says *"a one-job screen is where features go to be forgotten."* Onboarding is not finished at "my shop exists"; it is finished when something is scannable on the counter.

---

### E · RÉCOMPENSES — `/owner/recompenses` + `/owner/recompenses/[id]`

*One place a reward is judged and edited.*

**E1 · The list** — keeps its three counters (Échangées / En attente / Jamais prises) and its rows. Rows become tappable and open `/owner/recompenses/[id]` as an intercepting route. Réglages carries no rewards form at all, and the Sheet-inside-a-Sheet disappears with it — the move `OwnerNav`'s comment announced finally completes.

**E2 · The editor** — the price control becomes **two-way**:

```
Qu'est-ce qu'ils gagnent ?   [Espresso offert]   + idea chips
Combien ça coûte ?
   [2] [3] [5] [8] [12] [autre]   visites
   = [40] points  ·  environ 40 dinars dépensés
   Calculé sur votre ticket moyen réel : 60,00 TND.
```

Both fields live-linked: a preset writes points, typing points re-reads visits. **This is the fix for the collapse** — at this shop's ~60 DT ticket, `visitsForPoints` rounds 40 and 80 to the same `1 visite`, the smallest expressible step is 60 points, and 50 points cannot be expressed at all. The visits *question* survives; visits-*only* dies.
The existing round-trip guard is kept and matters more under instant save: touching neither control posts `reward.pointsCost` verbatim. The amber warning now fires on points as well as visits.
**Reordering works on a phone:** each row gains 44px `⌃`/`⌄` buttons calling the existing `reorderRewardsAction` with a swapped array. The pointer-drag handle stays at sm+. Today the handle is `hidden sm:block` — hidden from the exact handset the comment above it says the owner is using, and `position` is what the customer's list is ordered by.
Delete stays two-step and in-page. The editor still posts no `active`. The visibility toggle grows to 44px in its own trailing column.

---

### F · RÉGLAGES — a list of destinations, none of them a form

**F1 · The list** (`/owner/reglages`) — kept almost verbatim; it is the best thing on the surface and measures 1004px. Identity + account in one card. Then:

```
VOTRE PROGRAMME
  🎁 Récompenses          4 · dès 40 pts   ›   → /owner/recompenses
  ✦  Cadeau de bienvenue  25 points        ›   → /reglages/programme
  🎫 Carte à tampons      10 tampons       ›   (only when on)
  🎡 La roue              3 lots · 10 pts  ›   (only when on AND non-empty)
  +  Ajouter autre chose                   ›
  ── 1 dinar dépensé = 1 point, dans toutes les boutiques Pointili.
VOTRE CARTE
  [56px live Preview] Votre carte  Vert menthe · uni  ›  → /reglages/carte
  Adresse de la carte              [Copier] [Ouvrir]     (verbatim)
VOTRE COMPTE   — with ABONNEMENT first, never folded, one full-width
               Renouveler mon abonnement
```

`Les points` is renamed to what its editor actually edits; the immutable rate drops to a group footnote (a settings row is a promise: *this is the value, tap to change it* — that one advertises a platform-wide fact you cannot change and delivers an unrelated field). `Nom, logo & type` and `Le thème` collapse into one row named the same thing as its destination, carrying a real 56px Preview instead of the word "couleur unie".
**Wheel truth:** `active && prizes.length === 0` puts the wheel in VOTRE PROGRAMME with an amber value line `activée, mais vide — ajoutez un lot`, not under "Ajouter autre chose". Today three places say it is simultaneously off, on, and invisible.
**REMOVED:** `useState<PanelId>` and the `?panel=` seed; the `<details>` "Formules et tarifs" fold; five `Enregistrer` buttons; the "Réglages avancés" fold.

**F2 · `/reglages/carte`** — identity and look, merged.
**Sticky** at the top on a phone (~170px) and on the left at lg: the `ThemeForm` `<Preview>`, unchanged. It is the honest one — it draws banner, pattern, height, corners, surface, font, cover and logoShape, and uses the real `<ShopLogo>`. **`BrandColour` and `mixToBlack` are deleted outright** (~110 lines), along with the second preview that hardcodes `linear-gradient(168deg,…)` and draws a gradient light card for a shop whose card is flat green.
Sections: **Votre boutique** (logo 64px + 48px Changer + two-step Retirer; nom; type via the collapsible picker) · **Le style** (6 Looks at 56px, 10 swatches at 44px + picker) · **▸ Ajuster les détails**, folded, opening to five *labelled* groups — En-tête, Bandeau, **Cartes → "Coins des cartes"**, Texte, Logo, Ambiance. Renaming resolves two controls both called "Coins" sitting 700px apart with overlapping option labels.
Default: Preview + two decisions + one fold. Under one screen instead of 2.4, ~18 visible targets instead of 42.
**The photo stops writing behind the owner's back:** `saveCoverAction` no longer touches `design_settings.theme.banner`; it stores `cover_url` + `coverAt` and nothing else. Uploading enables and highlights the `Photo` segment; *choosing the segment* changes the banner. `removeCoverAction` falls back to the previous banner **only if the current one is `photo`** — never unconditionally to `gradient`, which today silently moves a flat-header shop to a gradient it never chose.

**F3 · `/reglages/programme`** — welcome bonus, with an example computed from **this shop's ticket, in decimal points**:
> *"Votre ticket moyen est de 60 DT — une visite rapporte 60 points. Avec 25 points offerts, votre première récompense (Espresso offert, 40 pts) est atteinte dès la première visite."*

`const TICKET = 2.5` and `Math.floor(TICKET * rate)` are **deleted** from `SettingsForms.tsx`; `lib/rewards.ts` owns `DEFAULT_TICKET` and it is the only copy. Formatted with `fmtPoints`, because points have been decimal since migration 0027 and this screen still prints the integer the database stopped using. When `ticket.measured` is false the sentence says so.
Stamps behind a Switch; **the `0 = jamais` sentinel is replaced by a real `La carte expire` Switch → `après [90] jours`**; fields disabled, not dimmed, when off.
**`Mettre le programme en pause`** gets its own bordered block at the bottom with a one-line consequence — not filed under "advanced", where an owner closing for renovation will never look. It is the biggest switch on the surface.

**F4 · `/reglages/roue`** — amber header when `active && prizes === 0`; the lots list is no longer `pointer-events-none` when the switch is off (setting a wheel up before turning it on is the correct order); odds as fractions — *"3 lots, tirés au hasard : chacun sort 1 fois sur 3"* — not `Math.round(100/n)` percentages that sum to 99; the grey apology caption goes with the last `Enregistrer`.

---

### G · CLIENTS — `/owner/clients`

*Answers "who is slipping and who should I thank", so a name is the first thing on it.*

**Header (0–90px)** — no back chevron at <md (this is a tab root; `BackLink` stays at md+ only). `h1 Vos clients` + one generated sentence that **is** the page: *"5 clients · 1 revient régulièrement · 1 n'est pas passé depuis 14 jours."* Built from the same numbers as the lists below, so it can never disagree with them.

**"À rappeler"** (~y=100) — the only list that is a to-do, rendered first, **omitted entirely when empty** rather than shown as a green reassurance. 64px person Rows: violet-outlined initial · name · `venait tous les 7 j · 3 visites · 14 jours d'absence` · chevron. **`sans lui` → `d'absence`** — ungendered everywhere; roughly half a shop's regulars are women. Tapping opens a Sheet with the two things the owner can actually do, **no phone number** (the Person doctrine holds): `Lui offrir un café à son retour`, which flags the account for this shop so the till shows `☕ Café offert en attente` above the amount field; and `Son historique ici`. **If neither ships in v1, delete "Un mot, un café offert" from the copy** — the page must not instruct an action it cannot perform.

**"Vos habitués"** — repeat customers **minus everyone in list 2**. The blocker fix in `lib/stats.ts`: build `lapsed` first, then `regulars = people.filter(p => p.visits > 1 && !lapsedPhones.has(p.phone))`. Today `lapsed` requires `rhythm !== null` which requires `visits > 1`, which is exactly the `regulars` filter — so on any shop with ≤6 repeat customers every lapsed person is also printed as a habitué. Both lists get an explicit `· depuis le début` eyebrow, matching the Verdict's existing label, so the period control can never be read as governing them.

**"Fidélité"** — **`1 client sur 5 est revenu.`** A fraction, never a percentage. This dissolves the `MIN_SAMPLE` threshold problem without undoing its principle: a fraction is honest at n=5 and at n=500, needs no confidence gate, and cannot flip the owner's pricing advice on one walk-in. Then the verdict sentence, then a real control the page currently lacks entirely: `[ Revoir mes récompenses → ]`. Drop `Leur préférée : X` — `/owner/recompenses` answers that per reward, with `Jamais prise` on the ones that do not work.

**Money** — one collapsed Row at the **bottom**, carrying its own period control: `30 jours · 394 TND · 7 passages ▾`, with the 7j/30j/Tout Choice *inside* it. The period governs one card, so the control belongs on that card. At lg it keeps its current column, unchanged; only the phone order changes. Three fixes inside:
- `avgTicket` gets `depuis le début` or leaves the period card. Never an all-time number under a period headline — today `?p=7` reads `0 TND` above `56.29 TND par passage`, in one card.
- `Delta` never prints a percentage and never `−100%`. Print the previous period's raw number, exactly as `Today.tsx` does: `394 TND · 128 la période d'avant`. A quiet week reads `0 TND · 394 la période d'avant` — the truth, not four red badges.
- The chart caps at 7 Figures below 768px whatever the period (daily for 7j, weekly buckets for 30j and Tout), ~40px each, **value printed**, empty buckets getting a visible baseline tick rather than a 2px sliver that reads as a rendering fault.
- `56.29` → `56,29`. `lib/points.ts` exists to prevent exactly this and says why: *"the comma is not decoration."*

**UNCHANGED:** both empty states verbatim, including the three-step first-day card with `Voir mon QR`. `analyses/page.tsx` is not touched — the 308 carrying `?p` is right.

Net at 390px: the first customer name moves from y=752 to ~y=140, `À rappeler` goes from never-on-screen to fully on screen, and every row does something.

---

### H · RENOUVELER — `/owner/renouveler`

*The one screen where a shop hands over money.*

**Payments not live is a different screen, not a warning bolted onto the live one.** When `settings.paymentsLive` is false: the offer tiles (so the owner can see the cost), then a single card in place of blocks 2 and 3 — *"Les paiements en ligne ouvrent bientôt. Appelez-nous et on prolonge votre compte à la main."* with `[Appeler …]` and `[Écrire]` from `supportPhone` / `supportEmail`. No coordinates panel, no hatching, no EXEMPLE chips, no uploader, **no submit button** — there is nothing to send. And `submitRenewalAction` refuses `!paymentsLive` server-side before it touches the RPC, so the lockout cannot happen by any route.

**When payments are live:** offer tiles (**`Total à payer` deleted** — with two offers it restates the tile the owner tapped 30px above); the three method chips and coordinates, with a copy control per line; the receipt, with `Ajoutez le reçu pour pouvoir envoyer.` shown while `proof` is null — the button stays outlined-not-faded, it just stops being silent about why; submit `Envoyer ma demande · 120 TND`; the `prolongé de 1 an` footnote deleted.

**Success:** `✓ Demande envoyée` / *"On vérifie le paiement et votre compte est prolongé — vous n'avez rien d'autre à faire."* / one button `[Retour à la caisse]`. `Vous pouvez fermer cette page` is deleted — the manifest is `display: standalone` and there is no page to close.

The pending card and the "Mes demandes" history carry over verbatim.

---

## 4 · WHAT MUST NOT CHANGE

These are the decisions the auditors were right to defend. For each cluster I name the change in this plan that comes closest to breaking it, and where the boundary is — because that is where a rebuild actually loses things.

**1 · A reward is priced in VISITS.** *"A café owner knows 'a free espresso after about five visits' — that is the whole decision… Points are the unit the DATABASE needs. Asking the owner for them is making the person do the machine's arithmetic,"* with the receipt: a 200-point espresso against a 1 pt/DT rate, eighty visits for one cup, *"It looked like a filled-in form."*
> **Closest call in this plan: E2 adds an editable points field.** This is not a reversal. The visits question stays primary, keeps the presets, and is what the onboarding screen asks. What dies is visits-*only*, which at a 60 DT ticket makes 40 and 80 points both read `1 visite` and makes 50 points inexpressible. Removing the visits question would be the regression; refusing an escape hatch was the bug.

**2 · The rate is stated, not offered** — 1 pt/DT platform-wide with a DB CHECK, *"A card worth double at one café and half at another is not a loyalty scheme, it is a currency exchange"* — and the server stopped *reading* `pointsPerTnd` from the body, not just hiding the input. **3 · Points are decimal since 0027**; `fmtPoints`, French comma, trailing zeros trimmed. **4 · `amount_tnd` is the single source of money**, with reversals netted out of revenue, visits and the ticket average alike.

**5 · Lapsed is measured against each person's own median rhythm** — twice their own median gap, floored at a week — *"A customer who comes monthly is not missing at day 25; a customer who came every second day is already gone at day 10."* Median not mean, so one holiday does not make a daily customer look monthly. Only people with 2+ visits can be lost. **And never a customer's phone number on an owner screen** — which is why G's rappeler action fires at the till, not through a contact channel.
> **Closest call: G changes the `regulars` filter.** The maths is untouched; only the set subtraction is added.

**6 · Refuse to conclude on too small a sample** rather than flatter the owner. G satisfies this *better* by printing a fraction, which needs no threshold — but the principle, not the constant, is what survives.

**7 · The till's hard-won correctness.** The points preview is the server's arithmetic, not `floor(montant × taux)`, because *"A cashier reads this number out loud before pressing Créditer."* The unit never leaves the preview line. `credit()` guards itself rather than trusting the disabled button. Peek before collect. The stamp asks first, in the app's own voice, never `confirm()`, and shows the card **full**. `onNext` is not `onClose`. Both remount nonces. `tillMessage()`. PIN reset gated server-side on `isCardholder`. The flash owns its own undo as one object, so the reversal renders only on the line that earned it.
> **Closest call: B5 moves the undo.** The 4-second auto-release survives untouched, and so does the one-object rule — the hoisted undo is still bound to the specific credit that created it, which is precisely why it can carry the amount.

**8 · Navigation.** Five destinations, one `TABS` array so a destination cannot exist in one shape and not the other, `prefetch={true}` explicitly (the default prefetches nothing in an app with no `loading.tsx`), **no `loading.tsx` — the pressed tab is the loading indicator**, and no mobile header. *"A tool with six screens and three tabs is a tool whose other half is folklore."*
> **Closest call: A2 renames tab 5 to Compte.** Five stays five, the list stays one, and the rename is what puts the sixth screen on the map.

**9 · Structural correctness.** The missing-café redirect is decided in the layout, not the page, because a redirect thrown from a page after `loading.tsx` streams becomes `<meta refresh>`. `viewportFit: "cover"` — the notch fix in A1 depends on it already being there. `Today` is rendered by the server page and handed down as an element. `[data-owner-wide]` and why it is written in CSS rather than as a custom property.

**10 · Security.** Server actions re-guard what pages guard, *"a page guard is not a guard: a server action is a public endpoint."* `isSafeNext()` closing an open redirect reachable from an e-mail link. Writes go through the owner's cookie-bound session and RLS, never service-role; no café id crosses the wire. `assertWrote()` — *"Never report saved without proof."* One café per owner, enforced where the write happens. A revoke must name PUBLIC.
> **Closest call: the instant-save model in §2.7 multiplies the number of writes.** `assertWrote()` becomes *more* load-bearing, not less, because there is no longer a button whose absence of feedback would be noticed. Every instant write reports through the footer Strip or it reports the failure.

**11 · Data safety.** Cleared rewards are deactivated, never deleted — `loyalty_redemptions` references them. `rewardArtFor` fills `image_url` only where it is still null. `nextPosition()` instead of a hardcoded 99. Client-side canvas downscale with the server still validating type and byte cap, and no SVG.

**12 · The `(setup)` group is authenticated but deliberately not café-gated**, and always carries a logout — *"an owner with no café used to be bounced /owner → /owner/login → /owner forever."* Same family: `ownerHome()` sending a super-admin to /admin.

**13 · A derived slug steps aside; a typed slug refuses.** Both halves are right. D3 is what finally pays for the trade-off.

**14 · Interaction physics.** The disarmed button is outlined, not faded. Every field is ≥16px so iOS never zooms. `touch-action: manipulation`. The owner app is light, because white gives more contrast under a fluorescent tube than a dark screen at 40% brightness, and because a shop showing a customer their card should not have to explain why one is black and one is white.

**15 · The Réglages list shape** — identity and state in one card, the label never wraps and the value truncates, the Sheet portalled to `<body>`, sheet-on-a-phone / dialog-on-a-monitor, the price list folded, optional mechanics hidden until switched on and *promoted* the moment they are.
> **Closest call: F1 deletes the `<details>` price fold.** The reason the fold existed — *"an advert in a room they own"* — is honoured by deleting the price list from Réglages entirely, not by unfolding it. The prices live one tap away on the screen that exists to show them.

**16 · The theme's refusals.** One honest live Preview of *their* card, not sample thumbnails, because *"the thing that goes wrong is never 'is teal nice', it is 'does my logo disappear on that'."* Looks above knobs. No preset gradient ramps, no third typeface, no free text colour. Conditional controls. `Entier` as a logo escape hatch. The wheel has no weight slider, because the draw is uniform and the customer pays to spin.

**17 · Print and QR.** One format. `@container` and the width cap on the same box — separating them once cost an owner a print shop's fee for a card with its head and feet cut off. The QR always on a white plate with dark modules, the glow that stops it reading as a broken image, and the address shown in full and selectable.

**18 · Renewal.** Not a wizard. No card checkout — *"shops in Tunisia pay by D17, by Flouci or by transfer."* The money resolved server-side from the offer id, and the derived (not literal) default offer. One pending request per shop, said before the owner tries. The receipt downscaled in the browser.

**19 · Copy that was fought for.** The offline message says the frightening half *and* the reassuring half — moved into a Sheet in A1, never deleted. Supabase's English mapped to French by message *shape* with a French fallback, and the way-out link rendered inside the red box. Reward ideas by trade, and `Coupe de cheveux` / `Coupe de glace` rather than the bare word that told an ice-cream customer they had won a free haircut. No business-type emoji as a shop's avatar. No "site public" link beside the card address. Two empty states because there are two ways to be empty. The period in the URL, and `/owner/analyses` 308-ing with `?p` carried through.

---

## 5 · BUILD ORDER

**Step 0 — the four live-harm fixes, shipped before any redesign.** Not part of the rebuild and not a substitute for it; these are actively costing shops while the rest is built. Each is between one and five lines.
> (a) `submitRenewalAction` refuses `!paymentsLive` — signup is open today and payments are not, so one curious tap permanently locks a shop out of its own renewal screen. (b) The safe-area wrapper in the owner layout — the most urgent message in the product is the one the status bar eats. (c) `cost: null` in the onboarding visit handler — every new shop is silently saving a price it did not choose. (d) The `regulars`/`lapsed` set subtraction — the page the codebase calls *"the one that has to be believed"* names the same person loyal and lost.

**1 — Primitives and tokens.** First, because it is the fix for the diagnosis itself. Build the eleven primitives, delete the dead `.o-card` / `.o-btn` / `.o-field` / `.o-shell` rules (zero callers — verified), pull `.ticket-label` onto the scale, and land the greppable bans: no `font-bold`, no `-1.5`/`-2.5`/`-3.5` spacing, no off-scale type. Everything after this step is assembly. Doing it later means doing every screen twice.

**2 — The frame** (A1–A4). Second, because every screen renders inside it, it carries a blocker, and it is small. The Strip and the route-backed Sheet are dependencies of steps 6–8.

**3 — The till** (B1–B5). The most-used surface in the product by an order of magnitude, and the only one whose bugs move money: a wrong amount noticed five seconds late currently cannot be reversed, and `Corriger` leaves the dinars in the ledger. Depends on 1 and 2 for the Strip (the undo line) and the Sheet.

**4 — The QR kit** (C). Small, self-contained, fixes a defect that costs real paper on every print — **and it must precede step 5**, because onboarding's final screen renders the same poster node.

**5 — Onboarding** (D0–D4) **and password reset.** The funnel: four blockers, including a silent data corruption on 100% of signups and a total lockout with no support desk behind it. It ranks below the till only because the till serves every existing shop every day while this serves each shop once. Depends on 4 for the poster. *The password-reset route is independent of everything else in this step and can be built first or in parallel — it lives in `(auth)`, outside the café gate.*

**6 — Récompenses and the reward editor** (E1–E2). Before Réglages, because Réglages loses its rewards Sheet *to* this screen and needs somewhere to send the link, and because the two-way price control is the fix that makes step 7's arithmetic honest.

**7 — Réglages as routes** (F1–F4). The largest single reduction — ~2,900 lines to ~1,600 across four routes — and it depends on 6 existing. Contains the two remaining contradictions: the same reward priced at 8 visits and at 1, and a cover photo that publishes to live customer cards before anything is pressed.

**8 — Clients** (G). Three blockers, but the least-opened screen in the app and the one whose fixes are mostly in `lib/stats.ts` rather than in the frame.

**9 — Renouveler** (H). Last, because step 0(a) already removed the harm; what remains is a screen redesign for a flow that is not live yet.

**Independence.** Steps **8** and **9** are independent of each other and of everything after step 2 — either can be pulled forward if someone is free. **4** is independent of **3**. Within step 5, the password-reset route is independent of the four onboarding screens. Everything else is a real dependency: 1 → 2 → {3, 4} , 4 → 5, 6 → 7.

**The one ordering I would defend hardest:** step 1 before anything. Every audit found the same failure — a correct decision written down and applied to one of two sibling call sites. That does not get fixed by fixing the call sites. It gets fixed by there being one call site.