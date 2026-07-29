# Client · mobile

**Who I am.** Yassine, 27. I work in an office off Avenue Habib Bourguiba and I
buy the same coffee at the same place most mornings. Mid-range Android, Chrome,
data not wifi. I install almost nothing.

**How this sheet was made.** Someone drove the real app on a 390×844 phone
viewport, screen by screen, and wrote down what was actually on the screen. The
shop is a throwaway test café called "Café Test". Nothing here is imagined and
nothing was fixed along the way.

*Fixture noise to ignore later: the café is named "Café Test", its type shows as
"Autre" because the test fixture never sets one, and the rewards are espresso /
cappuccino / pâtisserie / brunch.*

---

## 1 · The table. I scan the QR.

**Where I came from.** A little cardboard stand next to the sugar. I was waiting
for my coffee and I had my phone out anyway.

**What I see.** Chrome opens. No app store, no install prompt — that surprises
me for a second, in a good way. The page is dark purple. At the top just
"Pointili", then a round badge with a sparkle and a purple tick, then the café's
name, then in violet: **"10 points offerts à l'inscription"**.

Below that, two tabs: **"Nouveau compte"** (selected) and **"J'ai déjà un
compte"**. Then the form:

- **Numéro de téléphone** — a fixed `TN +216` block and a field showing `25 123 456`
- **Choisis un code secret** — four dots and a **VOIR** button on the right
- under it, small: *"Garde-le : c'est lui qui te rendra tes cartes sur un autre téléphone."*
- **Ton prénom (optionnel)** — placeholder `Karim`
- a full-width violet button: **"Créer mon compte →"**
- tiny grey line: *"En continuant, tu acceptes nos conditions et notre politique de confidentialité."*
- and below the fold, the start of something: **"Un seul compte."**

**What I notice about the URL.** I scanned a code for the café, but the address
bar ends in `/rejoindre`. I did not choose that. The café's own page pushed me
here.

**What I do.** Type my number. The keypad that opens is the numeric one — right.
Type four digits for the secret code. I skip the prénom, then go back and fill it
because it says optional and I feel slightly rude leaving it blank.

**How I feel.** Low resistance. Nothing has asked for an email or a card. The "10
points offerts" is doing real work — it makes filling this in feel like being
paid rather than being processed.

**What I'm asking myself.**
- *Is this "code secret" a password, or a PIN? Four dots says PIN. Is four enough?*
- *Who else sees my number? The café? Every café?*
- *If I lose my phone, what actually happens? The line under the field hints at it but doesn't promise it.*
- *What is "Un seul compte" about — I can see the top of it but I have to scroll to find out, and my coffee just arrived.*

---

## 2 · I tap "Créer mon compte"

**What I see.** It goes straight to the card. No confirmation screen, no "check
your SMS", no email. I'm in.

**How I feel.** Genuinely surprised how fast that was. Also, faintly, "was that
it?" — nothing verified that the number was mine.

**What I'm asking myself.**
- *Nobody checked the number. Could I have typed someone else's?*
- *So if someone typed MY number here, would they get my points?*

---

## 3 · My card

**What I see.** A pill at the top with the café's logo and name and a chevron —
so I can switch cafés from here. Then:

- **"Bonjour Yassine"**, and under it *"Merci pour votre fidélité !"*
- a points pill top-right: **10 points**
- a big panel: **"Tes points"** · **10** · *"Encore **30 points** pour espresso offert !"* · a progress bar · **10 / 40**
- a wide dark button: **"Montrer mon code au comptoir"**
- **"Offres disponibles"** with **"Voir tout"** on the right, then three rows:
  Espresso offert · 40 points · Cappuccino offert · 80 points · Pâtisserie du jour · 120 points
- a bottom bar: **Carte** · **Historique** · **Profil**

**How I feel.** This is the screen that makes sense of the whole thing. "10 / 40"
is the single most useful thing on it — it turns an abstract number into four
more coffees. The reward list underneath is the reason I'd come back.

**What I do.** Tap "Montrer mon code au comptoir" out of curiosity, because it's
the only instruction on the page.

**What I'm asking myself.**
- *40 points = 40 dinars of coffee? Nothing on this screen says what a point costs. I'm guessing.*
- *Do these points expire?*
- *"Offres disponibles" — but I can't afford any of them. Are they available, or just visible?*

---

## 4 · "Montrer mon code au comptoir" → the scanner page

**What I see.** A dedicated screen. Header with the café name, then **"Ma
carte"**, *"Montre ce code au comptoir."*, then **MON CODE CLIENT** and four big
characters — mine was **EAMM**. A QR below it, then: *"Le serveur scanne ce QR
(ou saisit le code) — pas besoin de donner ton numéro."* Then **Solde actuel ·
10 points 🪙**.

**The problem I actually hit.** The four characters are set in Space Mono at
weight 800 — a weight Space Mono does not ship, so the browser fakes it. On my
phone's screen at that size the two **M**s smear into filled rectangles. I read
my own code as "E A ▮ ▮". I had to zoom in to be sure they were letters.

**How I feel.** Reassured by the sentence about not giving my number — that's
exactly the thing I didn't want to shout across a counter. Then annoyed, because
the code I'm supposed to say out loud is the one thing on the page I can't read.

**What I'm asking myself.**
- *Is that an M, an N, or a W?*
- *Is this code just for this café, or everywhere? It says "code client", not "code Café Test".*
- *If someone photographs this QR over my shoulder, can they spend my points?*

---

## 5 · Historique

**What I see.** Header, **"Historique"**, *"Tes points et tes récompenses."*, and
exactly one row: **Bienvenue** · *à l'instant* · **+10**.

**How I feel.** Fine. Honest. It's empty because I'm new, and it doesn't pretend
otherwise.

**What I'm asking myself.**
- *Will this show what I actually bought, or only the points?*

---

## 6 · Mes codes

**What I see.** **"Mes codes"**, *"Montre-les au comptoir pour récupérer tes
récompenses."*, then an empty state: **"Aucun code en attente"** and *"Échange
tes points dans les Offres — le code apparaîtra ici."*

**How I feel.** Slightly lost. I have "mon code client" on one screen and "mes
codes" on another and they are different things. The empty state does explain
it, but only if I read it.

**What I'm asking myself.**
- *So there's a code that IS me, and codes that are things I've claimed. Why do both live under "code"?*
- *Where are "les Offres"? The card page called that section "Offres disponibles", the bottom bar doesn't have it.*

---

## 7 · Profil

**What I see.** An avatar circle with **Y**, my name **Yassine**, and my full
number **+216 28 983 203**. Then **MON CODE CLIENT · EAMM**, and two buttons:
**"Montrer ma carte"** and **"M'identifier au comptoir"**. Then a list:

- **À récupérer** — *Aucun code*
- **Offres** — *Échanger mes points*
- **Historique** — *Mes points & cadeaux*
- **Cette carte** — Café Test · *Autre · 10 pts*
- **Voir toutes mes cartes →**
- **Changer de compte**

**How I feel.** This is the most complete screen in the app — it's the one I'd
actually navigate from. Which makes me wonder why the bottom bar sends me to
"Carte" instead.

**What I'm asking myself.**
- *"Montrer ma carte" and "M'identifier au comptoir" — are those two different things? They sound identical.*
- *My whole phone number is printed here. Anyone who picks up my unlocked phone sees it. Does it need to be?*
- *"Changer de compte" — does that log me out, or add a second person?*

---

## 8 · Mes cartes (the wallet)

**Where I came from.** "Voir toutes mes cartes →".

**What I see.** A back chevron, **"Mes cartes"**, *"1 boutique"*, and the code
chip again top-right (with the same unreadable Ms). One row: the café's sparkle
logo, **Café Test**, *Autre*, **10 PTS**, chevron. Then a lot of empty dark, and
at the very bottom, small: *"Vous êtes commerçant ? **Espace boutique**"*.

**How I feel.** With one card this screen is nearly pointless — it's a list of
one thing I just came from. I understand it's built for the day I have six.

**What I'm asking myself.**
- *"Autre" — is that my card's type? Why is my coffee shop "Other"?*
- *Why is a link for shop owners at the bottom of my wallet?*

---

## 9 · Later that week — I want to check my points

**What I do.** I don't have the QR in front of me. I open Chrome and type
`pointili.online`.

**What happens.** It doesn't show me a website. It goes straight to `/cartes` —
my wallet. I'm still signed in from last week.

**How I feel.** Actually delighted. I typed a domain and got my own thing. It
behaves like an app I never installed. This is the single best moment in the
whole journey.

**What I'm asking myself.**
- *So this domain is "my points"? What if I wanted to read about the company?*

---

## 10 · Back at the counter — the barista credits me

**What I do.** I say "Yassine" and hold up my phone. The barista types something
and turns their screen slightly. I pay 60 dinars for a round for the office.

**What I see afterwards.** Reopening my card: **Solde 70 points**. The bar moved
past espresso. The history has a new line.

**How I feel.** This is the payoff. Nothing about it required an app, an email or
a password, and it took about six seconds at the counter.

**What I'm asking myself.**
- *He typed the amount, not the points. What if he types it wrong?*
- *If he made a mistake, can it be undone, and would I ever know?*

---

## 11 · Claiming a reward

**What I see on "Offres" / boutique.** **"Choisis ta récompense"**, *"Échange tes
points contre du réel, chez Café Test."*, then a big **10 · points disponibles**
(before the credit), the nudge *"Encore 30 pour espresso offert."*, and the
ladder — each row is a tappable button:

- Espresso offert · 40 points · *Encore 30 points*
- Cappuccino offert · 80 points · *Encore 70 points*
- Pâtisserie du jour · 120 points · *Encore 110 points*
- Brunch complet · 300 points · *Encore 290 points*

**How I feel.** The ladder is clear and the "encore N points" on every row is
kind — it never makes me do the subtraction. But every row is a button whether or
not I can afford it, so I tapped one I couldn't have.

**What I'm asking myself.**
- *Why is a reward I can't afford still a button?*
- *Once I claim it, how long do I have? Nothing on this screen says.*
- *Can I claim espresso twice, or is it one per lifetime?*

---

## The whole thing, from my side

**What worked.**
- No install, no email, no card. That is the entire product promise and it holds.
- "10 / 40" and "encore 30 points" — I always know where I stand.
- Typing the bare domain lands on my own wallet.
- "Pas besoin de donner ton numéro" at the counter is the right sentence in the right place.

**What didn't.**
- The four characters I'm meant to read aloud are the least readable text in the app.
- "Mon code client" vs "Mes codes" vs "Ma carte" vs "Montrer ma carte" vs "M'identifier au comptoir" — five names for two ideas.
- Nothing anywhere tells me what a point is worth in dinars. I inferred it.
- Nothing verified my phone number, and I noticed.
- Rewards I can't afford are still buttons.
- "Autre" as my café's type, twice, on screens meant to feel personal.

**The question I never got answered.** *If I change phone, what exactly do I type
to get my cards back — my number, or my number and the four-digit code?* One
line at signup hinted at it, and I never saw it again.
