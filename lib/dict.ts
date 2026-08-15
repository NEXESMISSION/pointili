/**
 * ── TWO LANGUAGES, AND ONE OF THEM IS NOT MODERN STANDARD ARABIC ──────────
 *
 * The customer app spoke French to everybody. In a Tunisian café that is the
 * wrong default about half the time — and the usual fix, "add Arabic", is worse
 * than not adding it: fusha (فصحى) is the language of the news and of school
 * forms. Nobody says «رصيدك من النقاط» to a person holding a loyalty card. Nor
 * does anyone here want Moroccan or Egyptian phrasing, which is what a generic
 * "ar" translation drifts into.
 *
 * So the second language is TUNISIAN — derja, written in Arabic script, in the
 * words used across a counter in Tunis: متاعي, برشا, باش, هوني, ڨارسون, شنوة,
 * تنجم, ما…ش. If a sentence would make a Tunisian smile at how formal it is, it
 * is wrong and should be rewritten.
 *
 * Words this file commits to, because the near-synonym is the tell:
 *
 *   باقيلك    not متبقي and not just باقي — "you have N left" is one word here
 *   زيارة     not خرجة for a visit to a shop
 *   فرع       not بوتيك for a branch (بوتيك is a clothes shop)
 *   هدية      not مكافأة for a reward
 *   قهوة هدية not قهوة مجانية / offerte
 *   حلو       not حلويات/pâtisserie
 *   الڨارسون  not النادل
 *   كارت      not بطاقة
 *
 * ── WHY A DICTIONARY AND NOT next-intl ────────────────────────────────────
 * Two languages, one audience, no routing change. next-intl would add a locale
 * segment to every diner URL — and those URLs are printed on stickers stuck to
 * tables. The language is a preference of the PERSON, carried in a cookie, and
 * the shop's address stays the shop's address.
 */

export type Lang = "fr" | "tn";

export const LANG_COOKIE = "pointili_lang";

/** Arabic script runs right to left; French does not. Everything else follows. */
export function dir(lang: Lang): "rtl" | "ltr" {
  return lang === "tn" ? "rtl" : "ltr";
}

/* ══ COUNTED NOUNS ═══════════════════════════════════════════════════════
   WHY THIS EXISTS AT ALL, and why concatenating fragments could not work.

   The screens used to build a counted phrase out of dictionary pieces:

       {t("Encore")} {n} {t(n >= 2 ? "points" : "point")} {t("pour")} {label}

   In French that is fine. In Arabic it is wrong three times over:

     1. NUMBER AGREEMENT IS NOT A PLURAL FLAG. Arabic counts in four bands,
        and the 3–10 band takes the PLURAL while 11 and up goes back to the
        SINGULAR: ٣ نقاط but ٣٠ نقطة. A boolean `n >= 2` gets the second one
        backwards on every balance above ten — which is every balance that
        matters.
     2. THE WORD ORDER IS NOT THE SAME. «Encore 30 pour X» puts the unit
        nowhere; the Tunisian sentence needs it («باقيلك ٣٠ نقطة باش تاخذ X»),
        so no amount of per-fragment translation produces it.
     3. FRAGMENTS CANNOT BE PROOFREAD. "pour" alone has no meaning to check.

   So counted phrases are whole sentences with a {slot}, and the slot is filled
   by t.n(), which knows the bands. Nothing in a JSX file decides grammar.

   The bands, and the evidence for each:
     1        singular            نقطة
     2–10     plural              ١٠ نقاط  ·  ٨ زيارات  ·  ٢ فروع
     11+      singular            ٣٠ نقطة  ·  ٢٣٠ نقطة
     0        plural              ما عندك حتى نقطة is a sentence, not a count

   Two is written as numeral + plural («2 فروع») rather than as the dual
   («فرعين») on purpose: the dual carries the "two" inside the word, so a digit
   in front of it says two twice. Spoken, a Tunisian says زوز فروع; written
   next to a figure the app has to render, 2 فروع is what reads correctly. */

type Unit = "point" | "visite" | "récompense" | "boutique" | "code" | "carte";

const FR_PLURAL: Record<Unit, [one: string, many: string]> = {
  point: ["point", "points"],
  visite: ["visite", "visites"],
  récompense: ["récompense", "récompenses"],
  boutique: ["boutique", "boutiques"],
  code: ["code", "codes"],
  carte: ["carte", "cartes"],
};

/** [singular, plural] — the plural is the 2–10 form, the singular covers 11+. */
const TN_PLURAL: Record<Unit, [one: string, many: string]> = {
  point: ["نقطة", "نقاط"],
  visite: ["زيارة", "زيارات"],
  récompense: ["هدية", "هدايا"],
  boutique: ["فرع", "فروع"],
  code: ["كود", "كودات"],
  carte: ["كارت", "كوارط"],
};

/** Just the noun, agreeing with `count` — "نقطة", "نقاط", "point", "points". */
function unitWord(lang: Lang, count: number, unit: Unit): string {
  const n = Math.abs(Math.round(count));
  const [one, many] = (lang === "fr" ? FR_PLURAL : TN_PLURAL)[unit];
  if (lang === "fr") return n >= 2 ? many : one;
  /* 2–10 take the plural; 1 and 11-and-up take the singular; 0 reads as a
     plural ("ما عندك حتى نقاط" is what a person says about none). */
  return n === 0 || (n >= 2 && n <= 10) ? many : one;
}

/** "30 نقطة", "10 نقاط", "3 points", "1 point". The number is never dropped. */
function counted(lang: Lang, count: number, unit: Unit): string {
  return `${count} ${unitWord(lang, count, unit)}`;
}

/**
 * The strings.
 *
 * FRENCH IS THE KEY. Not `card.title` — the French sentence itself, because a
 * key is one more thing to keep in step with the screen and this way a missing
 * translation degrades to the sentence that was already there rather than to
 * "card.title" in front of a customer.
 *
 * A key containing {braces} is a template: the caller passes the values and the
 * two languages are free to put them in different places. See counted() above
 * for why that freedom is not optional.
 *
 * Only the CUSTOMER app is here. The owner app and the console are one person's
 * back office, in one language, and translating them would double the surface
 * for no reader.
 */
const TN: Record<string, string> = {
  /* ── navigation ── */
  "Ma carte": "الكارت متاعي",
  "Récompenses": "الهدايا",
  "Mon activité": "الحركات متاعي",
  "Mon profil": "حسابي",
  "Mes cartes": "الكوارط متاعي",
  "Mon code": "الكود متاعي",
  "Historique": "الحركات",
  "Profil": "الحساب",
  "Mes codes": "الكودات متاعي",

  /* ── the card ── */
  "Mon code client": "الكود متاعي",
  "Ma carte de fidélité": "كارت الفيداليتي متاعي",
  "Le serveur le scanne — pas besoin de ton numéro.":
    "الڨارسون يسكانيه، ما تحتاجش تعطيه نمرة تليفونك.",
  "À gagner ici": "شنوّة تنجم تاخذ من هوني",
  "Tout voir": "شوف الكل",
  "points, visites, récompenses": "النقاط، الزيارات والهدايا",
  /* The nudge — the sentence the whole card is built around. {n} arrives from
     t.n() already carrying its unit, so this reads «باقيلك 30 نقطة باش تاخذ
     أتاي بالنعناع». */
  "Encore {n} pour {reward}": "باقيلك {n} باش تاخذ {reward}",
  "Tu peux prendre n'importe quelle récompense ici.": "تنجّم تاخذ أيّ هديّة هوني.",
  "Tu as assez de points — choisis la tienne.": "عندك نقاط تكفي — اختار اللي تحبّ.",
  "à prendre": "تنجّم تاخذها",
  "{n} à récupérer": "{n} تستنّاك",
  "{n} à ta portée": "{n} في متناولك",
  "Montre le QR au comptoir — c'est déjà payé.": "ورّي الكود في الكونتوار — مخلّص من قبل.",
  "{n} · mes points": "{n} · النقاط متاعي",
  /* the earning rate, phrased from the dinar the customer is about to hand over */
  "Cumule des points à chaque achat": "تجمّع نقاط في كلّ شرا",
  "1 dinar dépensé = {n}": "الدينار الواحد = {n}",
  "{d} dinars dépensés = 1 point": "{d} دنانير = نقطة",

  /* ── the stamp card ── */
  "Encore {n} pour {reward}.": "باقيلك {n} باش تاخذ {reward}.",
  "{reward} t'attend 🎉": "{reward} تستنّاك 🎉",

  /* ── rewards ── */
  "Choisis ta récompense": "اختار هديّتك",
  "Échange tes points contre du réel, chez {shop}.": "بدّل النقاط متاعك بهدايا عند {shop}.",
  "{n} disponibles": "{n} عندك",
  "Pas encore d'offres": "ما فمّاش هدايا توّا",
  "Continue de cumuler des points — {shop} en prépare.":
    "كمّل جمّع في النقاط — {shop} تحضّر فيهم.",
  "Choisis une récompense": "اختار هديّة",
  "Échanger {n}": "بدّل {n}",
  "Encore {n}": "باقيلك {n}",
  "Confirmer": "أكّد",
  "Échanger {n} contre {reward} ?": "تبدّل {n} بـ{reward}؟",
  "Les points sont débités tout de suite. Le code, lui, n'expire jamais.":
    "النقاط تتنقّص توّا. أمّا الكود ما يفوتش وقتو.",
  "Annuler": "خلّي",
  "Oui, échanger": "إيه، بدّل",
  "Confirmer l'échange": "أكّد التبديل",
  "Récompense réservée": "الهديّة محجوزة",
  "Fais scanner ça :": "خلّيهم يسكانيو هذا:",
  "Le serveur scanne le QR — ou tape le code.": "الڨارسون يسكاني الكود — ولا يكتبو بيدو.",
  "Pas de date limite": "ما فمّاش وقت آخر",
  "Échanger autre chose": "بدّل حاجة أخرى",
  "Récompense débloquée !": "هديّة جديدة تفتحت!",
  "Félicitations !": "مبروك عليك!",
  "Tu as gagné": "ربحت",
  "Voir mes récompenses": "شوف الهدايا متاعي",
  "Plus tard": "من بعد",

  /* ── the codes waiting to be collected ── */
  "Fais scanner le QR au comptoir — rien à dicter.":
    "خلّيهم يسكانيو الكود في الكونتوار — ما تحتاجش تقرا حتى حاجة.",
  "Aucun code en attente": "ما فمّاش كود يستنّى",
  "Échange tes points dans les Récompenses — le code apparaîtra ici.":
    "بدّل النقاط متاعك في الهدايا — الكود باش يبان هوني.",
  "À scanner au comptoir": "باش يتسكانى في الكونتوار",
  "Ou dicte le code — les deux marchent.": "ولا اقرا الكود بصوتك — الزوز يمشيو.",

  /* ── coming back ── */
  "Bon retour": "مرحبا بيك من جديد",
  "Ton code secret": "الكود السرّي متاعك",
  "Rouvrir ma carte": "افتح الكارت متاعي",
  "Ce n'est pas moi — utiliser un autre numéro": "موش أنا — نحبّ نستعمل نمرة أخرى",
  "Numéro de téléphone": "نمرة التيليفون",
  "Ton numéro": "نمرة تليفونك",
  "Ton prénom": "إسمك",
  "Nouveau compte": "حساب جديد",
  "J'ai déjà un compte": "عندي حساب",
  "Créer mon compte": "اعمل حسابي",
  "Un seul compte.": "حساب واحد برك.",
  "Code secret à 4 chiffres": "كود سرّي بـ4 أرقام",
  "politique de confidentialité": "سياسة الخصوصية",
  "Ta carte de fidélité": "كارت الفيداليتي متاعك",
  "Création de ton compte": "نعملو حسابك",
  "Programme de fidélité": "برنامج الفيداليتي",
  "Scannez, cumulez des points à chaque passage et échangez-les contre des récompenses.":
    "اسكاني، جمّع نقاط في كلّ مرّة تجي، وبدّلهم بهدايا.",
  "Sans application, sans e-mail — juste votre numéro.":
    "من غير أبليكاسيون ومن غير إيميل — نمرتك برك.",

  /* ── the card arriving ── */
  "Carte de fidélité": "كارت فيداليتي",
  "Ta carte est prête": "الكارت متاعك حاضر",
  "Touche pour continuer": "أنقر باش تكمّل",
  "{n} pour commencer. Montre ton code au comptoir à chaque achat.":
    "{n} باش تبدا. ورّي الكود متاعك في الكونتوار في كلّ شرا.",
  "Montre ton code au comptoir à chaque achat.":
    "ورّي الكود متاعك في الكونتوار في كلّ شرا.",

  /* ── activity ── */
  "Achat": "شرا",
  "Bienvenue": "مرحبا",
  "Récupéré": "تاخذات",
  "Correction": "تصحيح",
  "Total gagné": "الجملة اللي ربحتها",
  "Rien pour l'instant": "ما فمّا حتّى حاجة توّا",

  /* ── profile ── */
  "Se déconnecter": "اخرج",
  "Mon code en grand": "الكود متاعي بالكبير",
  "Langue": "اللغة",
  "Français": "بالفرنسية",
  "Tunisien": "بالتونسي",
  "Le même dans tous les commerces Pointili. Donne-le au comptoir si le QR ne passe pas.":
    "نفس الكود في كلّ المحلات اللي تخدم بـPointili. أعطيه في الكونتوار كان الاسكان ما مشاش.",
  "À montrer de loin, à travers un comptoir.": "باش يتقرا من بعيد، من ورا الكونتوار.",
  "Membre": "عضو",
  "Changer de compte": "بدّل الحساب",
  "Tes points restent liés à ton numéro — tu les retrouves en te reconnectant.":
    "النقاط متاعك مربوطة بنمرتك — تلقاهم كيف ترجع تدخل.",

  /* ── the wallet ── */
  "À récupérer": "تستنّاك",
  "Tes points te suivent partout. Entre ton numéro et ton code secret pour les retrouver.":
    "النقاط متاعك تمشي معاك في كلّ بلاصة. حطّ نمرتك والكود السرّي متاعك باش تلقاهم.",
  "Pas encore de carte ?": "ما عندكش كارت توّا؟",
  "Scanne le QR posé au comptoir de ton commerce. C'est gratuit, sans application, et tes points démarrent tout de suite.":
    "اسكاني الكود اللي في الكونتوار متاع المحلّ. بلاش، من غير أبليكاسيون، والنقاط متاعك تبدا توّا.",
  "Voir mes cartes ✦": "شوف الكوارط متاعي ✦",
  "Vous êtes commerçant ?": "إنت صاحب محلّ؟",
  "Espace café": "فضاء المحلّ",

  /* ── the shop is closed ── */
  "Momentanément fermé": "مسكّر شويّة",
  "La carte de fidélité de cette boutique est en pause. Tes points sont conservés — repasse bientôt.":
    "كارت الفيداليتي متاع هذا المحلّ محبوسة شويّة. النقاط متاعك محفوظة — إرجع قريب.",
  "Voir mes autres cartes": "شوف الكوارط الأخرى متاعي",

  /* ── errors ── */
  "Un petit souci": "فمّا مشكل صغير",
  "Impossible d'afficher ta carte pour l'instant. Tes points sont bien là — réessaie.":
    "ما نجّمناش نوريو الكارت متاعك توّا. النقاط متاعك موجودة — عاود جرّب.",

  /* ── the scanner and the camera ── */
  "Le serveur scanne ce QR (ou saisis le code) — pas besoin de donner ton numéro.":
    "الڨارسون يسكاني هذا الكود (ولا يكتبو) — ما تحتاجش تعطي نمرتك.",
  "Changer de caméra": "بدّل الكاميرا",

  /* ── the wheel ── */
  "La roue": "الروة",
  "Roue des prix": "روة الجوائز",
  "La roue tourne…": "الروة تدور…",
  "Fais scanner ça au comptoir": "خلّيهم يسكانيوه في الكونتوار",
  "Code à présenter": "الكود اللي توّريه",
  "Impossible de jouer": "ما تنجّمش تلعب",
  "— Retente ta chance bientôt —": "— جرّب حظّك مرّة أخرى —",
  "— Merci de votre visite —": "— يعيشك على الزيارة —",

  /* ── installing ── */
  "Ajouter à l'écran d'accueil": "زيدها في الإيكران متاعك",
  "Sur iPhone, c'est Safari qui installe — en trois gestes.":
    "في الآيفون، Safari هو اللي ينزّلها — في ثلاث حركات.",

  /* ── what kind of shop this is ─────────────────────────────────────────
     The line under the shop's name on every card (lib/businessTypes.ts). The
     French label is the key, so a new category translates by being added here
     and shows its French name until it is.

     Several of these are the Tunisian word rather than the Arabic one, which
     is the whole point of this file: a barber is a حجّام, a corner grocer is an
     عطّار, and a chemist is a فارماسي — nobody in Tunis asks for a صيدلية. */
  "Café": "مقهى",
  "Restaurant": "ريستوران",
  "Fast-food": "فاست فود",
  "Pâtisserie": "حلويات",
  "Boulangerie": "مخبزة",
  "Salon de thé": "صالون تاي",
  "Bar": "بار",
  "Glacier": "آيس كريم",
  "Jus & smoothies": "عصير وسموذي",
  "Pizzeria": "بيتزيريا",
  "Épicerie": "عطّار",
  "Boutique": "بوتيك",
  "Mode & vêtements": "حوايج ومودة",
  "Beauté & cosmétiques": "تجميل ومكياج",
  "Coiffure": "كوافير",
  "Barbier": "حجّام",
  "Salle de sport": "صالة سبور",
  "Librairie": "مكتبة",
  "Fleuriste": "فلوريست",
  "Pharmacie": "فارماسي",
  "Épicerie fine": "عطّار فاخر",
  "Traiteur": "طرايتور",
  "Autre": "أخرى",

  /* ── the shop's own words, when it uses ours ────────────────────────────
     These are DATA, not chrome: a reward is whatever the owner typed. Most
     Tunisian cafés keep the suggestions the app offers them (lib/rewards.ts),
     so translating those exact strings covers most cards — and anything a shop
     wrote itself falls through to its own words, which is correct. */
  /* café · salon de thé · pâtisserie · boulangerie */
  "Café offert": "قهوة هدية",
  "Espresso offert": "إكسبرسو هدية",
  "Cappuccino offert": "كابوتشينو هدية",
  "Thé à la menthe": "أتاي بالنعناع",
  "Croissant offert": "كرواصة هدية",
  "Pâtisserie du jour": "حلو اليوم",
  "Pâtisserie offerte": "حلو هدية",
  "Part de gâteau": "قطعة ڨاتو",
  "Baguette offerte": "باڨيت هدية",
  "Viennoiserie offerte": "فيينوازري هدية",
  "Brunch complet": "برونش كامل",

  /* restaurant · fast-food · pizzeria · traiteur */
  "Dessert offert": "ديسير هدية",
  "Entrée offerte": "أونتري هدية",
  "Menu offert": "مينيو هدية",
  "Frites offertes": "فريت هدية",
  "Boisson offerte": "مشروب هدية",
  "Pizza offerte": "بيتزا هدية",
  "Sandwich offert": "كاسكروت هدية",
  "Plat offert": "طبق هدية",
  "-20% sur la commande": "تنقيص 20% على الكوموند",

  /* glacier · jus · bar */
  "Boule offerte": "بولة آيس كريم هدية",
  "Topping offert": "توپينڨ هدية",
  "Jus offert": "عصير هدية",
  "Jus frais offert": "عصير فريش هدية",
  "Smoothie offert": "سموذي هدية",
  "Supplément offert": "زيادة هدية",
  "Planche offerte": "بلانش هدية",
  "Cocktail offert": "كوكتيل هدية",

  /* coiffure · barbier · beauté */
  "Brushing offert": "بروشينڨ هدية",
  "Soin offert": "سوان هدية",
  "Taille de barbe offerte": "تعديل اللحية هدية",
  "Échantillon offert": "عيّنة هدية",
  "-20% sur la coupe": "تنقيص 20% على القصّة",
  "-20% sur un produit": "تنقيص 20% على منتج",
  /*
    "Coupe offerte" IS DELIBERATELY ABSENT, and that is the one case where a
    French sentence being the key stops working.

    It is suggested to BARBERS (a haircut) and to GLACIERS (a cup of ice
    cream), and the two have no shared Tunisian word. Guessing means telling
    an ice-cream shop's customer they have won قصّة هدية — a free haircut —
    which is a worse outcome than leaving the shop's own French on screen.
    Translating it needs the business type at the call site, which no screen
    passes today; until one does, this stays untranslated on purpose.
  */

  /* sport · mode · librairie · fleuriste · épicerie · boutique · pharmacie */
  "Séance offerte": "حصّة هدية",
  "1 mois -20%": "شهر بتنقيص 20%",
  "Accessoire offert": "أكسسوار هدية",
  "Retouche offerte": "تعديل هدية",
  "-20% sur un article": "تنقيص 20% على سلعة",
  "Article offert": "سلعة هدية",
  "Livre de poche offert": "كتاب هدية",
  "Marque-page offert": "فاصل كتاب هدية",
  "-20% sur un livre": "تنقيص 20% على كتاب",
  "Bouquet offert": "بوكي ورد هدية",
  "Fleur offerte": "وردة هدية",
  "-20% sur un bouquet": "تنقيص 20% على بوكي",
  "Produit offert": "منتج هدية",
  "Un produit offert": "منتج هدية",
  "Dégustation offerte": "تذوّق هدية",
  "-20% sur le panier": "تنقيص 20% على القفّة",
  "Cadeau surprise": "هدية مفاجأة",
  "-20% sur la prochaine visite": "تنقيص 20% في الزيارة الجاية",
  "Livraison offerte": "التوصيل بلاش",
  "-10% sur l'addition": "تنقيص 10% على الحساب",
  "-20% sur l'addition": "تنقيص 20% على الحساب",
};

/** Anything a caller drops into a {slot}. */
type Vars = Record<string, string | number>;

/**
 * Split a template into literal text and named slots.
 *
 * WHY THE DICTIONARY CONTAINS NO MARKUP. Half of these sentences bold their
 * number — «Encore **30 points** pour X» — and the two obvious ways to keep
 * that are both bad: putting <b> inside the dictionary makes a translator edit
 * HTML, and dropping the bold makes the one figure on the screen disappear
 * into the sentence.
 *
 * So the template stays plain text and the CALLER decides what a slot renders
 * as. Arabic puts {n} in a different place from French; neither language has
 * to care what the other wraps it in. See components/Tpl.
 */
export function parts(tpl: string): { text: string; slot?: string }[] {
  const out: { text: string; slot?: string }[] = [];
  const re = /\{(\w+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl))) {
    if (m.index > last) out.push({ text: tpl.slice(last, m.index) });
    out.push({ text: m[0], slot: m[1] });
    last = m.index + m[0].length;
  }
  if (last < tpl.length) out.push({ text: tpl.slice(last) });
  return out;
}

export type T = ((fr: string, vars?: Vars) => string) & {
  /** A number with its unit, agreeing correctly in both languages. */
  n: (count: number, unit: Unit) => string;
  /**
   * The unit WORD on its own, still agreeing with the count.
   *
   * For the one place the figure is not a string: the card's balance is drawn
   * by <CountUp>, which animates from the old number to the new one, so the
   * number and its noun are two elements at two sizes. The noun still has to
   * know what it is counting — a 118-point balance reads نقطة and a 5-point
   * one reads نقاط.
   */
  unit: (count: number, unit: Unit) => string;
  /** Which language this translator speaks — for the rare branch that needs it. */
  lang: Lang;
};

/**
 * Translate one sentence. `t("Ma carte")` in French returns "Ma carte".
 *
 * A missing Tunisian string falls back to the French, deliberately and
 * silently: a half-translated screen is a working screen, and a screen full of
 * missing-key markers is not.
 */
export function translator(lang: Lang): T {
  const t = ((fr: string, vars?: Vars): string => {
    let s = lang === "tn" ? (TN[fr] ?? fr) : fr;
    if (vars) {
      for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
    }
    return s;
  }) as T;
  t.n = (count: number, unit: Unit) => counted(lang, count, unit);
  t.unit = (count: number, unit: Unit) => unitWord(lang, count, unit);
  t.lang = lang;
  return t;
}
