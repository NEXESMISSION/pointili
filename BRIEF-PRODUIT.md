# POINTILI — réponses au brief produit

Vérifié le 28 août 2026, dans le code et **dans la base de production**, pas de mémoire.
Chaque chiffre ici vient d'une requête réelle. Quand je n'ai pas mesuré, je le dis.

> **La réponse la plus importante est la 1. Lisez-la avant d'écrire une seule ligne d'ad.**

---

## 1 — L'état réel du MVP

**1. Un patron de café inconnu peut-il tout faire seul aujourd'hui ? → NON.**

Ce n'est pas un manque de finition, c'est volontaire et c'est dans le code :
`app/owner/(auth)/signup/page.tsx` fait `if (!paymentsLive) redirect("/early")`.
En production `paymentsLive = false`. Donc **la page d'inscription n'existe pas
pour un visiteur** : elle le renvoie au formulaire d'accès anticipé.

**2. Où exactement il se bloque : à la toute première étape.** Il ne se bloque pas
en configurant sa boutique — il n'arrive jamais à créer un compte. Il clique
« créer un compte », il atterrit sur `/early`, il laisse son nom et son WhatsApp.
C'est tout ce que le produit lui permet de faire aujourd'hui.

**3. Temps de configuration** — une fois que *nous* avons ouvert le compte :
email + mot de passe → boutique (nom, adresse `pointili.online/sa-boutique`,
téléphone, logo) → récompenses (4 sont pré-remplies : 40 / 80 / 120 / 300 points).
Quelques minutes. **Je n'ai pas chronométré un vrai patron le faire** — ne mettez
pas de chiffre dans une ad tant que vous ne l'avez pas regardé faire une fois.

**4. Interventions manuelles obligatoires — il y en a deux :**
- **Créer le compte.** Rien d'autre n'ouvre la porte aujourd'hui.
- **Valider chaque paiement.** Le patron téléverse une preuve de virement, un
  opérateur l'approuve dans la console. Aucun paiement n'est automatique.

**5. Qui l'utilise vraiment, maintenant** — 6 boutiques existent, mais « exister »
et « utiliser » sont deux choses différentes, et la différence est brutale :

| Boutique | Scans | Clients | Dernière activité |
|---|---:|---:|---|
| **Café El Manar** | **323** | **42** | 26 août |
| **GREENO** | 26 | 8 | **28 août (aujourd'hui)** |
| GreenLand | 6 | 1 | 23 août |
| Socrate | 2 | 2 | 17 août |
| saif | 0 | 1 | jamais |
| L3asba wo dhrareha | 0 | 1 | jamais |

**357 transactions de points au total depuis le 3 mai.** Un vrai café qui tourne
(El Manar), un qui vient de démarrer pour de bon (GREENO, actif aujourd'hui), et
quatre qui sont surtout des comptes ouverts. **Ne dites pas « 6 cafés nous font
confiance ».** Dites « un café l'utilise tous les jours depuis mai ». C'est plus
petit et c'est vrai — et un café qui tient 4 mois est un meilleur argument que
six logos dont quatre n'ont jamais scanné.

---

## 2 — Le scan

**6. Le flux exact au comptoir**
1. Le caissier a `/owner` ouvert (la caisse). C'est la page d'accueil du patron.
2. Il identifie le client : **son code court**, **son numéro**, ou **la caméra**.
3. Il tape le **montant en dinars**.
4. Il confirme. Les points sont crédités et le nouveau solde s'affiche.

**7. Le client doit avoir quoi d'ouvert ? — souvent rien du tout.**
C'est le point le plus mal compris du produit et le plus vendeur : **le client
peut ne rien sortir.** Il dit son code à 4 caractères, ou il donne son numéro.
Le caissier tape. Fini. S'il préfère montrer son écran, c'est sa page web (sa
carte). **Une capture d'écran marche**, parce que le code est fixe (voir 12).

**8. Combien de secondes ? — je n'ai pas de chiffre honnête à vous donner.**
Ce que j'ai mesuré pour de vrai, depuis la Tunisie contre la base de production :
**60 à 70 ms par appel base de données** (médiane sur 5 essais). C'est la partie
technique, et elle est négligeable. Le temps réel au comptoir, c'est le caissier
qui tape le montant — **et ça, personne ne l'a chronométré dans une vraie boutique.**
Allez à El Manar avec un chrono avant de mettre un nombre dans une vidéo.

**9. Sur quoi ? — n'importe quel appareil avec un navigateur.** Téléphone du
barista, téléphone du café, tablette, PC. Rien à installer.

**10. Connexion : un seul compte par café** (email + mot de passe). Les employés
ne se connectent pas séparément. Il existe des **codes PIN par employé**, mais ce
n'est pas un login : c'est une signature, pour que le journal dise « Sami a
crédité 40 dinars » au lieu de « le café a crédité 40 dinars ».

**11. Si internet coupe : le point est PERDU. Pas mis en attente.**
Le service worker est explicitement *pas* un cache et ne met rien en file. Il
sert une page hors-ligne, c'est tout. **Le caissier doit refaire l'opération.**
Ne promettez jamais de mode hors-ligne.

**12. Le code du client est FIXE.** Il ne tourne pas. C'est pour ça qu'une capture
d'écran fonctionne — et c'est aussi pourquoi ce n'est pas un secret : le code
identifie, il n'autorise pas.

---

## 3 — Les points

**13. 1 point = 1 TND. Toujours. Le café ne peut pas changer le ratio.**
Ce n'est pas une convention, c'est une contrainte `CHECK (points_per_tnd = 1)`
dans la base. Les 6 boutiques sont à 1. La base refuserait autre chose.

**14. Le caissier saisit le montant à la main.** Aucune connexion à une caisse
enregistreuse.

**15. Le patron fixe le coût de chaque récompense** dans `/owner/recompenses`, et
il peut le changer quand il veut.

**16. Plusieurs récompenses en même temps : OUI.** Les boutiques en ont 4 à 6
actives. L'échelle par défaut : Espresso 40, Cappuccino 80, Pâtisserie 120,
Brunch 300.

**17. Rien n'expire. Ni les points, ni les codes.**
Et c'est verrouillé sérieusement : un *trigger* en base force la date
d'expiration à NULL sur les trois tables de codes, donc même si un vieux bout de
code essaie d'écrire « 48 h », la base l'annule. Vérifié sur les vraies lignes :
tous les codes de production ont une expiration NULL. **« Tes points ne
disparaissent jamais » est vrai, et c'est un bon argument.**

**18. L'échange, étape par étape**
1. Le client choisit sa récompense sur la page de la boutique.
2. Il confirme (on lui montre l'arithmétique : « 40 points contre Espresso ? »).
3. Les points sont débités, un **code + QR** apparaît.
4. Il le montre au comptoir. Le caissier ouvre « Valider une récompense ».
5. Le caissier voit ce que c'est, sert, et valide.

**19. Annuler un point donné par erreur : OUI.** Bouton « Annuler ». Ça écrit une
**correction négative** dans le registre — la ligne fautive reste visible et la
correction aussi. Rien n'est effacé, ce qui est la bonne façon de gérer de
l'argent.

---

## 4 — Le client sans compte

**20. Le flux** : le client donne son numéro, le caissier le tape à la place du
code, et crédite normalement. **Ça marche même si cette personne n'a jamais mis
les pieds dans la boutique** et n'a aucun compte.

**21. Les points le rejoignent automatiquement quand il crée son compte — OUI,
c'est construit et c'est testé.** Le registre est indexé sur le numéro de
téléphone, donc les points sont déjà à lui : il n'y a pas de « fusion » à faire,
ils l'attendent. Une suite de tests entière (`test-walkin`, 10/10) ne vérifie que
ça : créditer un numéro sans compte, s'inscrire, retrouver les points.

**22. Deux personnes qui donnent le même numéro : elles partagent une seule
carte et un seul solde.** Il n'y a **aucune vérification du numéro** (voir 23).
C'est un vrai risque, pas une hypothèse.

**23. SMS : AUCUN. Zéro.** Le produit n'envoie ni SMS, ni notification, ni
relance — c'est même écrit noir sur blanc dans les CGU et la politique de
confidentialité. Coût : 0. **Conséquence à ne pas oublier : sans SMS, on ne peut
pas prouver qu'un numéro appartient à quelqu'un.** C'est pour ça que la
réinitialisation du code secret se fait au comptoir, en face à face.

---

## 5 — Le côté client

**24. Une page web. Aucune app à télécharger.** Installable sur l'écran d'accueil
(PWA), mais jamais obligatoire. **C'est le meilleur argument du produit — pas de
store, pas de 40 Mo, pas de mise à jour.**

**25. Pour créer un compte : prénom + numéro + un code secret à 4 chiffres.**
Pas d'email, pas de mot de passe.

**26. Plusieurs cafés au même endroit : OUI.** Une seule identité, un portefeuille
(`/cartes`) qui liste toutes ses cartes. Le même code secret ouvre tout.

**27. Deux langues : tunisien (par défaut) et français.** Le tunisien est ce que
voit quelqu'un qui arrive sans rien choisir. Pas d'arabe littéraire séparé, pas
d'anglais.

---

## 6 — Le côté propriétaire

**28. Ce qu'il voit vraiment** (tout existe) : la caisse avec la journée en cours
(recette, visites, points, nouvelles cartes, récompenses servies, comparé à hier
à la même heure) ; ses clients ; ses récompenses ; son QR + kit d'affiches à
imprimer ; ses réglages ; son équipe ; son renouvellement.

**29. « Combien de clients reviennent » — OUI, ça existe, et c'est solide.**
C'est votre argument de vente et il est réel :
- le **taux de retour** (% de clients revenus au moins une fois),
- le **nombre de visites par client**,
- l'**écart médian entre deux visites** (le rythme du client),
- les **habitués**, et surtout les **clients en train de partir** — ceux en retard
  *sur leur propre rythme*,
- un indicateur de **confiance** qui dit « pas assez de clients pour conclure »
  au lieu d'afficher un pourcentage inventé sur 3 personnes.

Ce dernier point mérite d'être vendu : le tableau de bord refuse de mentir quand
l'échantillon est trop petit.

**30. Export des données : PAS ENCORE.** Aucun CSV nulle part.

---

## 7 — Fraude et limites

**31. Limite « un scan par client par jour » : PAS ENCORE.** Il n'y a aucune
limite sur les points. On peut créditer le même client autant de fois qu'on veut.
(La roue, elle, a bien un délai de 24 h — mais c'est la roue, pas les points.)

**32. Ce qui empêche un barista de se donner des points : rien de technique.**
Soyons clairs, parce que c'est une question qu'un patron posera :
- il n'y a **pas** de plafond, **pas** de limite journalière ;
- ce qui existe, c'est la **traçabilité** : avec les PIN, chaque opération porte
  un nom, et le patron a un journal + ses statistiques.

C'est de la dissuasion, pas de la prévention. Ne dites pas « protégé contre la
fraude ». Dites « chaque opération est signée ».

---

## 8 — Technique et coûts

**33. Hébergement : Vercel (Francfort) + Supabase (Zurich).**
**Le coût mensuel, je ne peux pas l'inventer** — je ne vois pas les factures.
Regardez les deux tableaux de bord. Vu le volume réel (357 transactions depuis
mai), on est presque certainement dans les paliers gratuits ou juste au-dessus.

**34. À 50 cafés : techniquement, aucun problème.** Rien dans l'architecture ne
bloque — la charge actuelle est minuscule et le travail est fait par la base, pas
par l'application. Ce qui coûtera, ce sont les paliers Supabase et Vercel, pas
une réécriture. **Le vrai obstacle à 50 cafés n'est pas technique, il est au
point 4 : chaque compte est ouvert à la main, et chaque paiement validé à la
main.** 50 cafés, c'est 50 ouvertures manuelles et un paiement à valider chaque
mois par café.

**35. Les paiements ne sont PAS branchés.**
- `paymentsLive = false` en production.
- Les coordonnées affichées sont des **placeholders** : « 00 000 000 »,
  « EXEMPLE — À REMPLACER ». Personne ne peut virer d'argent à ces coordonnées.
- Le circuit prévu : le patron voit l'offre, fait un virement (D17 / Flouci /
  virement), téléverse une preuve, un opérateur valide dans la console, le plan
  est prolongé.
- Les prix définis : **80 TND / 6 mois** et **120 TND / an**.

**Rien de tout ça n'est encaissable aujourd'hui.**

---

## 9 — La vérité

### 36. Ce qui n'est PAS construit mais qu'on pourrait décrire comme si

1. **L'inscription autonome.** Le lien existe, il renvoie à la liste d'attente.
2. **Le paiement.** Aucun encaissement, coordonnées factices, validation à la main.
3. **L'export des données.**
4. **Les SMS** (et donc toute vérification de numéro).
5. **Le mode hors-ligne.** Coupure = point perdu.
6. **Toute limite anti-abus sur les points.**

### 37. Ce qui va casser en premier

**Le double-crédit à la caisse.** C'est le plus probable et je peux dire pourquoi
précisément. Quand la réponse du serveur se perd (la base est à Zurich, ça
arrive), le caissier voit une erreur — alors que l'opération est peut-être passée.
Il recommence. **Le client est crédité deux fois.** Il n'y a pas de clé
d'idempotence sur le registre.

Je viens de corriger exactement ce défaut du côté client — un client avait payé
ses points et n'avait jamais reçu son code, parce que la base avait validé et que
la réponse s'était perdue. **Le même défaut est encore ouvert côté caisse**, dans
l'autre sens : là c'est le café qui perd, pas le client.

Ensuite : les numéros partagés (22), et l'absence totale de garde-fou sur les
points (31/32) le jour où un employé s'en aperçoit.

### 38. Si j'avais une semaine

1. **La clé d'idempotence sur le registre de points.** Ça ferme le double-crédit
   pour de bon. C'est le seul travail de cette liste qui touche à l'argent.
2. **Une garde par client** (genre « ce client vient d'être crédité il y a 2
   minutes, c'est voulu ? »), qui coupe l'abus le plus bête sans gêner personne.
3. **L'export CSV.** Petit, et ça enlève « et si je veux partir avec mes
   données ? » de la table des objections.

Je ne mettrais **pas** l'inscription autonome en premier : tant que les paiements
ne sont pas branchés, une inscription ouverte crée des cafés qu'on ne peut pas
facturer.

---

## Ce qu'on peut promettre sans mentir

- Pas d'application à télécharger, ni pour le café ni pour le client.
- Le client peut ne rien sortir de sa poche : il dit son code ou son numéro.
- 1 point = 1 dinar, et ça ne peut pas être trafiqué.
- Rien n'expire, jamais.
- Le client sans compte est crédité quand même, et retrouve ses points le jour
  où il s'inscrit.
- Le patron voit combien de clients reviennent, à quel rythme, et lesquels sont
  en train de partir.
- Un café l'utilise tous les jours depuis mai.

## Ce qu'il ne faut pas dire

- « Inscrivez-vous en ligne » — non, la porte est fermée.
- « Payez en ligne » — non, rien n'encaisse.
- « Marche hors connexion » — non, le point est perdu.
- « Protégé contre la fraude » — non, c'est tracé, pas empêché.
- « 6 cafés » — 6 comptes, 2 usages réels.
