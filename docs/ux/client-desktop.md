# Client · desktop

**Who I am.** Same Yassine. It's Tuesday, I'm at my desk on a 1440×900 laptop,
and I want to know whether I've earned the free coffee yet before I walk down.
My phone is in my bag, on silent, in another room.

**How this sheet was made.** The same journey as the mobile sheet, driven on a
1440×900 viewport, screen by screen. Everything described is what was on screen.
Nothing was fixed along the way.

*Fixture noise to ignore later: café named "Café Test", type shows as "Autre".*

---

## 1 · How I even get here

**The honest answer: with difficulty.** On my phone I arrive by scanning a QR
glued to a table. There is no table here. So my options are:

- remember the café's slug (`pointili.online/e2etest`) — I don't
- type `pointili.online` and see what happens
- search for it

I type the domain.

**What I see.** The marketing site. A dark hero: **"Une seule carte. Toutes vos
récompenses."**, *"Scannez. Cumulez des points. Revenez quand vous voulez. Sans
application."*, a violet **"Commencer gratuitement"** button, and *"14 jours
gratuits • Sans carte bancaire"*.

**How I feel.** This isn't for me. "14 jours gratuits", "sans carte bancaire" —
that's a price for a business. I'm a customer. I scroll looking for my way in and
the whole page keeps selling me a subscription.

**What I do.** Find the hamburger at the top right — the only control that isn't
a sales CTA. Open it. Inside, under **"Je suis client"**: **"Mes cartes & mes
points"**. Under **"Je suis commerçant"**: "Espace café" and "Créer mon compte".

**How I feel now.** Relieved, then slightly annoyed that the one link for me was
hidden behind an unlabelled icon while three buttons for shop owners were in
plain sight on the page.

**What I'm asking myself.**
- *Why is the customer door inside a menu and the business door on the page?*
- *If I'd been signed in already, would I even have seen this page?* (Yes — but only because I'm signed out on this laptop. On a machine that already has my card, this URL jumps straight to my wallet.)

---

## 2 · /moi — signing in on a laptop

**What I see.** The same phone-shaped dark column in the middle of my screen, on
a **light lavender background** that fills the other two-thirds. The app is dark;
the page around it is nearly white. They do not look like the same product.

Inside the column: the phone field with the fixed `TN +216` block, the four-dot
secret code field with **VOIR**, and a submit button.

**What I do.** Type my number and my four digits with a real keyboard. That part
is genuinely faster than on the phone.

**How I feel.** Like I'm using an Android emulator. Nothing is broken — it is
just visibly a phone screen that has been placed on a monitor, and the pale
surround makes the seam obvious rather than hiding it.

**What I'm asking myself.**
- *Is the site broken, or is this on purpose?*
- *Why is the background light when everything inside is dark?*

---

## 3 · My wallet, on a 1440×900 screen

**What I see.** A 480px column, centred. Header: back chevron, **"Mes cartes"**,
*"1 boutique"*, and top-right the chip **MON CODE CLIENT** with my four
characters. One card row: sparkle logo, **Café Test**, *Autre*, **10 PTS**,
chevron.

Then **roughly 700 pixels of empty dark**, and at the very bottom of that void,
in small grey: *"Vous êtes commerçant ? Espace boutique"*.

Left of the column: lavender. Right of the column: lavender. About 960px of the
1440 is background.

**How I feel.** This is the screen where the desktop experience stops feeling
like a choice. On the phone the empty space below one card is invisible because
the screen ends. Here it's a wall.

**The code chip, again.** Same defect as on mobile and it's worse here because I
expect a big screen to be crisp: the four characters are Space Mono at weight
800, which Space Mono doesn't have, so Chrome synthesises the bold. My code
`EAMM` renders as **E A ▮ ▮** — the Ms fill in solid. On the laptop I can zoom
the browser to read it; at the counter I couldn't.

**What I'm asking myself.**
- *Why is the only link at the bottom of my wallet an advert aimed at shop owners?*
- *Is my code really two letters and two boxes?*

---

## 4 · The card page

**What I see.** The same 480px column. Café pill at the top with a chevron.
**"Bonjour Yassine"**, *"Merci pour votre fidélité !"*, the **10 points** pill,
the **Tes points / 10 / Encore 30 points pour espresso offert ! / 10 / 40**
panel, **"Montrer mon code au comptoir"**, then **Offres disponibles** with three
reward rows.

And pinned to the bottom of the column: the mobile tab bar — **Carte ·
Historique · Profil** — floating in the middle of a desktop screen with
lavender either side of it.

**How I feel.** The content is good. "10 / 40" still does its job. But a bottom
tab bar on a laptop is the clearest signal that nobody expected me to be here.
My thumb is not near the bottom of my monitor.

**What I'm asking myself.**
- *Am I looking at a page or at a screenshot of a phone?*

---

## 5 · Historique, Mes codes, Profil, Ma carte

All four are the same 480px column on lavender, with the same content as the
phone and the same tab bar at the bottom.

- **Historique** — one row: *Bienvenue · à l'instant · +10*. Two lines of content in a 900px window.
- **Mes codes** — *"Aucun code en attente"*. Same.
- **Profil** — the fullest of them: avatar, name, **my full phone number in plain text**, my code, "Montrer ma carte", "M'identifier au comptoir", then À récupérer / Offres / Historique / Cette carte / Voir toutes mes cartes / Changer de compte.
- **Ma carte (scanner)** — *"Montre ce code au comptoir."*, the code, a QR, and *"Le serveur scanne ce QR (ou saisit le code)"*.

**How I feel about the scanner page specifically.** On a laptop this page is
almost funny — it exists so a barista can scan my screen, and my screen is a
laptop on a desk in an office. It isn't harmful, it's just clearly not written
for the device I'm on.

**What I'm asking myself.**
- *My full number, +216 28 983 203, is sitting on a screen in an open-plan office. Does the profile need to print it, or could it be masked with a "voir" like the secret code is?*

---

## 6 · The thing I actually came for

I wanted one number: **do I have enough for the free coffee yet?**

I got it — "10 / 40", "Encore 30 points". Two clicks from typing the domain, once
I found the hidden menu.

**How I feel overall.** The product worked. It answered my question and it never
asked me to install anything. But every screen told me, visually, that I was on
the wrong device — a 480px column, a bottom tab bar, a QR meant to be scanned off
my hand, and a light background around a dark app.

---

## The whole thing, from my side

**What worked.**
- Typing the bare domain when already signed in goes straight to my wallet. That's the best interaction in the product on any device.
- Typing a phone number and a PIN with a real keyboard is faster than on a phone.
- The points ladder reads exactly the same everywhere. I never had to relearn it.

**What didn't.**
- The customer entrance on desktop is a hamburger menu on a page selling subscriptions to shop owners. Three buttons for businesses are visible; the one link for me is not.
- Every customer screen is a 480px phone column on a light lavender background that clashes with the dark app inside it. About two-thirds of the window is unused.
- The bottom tab bar sits in the middle of the screen.
- The wallet leaves ~700px of dead space under a single card, then puts a shop-owner advert at the bottom of it.
- The code chip is unreadable in the same way it is on the phone — Space Mono asked for a weight it doesn't have.
- My full phone number is printed in the clear on Profil, on a screen other people can see.

**The question I never got answered.** *Was I supposed to be here at all?* Nothing
in the product says "open this on your phone" — it just quietly behaves as though
I already had.
