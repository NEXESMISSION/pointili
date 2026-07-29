# Pointili — refonte de la page d'accueil
**Plan à valider. Aucune ligne de code avant votre accord.**

---

## 1. Ce qui ne va pas aujourd'hui

Le problème n'est pas une liste de détails. C'est que la page actuelle est **une brochure qui pose une question dont personne ne veut** — « qui êtes-vous ? » — et qui, pour tout le reste, **affirme au lieu de montrer**. Ces deux choix plafonnent la page, quel que soit le soin qu'on y remet.

**Elle bifurque sur l'identité, en haut, dans le mauvais vocabulaire.** Deux boutons « Je suis client » / « Je suis commerçant », plus un hamburger. Pour l'acheteur, c'est un péage : il doit cliquer à travers une question qui ne le concerne pas. Pour le client — qui deviendra 55 à 70 % du trafic le jour où les boutiques tournent, parce que le kit imprime le domaine nu au pied de chaque chevalet — c'est une porte médiocre. Et « commerçant » rate précisément le serveur, l'arrivée la plus fréquente par boutique après la première semaine : un serveur n'est pas un commerçant, mais il sait qu'il va « à la caisse ». Chaque arrivée ratée devient un appel au patron, donc de la pression sur un abonnement à 65 TND.

**Elle ne montre jamais le logiciel.** Une photo de barista, quatre cartes de texte qui décrivent une boucle que personne ne met en doute, une checklist de cinq puces. Zéro pixel de la caisse, de la carte client, des analyses ou du kit d'impression. Résultat : tout ce que le visiteur doit croire est une affirmation de la page. Sur un marché à faible confiance, la persuasion est donc plafonnée par la confiance préalable du lecteur — et une meilleure formulation ne déplace pas ce plafond.

**Ses affirmations les plus fragiles portent la page, et ses vérités les plus fortes sont invisibles.** « Mise en place en 5 min » est faux et mesurable (l'inscription passe par un e-mail de confirmation). Le bandeau de logos se lit comme une liste de clients. Les trois icônes sociales sont les caractères « f ◎ ♪ » qui ne mènent nulle part. « Vos clients reviennent. Vraiment. » est la seule promesse pour laquelle le produit n'a aucun mécanisme — ni SMS, ni notification, ni relance. Pendant ce temps, le refus du logiciel d'afficher un taux de retour sous cinq clients, le crédit au client non inscrit, le code unique valable partout : rien de tout cela n'apparaît.

**Conclusion :** on ne peut pas restyler pour sortir de là. Il faut arrêter d'affirmer, montrer, et être le premier à donner la mauvaise nouvelle.

---

## 2. L'idée

**L'objet central de la page est une vraie carte Pointili, dans le chrome du produit, dans le premier écran** — et cet objet fait les deux métiers de la page à lui seul. Pour le client, c'est une porte : le formulaire de `/moi` (numéro + code à 4 chiffres, aucun slug requis) posé sur l'apex, qui le connecte à **toutes** ses cartes d'un coup. Pour le patron, c'est la preuve : trois taps font monter le solde, tomber un tampon, sortir un bon à 6 caractères, et un vrai pavé numérique de caisse juste en dessous fait bouger la même carte. Un objet, deux publics, aucune question d'identité posée à personne. Tout ce qui suit est rangé dans l'ordre où l'acheteur évalue son risque, et se termine sur un logiciel qui refuse de le flatter.

---

## 3. La page, de haut en bas

*(NOUVEAU = n'existe pas · SURVIT = conservé, réécrit · MEURT = supprimé)*

**0. Barre fixe — NOUVEAU** (remplace le hamburger, MEURT)
Logo à gauche. À droite, deux pastilles permanentes : **« Mes points »** (contour) → `/moi` · **« Caisse »** (plein) → `/owner/login`. Après le hero, une puce apparaît : **« 65 TND / 6 mois »**. Aucune formulation en « Je suis… ».

**1. Hero + la carte vivante — NOUVEAU** (remplace le hero, la photo barista, les deux boutons-fourche et le bandeau de réassurance — tous MEURENT)

> **Fidélité pour les commerces tunisiens**
> # Une carte de fidélité sans application.
> ## Un numéro, quatre caractères, c'est tout.
> Vos clients cumulent en scannant un QR posé sur la table. Vous créditez à la caisse en cinq secondes. Et à partir de votre cinquième client, vous savez enfin combien reviennent. 65 TND les six mois, 80 TND l'année.

Puis **la carte**, en chrome réel (`app-shell` + `d-card` + `d-stamp`, déjà globaux). Sous la carte, en **tu** :

> **C'est ta carte ?** [ Ton numéro ] [ •••• ] → **Voir mes cartes ✦**
> Tu ne sais plus dans quel commerce tu l'as créée ? Aucune importance : elles sont toutes au même endroit.

Puis, en **vous** : « Vous tenez un commerce ? Faites-la tourner. ↓ » et, avant les commandes de démo, une micro-ligne : *« Démonstration. Aucun numéro demandé, rien n'est enregistré. »*
*Ce que le visiteur doit ressentir : le client est arrivé. Le patron voit son propre client.*

**2. La boucle, en trois taps — NOUVEAU** (remplace la section « Comment ça marche » en 4 étapes, qui MEURT)
Trois boutons qui animent **la même carte** : « Il paie » · « Il revient » · « Il repart avec ».

> **Il paie** — « Vous tapez 12,500 à la caisse : des dinars, jamais des points. Le calcul se fait sur le serveur, à votre taux. Ni votre caissier ni votre client ne peuvent inventer un solde. »
> **Il revient** — « Un tampon. C'est votre carte en carton, sauf qu'elle ne se perd pas et qu'elle vous dit qui revient. »
> **Il repart avec** — « Six caractères. Vous les vérifiez d'abord, vous les validez ensuite, et le code ne peut servir qu'une seule fois. »

**3. De votre côté du comptoir — NOUVEAU**

> # Et de votre côté du comptoir.
> L'écran de votre caisse, sur le téléphone que vous avez déjà dans la poche. Le client annonce ses quatre caractères — ou vous ouvrez la caméra. Vous tapez le montant. Vous appuyez sur Créditer. Cinq secondes, pendant que vous rendez la monnaie.
> **Rien ne se fait tout seul.** Pointili n'est branché sur aucune caisse enregistreuse : c'est un geste de plus à chaque vente, et si votre équipe ne le fait pas, il ne se passe rien. C'est le prix de n'avoir rien à installer.
> Il n'est pas encore inscrit ? Vous créditez quand même : la caisse écrit « Première visite ici — ses points l'attendent ». Personne ne repart du comptoir avec un « inscrivez-vous d'abord ».
> Vous n'avez jamais besoin de demander son numéro à voix haute : quatre caractères suffisent, et votre écran affiche son prénom, ou son code.
> *On vous a dit « va sur pointili » et vous travaillez ici ? **Ouvrir la caisse →***

Le pavé numérique est réel et fait bouger la carte épinglée en haut de la section. La phrase en gras est en **corps de texte plein**, pas en petit : un patron prévenu forme son équipe ; un patron qui découvre se sent vendu.

**4. Un seul code, valable partout — NOUVEAU**

> # Ses quatre caractères marchent déjà chez le voisin.
> Un client Pointili a un code, pas un par boutique. Il y a deux conséquences, et je vous donne les deux.
> Le jour où vous posez votre QR, une partie de vos clients a déjà une carte : un tap, et ils sont chez vous, avec votre bonus de bienvenue et un solde qui démarre tout de suite.
> Et oui, cette carte marche aussi en face. Pointili n'enferme pas vos clients : ce qui les ramène chez vous, c'est votre récompense, pas notre verrou. Les points, eux, ne sortent jamais : chaque solde appartient à un seul commerce.
> Café, boulangerie, barbier, fleuriste, salle de sport, pharmacie — vingt-trois métiers, la même mécanique.

**5. Ce que vous saurez à la fin du mois — NOUVEAU**
Le bloc d'analyses réel, **alimenté par les taps que le visiteur vient de faire**, donc affichant son vrai état précoce :

> **Trop tôt pour conclure** — 1 client pour l'instant. Encore 4 et ce chiffre voudra dire quelque chose.
> « Vous venez de créditer un seul client : voilà ce que l'écran affiche. En dessous de cinq clients, un taux de retour ne peut valoir que 0 % ou 100 %. L'afficher serait vous mentir. À partir du cinquième, le même bloc donne le pourcentage, le nombre de jours entre deux visites, et un verdict — y compris « Votre première récompense est sûrement trop chère ». »
> « Vous ne trouverez pas de "bénéfice net" sur cet écran. Nous ne connaissons pas votre marge sur un espresso offert, et nous ne l'inventerons pas. »

C'est la section la plus persuasive de la page et elle ne contient **aucun chiffre inventé**.

**6. Ce que Pointili ne fait pas — NOUVEAU**, placé **avant** le prix. Accordéon, question dans la voix du patron :
code secret oublié (aucune récupération, 5 essais = 15 min, ses points continuent d'être crédités sur son numéro mais il ne rouvre pas sa carte — *« c'est notre plus gros trou »*) · connexion coupée (pas de hors-ligne, rien ne se rattrape) · compte pour le serveur (un seul identifiant par commerce, il voit vos analyses) · deux locaux (un par compte) · SMS et rappels (aucun) · arabe (non, tout est en français) · « on m'a dit cinq minutes » (faux : e-mail à confirmer, comptez un quart d'heure, ouvrez votre boîte mail avant de commencer) · carte en carton (« Gardez-la — Pointili fait exactement ça. La différence est derrière : le carton ne vous apprend rien ») · « mes clients sont à moi ? » (oui — pas encore de bouton d'export, on vous envoie la liste à la main).

**7. Faites le calcul — NOUVEAU** (remplace la liste de fonctionnalités sous le prix, qui MEURT)

> # Ces cafés offerts, ça vous coûte quoi ?
> [ Votre ticket moyen : **6 DT** ] [ Ce que vous coûte vraiment le cadeau : **1,20 DT** — son prix de revient, pas son prix au menu ] [ 6 mois / 1 an ]
> → « Votre client doit dépenser 30 DT pour déclencher sa première récompense. Soit 5 passages. Elle vous coûte 1,20 DT pour 30 DT encaissés : une remise de 4 %. L'abonnement vous coûte 0,22 DT par jour. »
> **« Nous n'irons pas plus loin. On pourrait afficher un "bénéfice net" : ce serait faux, parce que votre marge n'est nulle part dans nos données. Le logiciel ne le calcule pas non plus — c'est le même refus, au même endroit. »**

**8. Le prix — SURVIT, réécrit**

> # 65 TND les six mois. 80 TND l'année.
> Tout est compris : points, tampons, récompenses, analyses, kit d'impression. Pas d'option, pas de commission sur vos ventes.
> **Comment on encaisse.** Il n'y a aucun paiement en ligne. Pas de carte bancaire, pas de prélèvement, rien à résilier. Vous nous écrivez sur WhatsApp et on règle en espèces, par D17 ou par virement. Aucun compte ne peut être débité tout seul : il n'y a pas de quoi.
> **Les quatorze premiers jours.** Gratuits et complets. Au bout de quatorze jours la boutique s'éteint d'elle-même si vous n'avez pas pris d'abonnement — ce n'est pas une formule commerciale, c'est écrit dans la base.
> **Et si je ne renouvelle pas ?** Vos clients voient « Momentanément fermé ». Leurs points ne sont pas effacés : le jour où vous rallumez, tout est là, aux mêmes soldes.

**9. Le kit, imprimé ce soir — NOUVEAU, court.** Quatre silhouettes aux vraies proportions (chevalet A6, affiche A5, autocollant 80 mm, story 9:16), le QR toujours sur blanc, et le lien « Voir ce que voit un client » avant d'imprimer.

**10. Qui vous vend ça — NOUVEAU, sous condition.** Prénom, nom, ville, numéro WhatsApp écrit en clair, et une phrase sur les données : « On garde un numéro de téléphone et un code à 4 chiffres, chiffré. Rien d'autre. » **Règle de publication : valeurs vraies ou pas de section.** Un ⟨placeholder⟩ oublié ici est exactement le défaut des trois icônes mortes, en plus visible.

**11. Clôture — remplace « Vos clients reviennent. Vraiment. » (MEURT)**

> # Vous pouvez continuer à ne pas savoir. Ça, c'est gratuit.
> Ou 80 dinars pour l'année, et dans trois semaines le chiffre est sur votre téléphone.
> [ Créer ma boutique — 14 jours ] [ J'ai déjà un compte → Caisse ] [ ↗ Envoyer cette page à un commerçant ]

**12. Tu es client ? — NOUVEAU**, fond violet profond, **tu** partout :

> **Tes points sont là.** Ton numéro et ton code à 4 chiffres, et tu retrouves les cartes de tous tes commerces. [ Retrouver mes cartes ]
> Le commerce affiche « Momentanément fermé » ? Tes points ne sont pas perdus, ils reviennent avec lui.
> Ce qu'on a de toi : ton numéro et un code à 4 chiffres, chiffré. Pas d'e-mail, pas d'adresse, pas d'application. C'est gratuit et ça le restera — c'est le commerce qui paie.

**13. Pied de page — SURVIT, vidé.** Marque, une ligne (« La carte de fidélité des commerces tunisiens. Sans application. »), les deux portes à nouveau, le contact, « Fait en Tunisie ». **Aucune icône sociale tant qu'aucun compte n'existe.**

**Métadonnées.** `<title>` : « Pointili — la carte de fidélité sans application. 80 DT l'année. » · `og:image` : une capture du produit, jamais `hero-barista.png`.

### Les arbitrages, là où mes trois lecteurs n'étaient pas d'accord
- **Le H1.** Un lecteur voulait « Combien de vos clients reviennent ? Aujourd'hui vous n'en savez rien » — excellent pour le patron, mais le client lit ça et croit s'être trompé de site. **Décision : le H1 nomme l'objet, pas le public.** L'argument du patron passe dans la ligne juste dessous, avec le prix ; le client est servi par le formulaire, dans le même écran.
- **Objections avant ou après le prix ?** **Avant.** La mauvaise nouvelle en premier fait lire 80 TND comme un prix juste et non comme la chose qu'on défend. On perdra quelques essais impulsifs ; c'est le bon échange dans un marché où le produit se propage de patron à patron.
- **La carte d'analyses « 34 % reviennent ».** Supprimée. **On n'affiche que l'état de refus, dérivé de la démo.** Un logiciel qui dit « je ne sais pas encore » vaut mieux qu'un faux bon chiffre — et c'est le seul reproche que les trois lecteurs ont fait au concept retenu.
- **La photo du fondateur.** Abandonnée : un prénom, une ville et un WhatsApp qui répond portent toute la charge de confiance.

---

## 4. Les deux portes, sans fourche

Trois mécanismes, aucun ne demande au visiteur qui il est.

1. **La barre fixe nomme des destinations, pas des identités.** « Mes points » et « Caisse ». Un client sait ce qu'il cherche ; un serveur sait où il va. Coût pour l'acheteur : 52 px.
2. **L'objet du hero est littéralement la porte du client.** `SignInForm` (63 lignes) + `signInAction` existent : numéro + code, sans slug. Le rappel décisif : `app/page.tsx` redirige déjà tout client avec session vers `/cartes`. **Le seul client qui lit cette page est donc un client déconnecté — nouveau téléphone, cookies effacés. Il n'a pas besoin d'un panneau indicateur, il a besoin d'un formulaire.** Le même composant est la meilleure preuve produit pour l'acheteur.
3. **La voix sépare les publics, pas la couleur.** « Tu » pour tout ce qui s'adresse au client, « vous » pour tout ce qui s'adresse au patron, sans exception — c'est déjà la convention du code. Un lecteur reconnaît sa ligne avant de la comprendre.
4. Et pour le serveur : le lien « Ouvrir la caisse » est répété en corps de texte dans la section comptoir, là où il se trouve s'il a scrollé.

---

## 5. Ce qu'on n'y met pas, délibérément

- **Le bandeau de logos** (Espace Café, Le Comptoir, Urban Grill, Sweet Corner, NERO). C'est ce qui ressemble le plus à un mensonge, exactement là où le sceptique regarde en premier. Rien ne le remplace tant qu'une **vraie** boutique n'accepte pas d'être nommée. Un vrai nom vaut mieux que cinq inventés.
- **Témoignages, nombre de commerces, cartes émises.** `getPlatformStats()` sait les compter, mais on ne publie pas un chiffre avant qu'il soit vrai *et* flatteur.
- **Une capture d'analyses avec un taux de retour.** Preuve fabriquée par construction. Remplacée par l'état de refus, dérivé en direct.
- **« Mise en place en 5 min », « Support réactif », « Sans engagement ».** Le premier est faux et mesurable ; les deux autres sont invérifiables. Remplacés par le vrai temps de mise en route et un numéro WhatsApp — la version testable de « support réactif ».
- **« Vos clients reviennent. Vraiment. »** Aucun SMS, aucune notification, aucun rappel n'existe dans le code.
- **Les trois glyphes sociaux, le hamburger, la photo de barista, la fourche d'identité, la checklist sous le prix.**
- **Un bouton d'export**, **« hébergé en Europe »** (à vérifier avant d'écrire quoi que ce soit sur l'hébergement), **une photo de fondateur**, **le multi-boutique**, **l'arabe**, **toute intégration de caisse**.
- **Deux formulations à ne jamais écrire :** « la boutique ne voit jamais le numéro » (faux — `owner_cards()` le renvoie ; la formulation défendable est « le comptoir n'a pas besoin de le demander ») et « l'écran affiche ••• 123 » (la caisse rend `name ?? code`, donc un prénom **ou le code à 4 caractères**).

---

## 6. Ordre de construction

| Phase | Contenu | Effort | Ce qui manque aujourd'hui |
|---|---|---|---|
| **0. La passe de vérité** | Supprimer logos, bandeau de réassurance, glyphes sociaux, hamburger, photo, fourche, « Vraiment. ». Poser la barre fixe deux portes + puce prix. Titre et `og:` réécrits. | **S** (½ j) | Rien. **Ship dès ce soir : la page ment moins et route mieux, sans un pixel de neuf.** |
| **1. La carte vivante** | Hero réécrit + carte réelle (`d-card`/`d-stamp`) en animation CSS sur markup pré-rendu + `SignInForm` importé. Repli statique obligatoire si l'animation ne tourne pas. | **M** (1–2 j) | Rien de neuf : chrome global, action existante. |
| **2. La boucle + le comptoir** | Trois boutons d'état, pavé numérique `a-card`/`a-btn`, carte épinglée, l'aveu « rien ne se fait tout seul ». | **M** (2 j) | Rien. C'est la partie la plus délicate (état partagé) — à isoler. |
| **3. Le refus** | Bloc analyses alimenté par la démo, chaînes verbatim de `analyses/page.tsx`. | **S** (½ j) | Rien. |
| **4. Objections + calculateur** | Accordéon 9 questions, vrai temps de mise en route, deux champs et cinq lignes dérivées. | **S–M** (1 j) | Relecture de chaque réponse par vous : c'est votre parole publique. |
| **5. Prix, identité, client, partage** | Prix + encaissement + non-renouvellement, section « Qui vous vend ça », bloc client en « tu », `navigator.share`. | **S** (1 j) | **Bloquant : prénom, nom, ville, numéro WhatsApp réels.** Sans eux, la section 10 ne part pas. |
| **6. Kit + boutique de démonstration** | Quatre silhouettes, lien vers une vraie boutique de démonstration. | **S** (½ j) | Une inscription réelle à faire, et une capture produit pour l'`og:image`. |

Chaque phase se déploie seule. Si on s'arrête après la phase 0, la page est déjà plus honnête et route déjà les clients.

---

## 7. Comment on saura que ça a marché

**Le pari central est mesurable, et il a une condition d'échec écrite.** Une fois dix boutiques en ligne : parmi les sessions apex **sans cookie client**, la part qui se termine par une connexion `/moi` réussie ou un tap « Mes points ». Si elle reste sous un tiers, le problème n'est pas la copie — c'est la structure, et la réponse est un aiguillage plein écran avant le hero. On l'instrumente au jour un.

Les autres signaux, tous observables :
- **Appels et messages « où sont mes points » reçus par les patrons.** C'est la vraie mesure du travail client, et c'est de la pression de churn évitée. Demandez-la aux deux ou trois premiers commerces, à la main.
- **Le pas de tunnel qui compte : premier crédit effectué par quelqu'un d'autre que le patron, dans les 7 jours.** Pas les inscriptions : une inscription qui ne crédite jamais est une boutique morte.
- **Activité de crédit au jour 21.** Si les serveurs créditent encore trois semaines après, la page a vendu le bon produit à la bonne personne. C'est le seul chiffre qui prédit le renouvellement.
- **Conversion essai → payant**, et surtout **le motif du non-renouvellement** : s'il figure déjà dans « Ce que Pointili ne fait pas », la page a fait son travail et c'est le produit qui doit bouger.
- **Quels items de l'accordéon sont ouverts.** C'est un instrument de recherche gratuit : il vous dit quelle objection réparer en premier dans le logiciel.
- **Messages WhatsApp entrants venant de la page**, et taps sur « Envoyer à un commerçant ».

**Ce qu'on ne regarde pas :** pages vues, temps passé, profondeur de scroll seule, « impressions ». Une page longue et lue lentement par les mauvaises personnes ressemble à un succès sur ces chiffres-là.