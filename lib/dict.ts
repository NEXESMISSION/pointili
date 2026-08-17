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
 * ── FRENCH WORDS STAY IN FRENCH, IN LATIN LETTERS ─────────────────────────
 *
 * This is how the language is actually written here, and the landing page was
 * rewritten by the owner to match: application, commission, écran, engagement,
 * connecté, caisse, virement, Statistiques, Programme fidélité. Transliterating
 * them into Arabic script — أبليكاسيون, كوميسيون — is a translator's instinct
 * and it reads as a foreigner's guess at derja. A Tunisian writing to another
 * Tunisian types the French word.
 *
 * The test is whether the word arrived in Tunisia in French: قهوة and كارت are
 * Arabic here and stay Arabic; commission and application never were.
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

/* The one way a points figure is written — see counted() below for why this
   file, of all files, has to go through it. points.ts imports nothing, so
   there is no cycle. */
import { fmtPoints } from "./points";

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

type Unit =
  | "point"
  | "visite"
  | "récompense"
  | "boutique"
  | "code"
  | "carte"
  | "minute"
  | "heure"
  | "jour";

const FR_PLURAL: Record<Unit, [one: string, many: string]> = {
  point: ["point", "points"],
  visite: ["visite", "visites"],
  récompense: ["récompense", "récompenses"],
  boutique: ["boutique", "boutiques"],
  code: ["code", "codes"],
  carte: ["carte", "cartes"],
  minute: ["min", "min"],
  heure: ["h", "h"],
  jour: ["j", "j"],
};

/** [singular, plural] — the plural is the 2–10 form, the singular covers 11+. */
const TN_PLURAL: Record<Unit, [one: string, many: string]> = {
  point: ["نقطة", "نقاط"],
  visite: ["زيارة", "زيارات"],
  récompense: ["هدية", "هدايا"],
  boutique: ["فرع", "فروع"],
  code: ["كود", "كودات"],
  carte: ["كارت", "كوارط"],
  minute: ["دقيقة", "دقايق"],
  heure: ["ساعة", "سوايع"],
  jour: ["نهار", "أيام"],
};

/*
  THE MONTHS, AND WHY Intl IS WRONG HERE.

  `new Date(iso).toLocaleDateString("ar-TN", { month: "long" })` returns the
  Modern Standard Arabic names — أغسطس, يناير, فبراير — which is the one thing
  this whole file exists to avoid. Tunisia uses the French-derived set, and a
  Tunisian reading أغسطس over their own history has the same reaction as
  reading رصيدك من النقاط: correct Arabic, wrong country.

  Hardcoded rather than fetched from a locale, because there is no locale that
  produces these: ar-TN in ICU gives the MSA list. This IS the data.
*/
const TN_MONTHS = [
  "جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان",
  "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/**
 * The shops are in Tunisia, so the months are Tunisia's.
 *
 * This read getMonth()/getFullYear(), which are the SERVER's local time, and
 * the server is UTC. Tunisia is UTC+1 all year (no daylight saving), so every
 * purchase between midnight and 1am local fell into the previous day — and on
 * the first of the month, into the previous MONTH. A coffee bought just after
 * midnight on 1 August appeared under "Juillet", below every July row, which
 * to the customer is simply a purchase that went missing from this month.
 *
 * Africa/Tunis by name rather than a +1 offset: a fixed offset is a bet that
 * the country never adopts DST again, and Tunisia has done exactly that before.
 */
const TZ = "Africa/Tunis";

export function monthYear(lang: Lang, iso: string): string {
  const d = new Date(iso);
  if (lang === "tn") {
    /* The parts, in Tunis — not the server's idea of what month it is. */
    const p = new Intl.DateTimeFormat("en", {
      timeZone: TZ,
      month: "numeric",
      year: "numeric",
    }).formatToParts(d);
    const month = Number(p.find((x) => x.type === "month")?.value ?? "1");
    const year = p.find((x) => x.type === "year")?.value ?? "";
    return `${TN_MONTHS[month - 1]} ${year}`;
  }
  const s = d.toLocaleDateString("fr-FR", { timeZone: TZ, month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
  /*
    fmtPoints, not `${count}`.

    This interpolated the raw JavaScript number, and every counted phrase in the
    customer app comes through here — the card's nudge, the history total, the
    wallet, the redeem confirmation. Points have been numeric(12,2) since 0027,
    so the values arriving are genuinely fractional AND they are arrived at by
    subtraction in JS: a reward priced 20 against a balance of 2,01 gives
    17.990000000000002, and the card printed exactly that.

    It was wrong twice over even when the float was clean. `${12.5}` writes
    "12.5", and a French or Tunisian reader parses a dot as a THOUSANDS
    separator — so a 12,5-point balance read as 125. One sheet showed both
    spellings at once: RewardPicker prints fmtPoints(balance) and, four lines
    below, this function's "12.5 points".

    lib/points.ts was written for exactly this ("or 0.7500000000000001 if
    anything ever touches a float" … "the comma is not decoration") and this
    was the one path around it.

    unitWord already rounds for agreement, so the NOUN was always right; only
    the numeral was raw. Counts that are whole — visits, stamps, shops — come
    back out of fmtPoints unchanged.
  */
  return `${fmtPoints(count)} ${unitWord(lang, count, unit)}`;
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
  "Fermer": "سكّر",

  /* ── the codes waiting to be collected ── */
  "Fais scanner le QR au comptoir — rien à dicter.":
    "خلّيهم يسكانيو الكود في الكونتوار — ما تحتاجش تقرا حتى حاجة.",
  "Aucun code en attente": "ما فمّاش كود يستنّى",
  "Échange tes points dans les Récompenses — le code apparaîtra ici.":
    "بدّل النقاط متاعك في الهدايا — الكود باش يبان هوني.",
  "À scanner au comptoir": "باش يتسكانى في الكونتوار",
  /* what a pending code IS — the header on each ticket */
  "Gain": "ربحة",
  "Carte pleine": "كارت كامل",
  "Récompense": "هديّة",
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
  "{n} offerts à l'inscription": "{n} هدية كي تسجّل",
  " · ils n'expirent jamais": " · وما يفوتش وقتهم",
  "Utilisable {partout}.": "تخدم {partout}.",
  "partout": "في كل بلاصة",
  "Choisis un code secret": "اختار كود سرّي",
  "Cacher": "خبّي",
  "Voir": "شوف",
  "Le code que tu as choisi en créant ton compte. Oublié ? Demande au comptoir.":
    "الكود اللي اخترتو كي عملت حسابك. نسيتو؟ اسأل في الكونتوار.",
  "Garde-le : c'est lui qui te rendra tes cartes sur un autre téléphone. Oublié ? Le commerce peut le réinitialiser.":
    "احفظو: هو اللي يرجّعلك الكوارط متاعك في تليفون آخر. نسيتو؟ المحلّ ينجّم يبدّلو.",
  "(optionnel)": "(كيف ما تحبّ)",
  "Retrouver mes cartes": "لقّيني الكوارط متاعي",
  "En continuant, tu acceptes nos {conditions} et notre {confidentialite}.":
    "كي تكمّل، إنت موافق على {conditions} و{confidentialite} متاعنا.",
  "conditions": "الشروط",
  "Bon retour, {name}": "مرحبا بيك من جديد يا {name}",
  "Ta carte {shop} t'attend avec {n}. Entre ton code secret pour la rouvrir.":
    "الكارت متاعك في {shop} تستنّاك بـ{n}. حطّ الكود السرّي متاعك باش تفتحها.",
  "Ta carte {shop} est toujours là. Entre ton code secret pour la rouvrir.":
    "الكارت متاعك في {shop} مازالت هوني. حطّ الكود السرّي متاعك باش تفتحها.",

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
  "Échange": "تبديل",
  "Récupéré": "تاخذات",
  "Correction": "تصحيح",
  "Expiration": "فات وقتها",
  "Roue": "روة",
  "Total gagné": "الجملة اللي ربحتها",
  "Rien pour l'instant": "ما فمّا حتّى حاجة توّا",
  /* "Historique" is up in the navigation block — one key, one entry. */
  "{n} gagnés chez {shop}.": "ربحت {n} عند {shop}.",
  "Ta prochaine visite chez {shop} apparaîtra ici.":
    "الزيارة الجاية متاعك عند {shop} باش تبان هوني.",
  "Fais scanner le QR au comptoir.": "خلّيهم يسكانيو الكود في الكونتوار.",
  "Achat · {tnd}": "شرا · {tnd}",
  "Récupéré · {label}": "تاخذات · {label}",
  "✓ pris": "✓ تاخذات",
  /* elapsed time, the way it is said rather than the way a date is written */
  "à l'instant": "توّا",
  "il y a {n}": "قبل {n}",
  "hier": "البارح",

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
  "Toutes": "الكل",
  "Presque": "قريب",
  "Aucune boutique ne correspond.": "ما فمّاش فرع يجي مع هذا.",
  "Rien à récupérer pour le moment.": "ما فمّا حتّى حاجة تستنّاك توّا.",
  "Aucune carte proche de sa récompense.": "ما فمّاش كارت قريبة من الهديّة متاعها.",
  "Scanne le QR d'un commerce pour ajouter ta première carte.":
    "اسكاني الكود متاع محلّ باش تزيد أوّل كارت متاعك.",
  "Espace boutique": "فضاء المحلّ",
  "{n} tampons": "{n} طوابع",
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
  "Réessayer": "عاود جرّب",
  "Impossible d'afficher ta carte pour l'instant. Tes points sont bien là — réessaie.":
    "ما نجّمناش نوريو الكارت متاعك توّا. النقاط متاعك موجودة — عاود جرّب.",

  /* ── the scanner and the camera ── */
  "Le serveur scanne ce QR (ou saisis le code) — pas besoin de donner ton numéro.":
    "الڨارسون يسكاني هذا الكود (ولا يكتبو) — ما تحتاجش تعطي نمرتك.",
  "Changer de caméra": "بدّل الكاميرا",
  "Solde actuel": "الرصيد متاعك توّا",

  /* ── the wheel ── */
  "La roue": "الروة",
  "La roue tourne…": "الروة تدور…",
  "Fais scanner ça au comptoir": "خلّيهم يسكانيوه في الكونتوار",
  "La roue — {n} le tour": "الروة — {n} الدورة",
  "{n} le tour. Tout le monde repart avec quelque chose.":
    "{n} الدورة. الكلّ يخرج بحاجة.",
  "Un tour offert. Tout le monde repart avec quelque chose.":
    "دورة هدية. الكلّ يخرج بحاجة.",
  "Dépenser {n} pour un tour ?": "تصرف {n} على دورة؟",
  "Il te restera {n}. Tout le monde repart avec quelque chose.":
    "باش يبقالك {n}. الكلّ يخرج بحاجة.",
  "Oui, tourner": "إيه، دوّر",
  "Tourner · {n}": "دوّر · {n}",
  "Il te faut {n}": "تلزمك {n}",
  "Pas de date limite · il te reste {n}": "ما فمّاش وقت آخر · باقيلك {n}",

  /* ── installing ── */
  "Ajouter": "زيدها",
  "Comment ?": "كيفاش؟",
  "Masquer": "خبّي",
  "C'est fait": "سالينا",
  "« {what} » — sans store, sans installation":
    "«{what}» — من غير ستور ومن غير تنزيل",
  "Touche le bouton Partager": "أنقر على زرّ Partager",
  "en bas de Safari — le carré avec une flèche vers le haut.":
    "في لوطا في Safari — المربّع بالسهم اللي طالع.",
  "Fais défiler et choisis « Sur l'écran d'accueil »":
    "نزّل واختار «Sur l'écran d'accueil»",
  "dans la liste des options.": "في القائمة متاع الخيارات.",
  "Touche « Ajouter »": "أنقر على «Ajouter»",
  "en haut à droite. L'icône Pointili apparaît avec tes autres apps.":
    "في الفوق على اليمين. إيقونة Pointili باش تبان مع الأبليكاسيونات الأخرى متاعك.",
  "Si tu ne vois pas « Sur l'écran d'accueil », ouvre cette page dans Safari : Chrome et les autres navigateurs iOS ne peuvent pas installer.":
    "كان ما تشوفش «Sur l'écran d'accueil»، افتح هذي الصفحة في Safari: Chrome والنافيڨاتورات الأخرى في الآيفون ما ينجّموش ينزّلوها.",

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
    "Coupe de cheveux offerte" and "Coupe de glace offerte" — never a bare
    "Coupe offerte", which lib/rewards.ts used to suggest to barbers AND to
    glaciers. One French string, two unrelated things, and no shared Tunisian
    word: translating it would have told an ice-cream customer they had won a
    free haircut. Fixed by naming the thing in the suggestion rather than by
    teaching this file what kind of shop it is translating for — see the note
    beside `barbier` in lib/rewards.ts.
  */
  "Coupe de cheveux offerte": "قصّة هدية",
  "Coupe de glace offerte": "كوب آيس كريم هدية",

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
  /* The DEFAULT stamp reward — migration 0011's column default, and what
     lib/data falls back to. Every shop that has switched stamps on without
     naming the prize shows this on its card, so it is the most-rendered
     reward string in the product and it was the last one still in French. */
  "Une récompense offerte": "هديّة",
  "Livraison offerte": "التوصيل بلاش",
  "-10% sur l'addition": "تنقيص 10% على الحساب",
  "-20% sur l'addition": "تنقيص 20% على الحساب",

  /* ── the landing page ─────────────────────────────────────────────────
     The public site, which spoke only French until now. Same rules as
     everything above: derja, not fusha, and the vocabulary this file
     already committed to — كارت, زيارة, هدية, الڨارسون, الكونتوار.

     The audience is different, though, and the register follows it: every
     screen above talks to a CUSTOMER holding a card, and this talks to the
     shop OWNER deciding whether to buy. Second person either way, but this
     one is a rep across a counter, not an app in a pocket. ── */
  "Une carte de fidélité, tous vos commerces": "كارت فيداليتي وحدة، في كلّ المحلات اللي تمشيلهم",
  "Pointili est un programme de fidélité pour cafés, restaurants et commerces en Tunisie. Vos clients scannent un QR code, ouvrent une carte dans leur navigateur — sans application — cumulent des points à chaque achat et les échangent contre vos récompenses. 120 TND par an, 14 jours d'essai gratuit, sans carte bancaire.": "Pointili برنامج فيداليتي للمقاهي والريستورانات والمحلات في تونس. الحرفاء متاعك يسكانيو كود QR، تتحلّ كارت في النافيڨاتور متاعهم — من غير أبليكاسيون — يجمّعو نقاط في كلّ شرا ويبدّلوهم بالهدايا متاعك. 120 دينار في العام، 14 نهار تجريب بلاش، من غير كارت بنكية.",
  "Cafés": "مقاهي",
  "Restaurants": "ريستورانات",
  "Barbiers": "حجّامة",
  "Boutiques": "بوتيكات",
  "Salons": "كوافيرات",
  "Il donne son numéro": "يعطيك نمرتو",
  "Pas de carte à sortir, rien à ouvrir. Huit chiffres — ou son code à quatre caractères, s'il l'a devant lui.": "ما فمّاش كارت باش يخرّجها، وما فمّا حتّى حاجة تتحلّ. ثمنية أرقام — ولا الكود متاعو بأربع حروف، كان يكون قدّامو.",
  "Vous tapez des dinars": "تكتب دنانير",
  "Le montant de l'addition, comme sur votre calculette. Jamais des points : vous n'avez rien à convertir.": "مبلغ الحساب، كيما في الكالكولاتريس متاعك. عمرك ما تحطّ نقاط: ما عندك حتّى حاجة تحوّلها.",
  "Le serveur compte": "السيرفور هو اللي يحسب",
  "Le calcul se fait chez nous, à votre taux. Personne au comptoir n'invente un solde, et personne ne peut le corriger en douce.": "الحساب يتعمل عندنا، على النسبة اللي حطّيتها. حتّى حدّ في الكونتوار ما يخترع رصيد، وحتّى حدّ ما ينجّم يبدّلو في السرّ.",
  "Vous scannez le QR": "تسكاني الكود",
  "Celui qui est posé sur la table ou collé à la caisse. Votre carte s'ouvre dans le navigateur.": "اللي محطوط على الطاولة ولا ملصوق في الكاس. الكارت متاعك تتحلّ في النافيڨاتور.",
  "Un numéro, un code secret": "نمرة وكود سرّي",
  "Pas d'e-mail, pas de mot de passe à retenir, rien à télécharger. Le bonus de bienvenue arrive tout de suite.": "لا إيميل، لا موديباس تحفظو، وما تنزّل حتّى حاجة. نقاط الترحيب تجيك توّا.",
  "Vos points vous attendent": "النقاط متاعك تستنّاك",
  "Une carte par commerce, toutes dans le même téléphone. Ils n'expirent pas.": "كارت لكلّ محلّ، والكلّ في نفس التليفون. وما يفوتش وقتهم.",
  "Taux de retour": "نسبة الرجوع",
  "La part de vos clients qui sont revenus. Sur 7 jours, 30 jours, ou depuis le début — avec l'écart par rapport à la période d'avant.": "قدّاش بالمية من حرفاءك رجعولك. على 7 أيام، 30 نهار، ولا من البداية — ومعاها قدّاش تبدّلت على الفترة اللي قبلها.",
  "Visites": "الزيارات",
  "Combien de passages ce mois-ci, et combien de clients différents les ont faits.": "قدّاش من زيارة صارت هذا الشهر، وقدّاش من حريف مختلف جا.",
  "Nouveaux clients": "حرفاء جدد",
  "Combien de cartes créées, et à quel rythme elles arrivent.": "قدّاش من كارت جديدة تعملت، وبأيّ سرعة قاعدين يجيو.",
  "Récompenses utilisées": "الهدايا اللي تاخذات",
  "Laquelle marche vraiment, et laquelle dort depuis trois mois.": "أنهي وحدة ماشية بالحقّ، وأنهي وحدة راقدة من ثلاثة شهور.",
  "Programme fidélité": "Programme fidélité",
  "QR Code illimité": "QR Code من غير limite",
  "Carte à vos couleurs": "كارت على كيفك",
  "Français et tunisien": "بالفرنسي وبالتونسي",
  "Analyses et statistiques": "Statistiques وتحاليل",
  "Support en Tunisie": "Support من تونس",
  "Aller à ma caisse": "إمشي للcaisse متاعك",
  "Vous êtes déjà connecté": "إنت connecté من قبل؟",
  "Commencer gratuitement": "ابدا بلاش",
  "14 jours gratuits · Sans carte bancaire": "14 نهار بلاش · من غير كارت بنكية",
  "Ma caisse": "الكاس متاعي",
  "Fait en Tunisie, pour la Tunisie": "مصنوع في تونس، للتوانسة",
  "Vos habitués reviennent.": "حرفاك يرجعولك.",
  /* The hero photograph's alt text — the largest image on the site, and it was
     the one string on this page a screen reader still heard in French. */
  "La carte de fidélité Pointili sur un téléphone : Yassine a 118 points chez Café El Manar, son code client MEEF, et une récompense à récupérer":
    "كارت Pointili في تلفون الحريف: ياسين عندو 118 point عند Café El Manar، الـcode client متاعو MEEF، وعندو récompense يستنّى باش ياخوها.",
  "Vous saurez enfin lesquels.": "وأخيرا باش تعرف شكون فيهم.",
  "La carte de fidélité de votre commerce, dans le téléphone de vos clients.": "كارت fidélité متاع حانوتك، في تلفون حرفاك.",
  "Aucune application": "من غير أبليكاسيون",
  "— ni pour eux, ni pour vous.": "— لا ليهم ولا ليك.",
  "Vos points,": "النقاط متاعك،",
  "dans tous vos commerces.": "في كلّ المحلات اللي تمشيلهم.",
  "Un numéro, un code secret, et vos cartes sont là.": "نمرة، كود سرّي، والكوارط متاعك هاهي.",
  "Rien à installer.": "من غير تنزيل.",
  "Ouvrir mes cartes": "افتح الكوارط متاعي",
  "Ou scannez le QR posé sur votre table": "ولا اسكاني الكود اللي على طاولتك",
  "Fait pour": "معمول لشكون",
  "Au comptoir": "في الكونتوار",
  "Sur votre téléphone": "في تليفونك",
  "Trois gestes, cinq secondes.": "ثلاث حركات، خمس ثواني.",
  "Trois gestes, une seule fois.": "ثلاث حركات، مرّة وحدة برك.",
  "Pendant que vous rendez la monnaie. Pas de matériel, pas de lecteur, pas de caisse à changer — votre téléphone suffit.": "وإنت قاعد تردّ الصرف. لا ماتيريال، لا سكانير، ولا كاس تبدّلها — تليفونك يكفي.",
  "Après ça, votre carte est là à chaque passage : vous donnez votre numéro, et c'est tout.": "من بعد هاذي، الكارت متاعك موجودة في كلّ مرّة تجي: تعطي نمرتك وخلاص.",
  "Ce que vous ne savez pas": "اللي ما تعرفوش",
  "Vous connaissez vos habitués. Vous ne savez pas combien sont revenus.": "تعرف حرفاءك الدايمين. أمّا ما تعرفش قدّاش منهم رجعو.",
  "Le carton ne compte pas, et personne n'a jamais tenu ce registre à la main. Voilà les quatre chiffres qui apparaissent dans votre espace, sans que vous ayez rien à saisir.": "الكرتونة ما تحسبش، وحتّى حدّ عمرو ما عمل هذا الحساب بيدو. هاذم الأربعة أرقام اللي يبانو في الفضاء متاعك، من غير ما تكتب حتّى حاجة.",
  "En dessous de cinq clients, l'écran affiche « Trop tôt pour conclure » au lieu d'un taux. Un chiffre sur quatre passages ne veut rien dire, et nous préférons le dire.": "كان عندك أقلّ من خمسة حرفاء، الإيكران يكتب «مازال بكري باش نحكمو» بلاصة النسبة. رقم مبني على أربع زيارات ما يقول حتّى حاجة، وأحنا نحبّو نقولوها.",
  "Le produit, filmé": "المنتج، متصوّر",
  "Rien n'est dessiné ici.": "موش animation وخلاص.",
  "Chaque écran ci-dessous est le vrai produit, filmé en train de faire ce qu'il dit.": "كل écran تشوفو لتحت هو المنتج بالحق، متصوّر وهو يخدم كيف ما هو.",
  "Voici votre caisse.": "هذا الكاس متاعك.",
  "Voici votre téléphone.": "هذا تليفونك.",
  "Le prix": "السومة",
  "Un prix simple.": "سوم واضح.",
  "Pas de commission sur vos ventes. Pas de limite de clients. Pas de palier qui se déclenche le jour où ça marche.": "ما فمّاش كوميسيون على اللي تبيعو. ما فمّاش حدّ لعدد الحرفاء. وما فمّاش سومة تطلع نهار اللي تبدا الحكاية تمشي.",
  "Vous payez par D17, Flouci ou virement.": "تخلّص بـD17 ولا Flouci ولا فيرمان.",
  "Vous envoyez la photo du reçu depuis l'application, et votre compte est prolongé — pas de carte bancaire, pas de prélèvement qui se renouvelle tout seul.": "تصوّر الوصل وتبعثو من الأبليكاسيون، والحساب متاعك يتمدّد — من غير كارت بنكية، ومن غير ما يتسحبولك فلوس وحدهم.",
  "Meilleure offre": "أحسن عرض",
  "TND / an": "TND / عام",
  "Tout ce dont vous avez besoin pour fidéliser vos clients.": "كل اللي تحتاجو باش حرفاك يرجعولك.",
  "TND / 6 mois": "TND / 6 شهور",
  "Parfait pour commencer. Les mêmes fonctions, la même assistance — vous payez juste plus souvent.": "باهي باش تبدا. نفس الخدمات ونفس المساعدة — كان إنّك تخلّص أكثر مرّات.",
  "Choisir cette offre": "اختار هذا العرض",
  "Commencer": "نبداو",
  "La fidélité commence aujourd'hui.": "الفيداليتي تبدا اليوم.",
  "Vous créez votre espace, vous réglez vos récompenses, vous imprimez votre QR. Aucun matériel, aucun engagement, et vos habitués n'ont rien à installer.": "تعمل الفضاء متاعك، تظبّط الهدايا متاعك، وتطبع الكود متاعك. من غير ماتيريال، من غير عقد يشدّك، وحرفاءك ما ينزّلوش حتّى حاجة.",
  "Créer ma boutique": "اعمل المحلّ متاعي",
  "Conçu et hébergé pour la Tunisie": "متصمّم ومُستضاف في تونس، للتوانسة",
  "Confidentialité": "الخصوصية",
  "Conditions": "الشروط",
  "Contact": "اتصل بينا",

  /* ── the early-access page (/early) ───────────────────────────────────
     THE ONE PLACE THE OWNER-FACING PRODUCT SPEAKS TUNISIAN.

     The note at the top of this file says only the CUSTOMER app is translated,
     because the owner app and the console are one person's back office in one
     language. This page is neither: it is read by a shop owner who has never
     heard of us, on a phone, off a link in an Instagram bio — which is the
     single most likely place in the whole product for the reader to be someone
     who does not do business in French. Half a lead list is not worth a
     consistency rule.

     "كون من أوّل" rather than a transliteration of the campaign line. Somebody
     who wants this language is not reading Latin letters for it — the same
     reason components/LangToggle says تونسي and never "Tounsi".

     BIZNESS, not "أعمال": the word a Tunisian shop owner uses about their own
     shop out loud. أعمال is a business-school word and would land exactly the
     way فصحى does everywhere else in this file. */
  "Accès anticipé · Tunisie": "دخول مبكّر · تونس",
  "Votre commerce a été cité": "المحلّ متاعك تسمّى",
  "Vos clients vous réclament": "الحرفاء متاعك يطلبوا فيك",
  "Quelqu'un a cité votre commerce sous une publication Pointili. On construit une nouvelle façon pour les commerces de récompenser leurs habitués — et on ouvre commerce par commerce.":
    "فمّا شكون سمّى المحلّ متاعك تحت بوست متاع Pointili. أحنا نحضّرو طريقة جديدة باش المحلّات تكافئ حرفاءها الدايمين — ونحلّو محلّ بمحلّ.",
  "Soyez parmi les premiers commerces sur Pointili": "كون من أوّل المحلّات مع Pointili",
  "Fidélisez vos clients et faites-les revenir plus souvent. Pointili est la carte de fidélité digitale de votre commerce : vos clients cumulent des points à chaque achat et reviennent les dépenser chez vous.":
    "خلّي حرفاءك يرجعولك أكثر. Pointili هو كارت الفيداليتي الديجيتال متاع محلّك: حرفاءك يجمّعوا نقاط في كلّ شرا، ويرجعوا يصرفوهم عندك.",
  "Pointili n'est pas encore ouvert au public. Laissez-nous votre numéro et on vous écrit dès que c'est votre tour.":
    "Pointili مازال ما حلّش للعامّة. خلّي نمرتك وأحنا نكتبولك كي توصل نوبتك.",

  /* the form */
  "Demander l'accès": "اطلب الدخول",
  "Trois questions. Ça prend vingt secondes.": "ثلاث أسئلة برك. تاخذ عشرين ثانية.",
  "Nom de votre commerce": "اسم المحلّ متاعك",
  "Café El Manar": "قهوة المنار",
  "Quel type de commerce ?": "شنوّة نوع المحلّ متاعك؟",
  "Numéro WhatsApp": "نمرة الواتساب",
  "On vous écrit ici quand l'accès anticipé ouvre. Rien d'autre.":
    "نكتبولك هوني كي يحلّ الدخول المبكّر. حتّى حاجة أخرى.",
  "Demander l'accès anticipé": "اطلب الدخول المبكّر",

  /* what the form can refuse, and it must refuse in their language or the
     three-field form becomes a wall */
  "Écris le nom de ton commerce.": "أكتب اسم المحلّ متاعك.",
  "Ce nom est trop long.": "هذا الاسم طويل برشا.",
  "Choisis le type de ton commerce.": "اختار نوع المحلّ متاعك.",
  "Ce numéro n'a pas l'air correct — 8 chiffres.": "النمرة هذي ما تبانش صحيحة — ثمانية أرقام.",
  "Ça n'a pas marché. Réessaie dans un moment.": "ما مشاتش. عاود بعد شويّة.",

  /* the thank-you, and the one question after it */
  "Vous êtes sur la liste": "إنت في القايمة",
  "Merci ! On vous écrit sur WhatsApp dès que Pointili ouvre pour votre commerce.":
    "يعيشك! نكتبولك على الواتساب كي يحلّ Pointili للمحلّ متاعك.",
  "Une dernière chose, si vous voulez :": "آخر حاجة، كان تحبّ:",
  "Qu'est-ce qui vous intéresse le plus dans Pointili ?": "شنوّة أكثر حاجة تهمّك في Pointili؟",
  "Faire revenir mes clients plus souvent": "نخلّي حرفائي يرجعوا أكثر",
  "Avoir un vrai programme de fidélité": "نعمل système فيداليتي كيما يلزم",
  "Savoir qui sont mes habitués": "نعرف شكون حرفائي الدايمين",
  "Je veux juste en savoir plus": "نحبّ نعرف أكثر برك",
  "Merci — ça nous aide vraiment.": "يعيشك — هذا يعاوننا برشا.",

  /* what happens next */
  "Ensuite": "من بعد",
  "Ce qui se passe après votre demande.": "شنوّة يصير بعد الطلب متاعك.",
  "On vous écrit sur WhatsApp": "نكتبولك على الواتساب",
  "Pas d'e-mail, pas de démarchage. Un message quand votre tour arrive, et c'est vous qui décidez de la suite.":
    "لا إيمايل لا تلفنة كلّ نهار. رسالة كي توصل نوبتك، والقرار من بعدها متاعك إنت.",
  "On installe votre carte avec vous": "نركّبولك الكارت متاعك معاك",
  "Vos couleurs, vos récompenses, votre taux de points. Ça prend une vingtaine de minutes, et rien à acheter.":
    "ألوانك، الهدايا متاعك، والنسبة متاع النقاط. تاخذ عشرين دقيقة تقريب، وما تشري حتّى حاجة.",
  "Vos clients scannent le QR": "حرفاءك يسكانيو الكود",
  "Posé sur la table ou collé à la caisse. Ils n'ont aucune application à installer — leur carte s'ouvre dans le navigateur.":
    "محطوط على الطاولة ولاّ ملصوق في الكاس. ما ينزّلوا حتّى أپليكاسيون — الكارت متاعهم تحلّ في النافيڨاتور.",
  "Le carton": "الكرتونة",
  "Pourquoi Pointili plutôt qu'un carnet ?": "علاش Pointili وموش الكرتونة؟",
  "La carte en carton a fait tourner des milliers de commerces et elle marche encore. Voilà simplement là où elle s'arrête.": "الكرتونة خدّمت آلاف المحلات ومازالت تخدم. أحنا نوريّولك برك وين توقف.",
  "Mise en route": "باش تبدا",
  "Quelques minutes, depuis votre téléphone": "شويّة دقايق، من تليفونك",
  "Imprimer, découper, distribuer": "تطبع، تقصّ، توزّع",
  "Souvent une installation à prévoir": "برشا مرّات يلزم شكون يجي يركّبلك",
  "Côté client": "عند الحريف",
  "Le navigateur — rien à installer": "النافيڨاتور برك — ما فمّا حتّى حاجة تتنزّل",
  "Une carte à ne pas perdre": "كارت يلزم ما تضيعش",
  "Une application à télécharger": "أبليكاسيون لازم ينزّلها",
  "Client sans compte": "حريف ما عندوش حساب",
  "Ses points l'attendent : le numéro suffit": "نقاطو تستنّاه: نمرتو تكفي",
  "Il repart sans rien": "يخرج بلا حتّى حاجة",
  "Il doit s'inscrire d'abord": "لازم يسجّل الأوّل",
  "Ce que vous apprenez": "شنوّة تعرف",
  "Qui revient, à quel rythme, quelle récompense marche": "شكون يرجع، وقدّاش يرجع، وأنهي هديّة تمشي",
  "Rien — le carton ne compte pas": "حتّى حاجة — الكرتونة ما تحسبش",
  "Des tableaux de bord, souvent payants": "تابلوهات أرقام، وأغلب الوقت بالفلوس",
  "Une erreur de caisse": "غلطة في الكاس",
  "Se corrige, et la correction reste inscrite": "تتصحّح، والتصحيح يبقى مكتوب",
  "Un tampon de trop, tant pis": "طابع زايد وخلاص",
  "Variable": "على حسب",
  "Le numéro du client": "نمرة الحريف",
  "Jamais affiché à la caisse — un code à 4 caractères": "عمرها ما تبان في الكاس — كود بـ4 حروف",
  "Sans objet": "ما فمّاش نمرة أصلاً",
  "Carte en carton": "كارت الكرتون",
  "Autres plateformes": "پلاتفورمات أخرى",
  "« Autres plateformes » décrit ce qui est courant sur ce marché, pas un concurrent en particulier — leurs offres changent, la nôtre aussi.": "«پلاتفورمات أخرى» تعني اللي موجود عادةً في السوق، موش شركة معيّنة بالإسم — العروض متاعهم تتبدّل، والعرض متاعنا زادا.",
  "Le comptoir": "الكونتوار",
  "Les questions qu'on nous pose": "الأسئلة اللي يسألونا عليها",
  "Les vraies, celles du comptoir.": "الحقيقيّة، اللي تتسأل في الكونتوار.",
  "Mon client doit-il installer une application ?": "الحريف متاعي لازم ينزّل أبليكاسيون؟",
  "Non. Il scanne le QR posé sur la table et sa carte s'ouvre dans son navigateur. Pas d'e-mail, pas de mot de passe : un numéro et un code secret. Ni lui ni vous n'avez d'application à télécharger.": "لا. يسكاني الكود اللي على الطاولة والكارت متاعو تتحلّ في النافيڨاتور. من غير إيميل ومن غير موت دو پاس: نمرة وكود سرّي برك. لا هو ولا إنت عندكم أبليكاسيون تنزّلوها.",
  "Et s'il n'a pas encore de carte au moment de payer ?": "وكان مازال ما عندوش كارت وقت الخلاص؟",
  "Vous tapez son numéro et vous créditez quand même. Les points l'attendent. Le jour où il crée sa carte, il les retrouve tous — rien ne se perd, et personne ne repart les mains vides parce qu'il n'était pas encore inscrit.": "تكتب نمرتو وتعطيه نقاطو حتّى كان ما عندوش كارت. النقاط تستنّاه. النهار اللي يعمل فيه الكارت متاعو، يلقاهم الكلّ — ما تضيع حتّى نقطة، وحدّ ما يخرج فارغ خاطر مازال ما سجّلش.",
  "Qu'est-ce qu'il me faut comme matériel ?": "شنوّة لازمني من ماتيريال؟",
  "Un téléphone. Pas de caisse à changer, pas de lecteur à acheter, pas de formation. Vous créez votre espace, vous réglez vos récompenses, vous imprimez votre QR.": "تليفون برك. ما تبدّلش الكاس متاعك، ما تشريش سكانير، وما فمّاش تكوين. تعمل الفضاء متاعك، تحضّر الهدايا متاعك، وتطبع الكود متاعك.",
  "Combien de temps ça prend à la caisse ?": "قدّاش تاخذ من وقت في الكاس؟",
  "Le client donne son numéro ou son code à 4 caractères, vous tapez le montant en dinars, vous validez. Le calcul se fait sur le serveur, à votre taux — ni vous ni votre caissier n'avez de points à calculer.": "الحريف يعطيك نمرتو ولا الكود متاعو بـ4 حروف، إنت تكتب المبلغ بالدينار وتأكّد. الحساب يتعمل في السيرفور على حسب النسبة اللي حطّيتها — لا إنت ولا الكياس متاعك تحسبو حتّى نقطة.",
  "Est-ce que je vois le numéro de téléphone de mes clients ?": "نجّم نشوف نمرة تليفون الحرفاء متاعي؟",
  "L'écran de caisse ne l'affiche pas : vos clients y sont identifiés par un code à quatre caractères. Le système, lui, connaît le numéro — c'est la clé de leur registre de points.": "إيكران الكاس ما يوريهاش: الحرفاء متاعك يبانولك بكود بأربع حروف. أمّا السيستام يعرف النمرة — هي المفتاح متاع سجلّ النقاط متاعهم.",
  "Et si mon caissier se trompe de montant ?": "وكان الكياس متاعي غلط في المبلغ؟",
  "Vous corrigez depuis la fiche du client. La correction s'inscrit dans l'historique au lieu d'effacer la ligne : rien n'est supprimé, donc rien ne peut être maquillé.": "تصحّح من الفيش متاع الحريف. التصحيح يتكتب في الحركات، ما يمسحش السطر القديم: ما يتنحّى حتّى شيء، وبالتالي ما ينجّم حتّى حدّ يزوّق الحسابات.",
  "J'ai déjà une carte en carton. Je dois tout arrêter ?": "عندي كارت كرتون. لازم نوقّف الكلّ؟",
  "Non, et beaucoup gardent les deux au début. Pointili fait la même chose — une visite, un tampon — sauf que la carte est dans le téléphone du client, qu'elle ne se perd pas, et qu'à la fin du mois vous savez combien de vos clients sont revenus.": "لا، وبرشا يخلّيو الزوز في البداية. Pointili يعمل نفس الحاجة — زيارة، طابع — أمّا الكارت في تليفون الحريف، ما تضيعش، وفي آخر الشهر تعرف قدّاش من حريف رجعلك.",
  "Mes clients me connaissent déjà. À quoi ça sert ?": "الحرفاء متاعي يعرفوني. شنوّة باش تنفعني؟",
  "C'est exactement pour ça que ça marche. Vous connaissez vos habitués ; ce que vous ne savez pas, c'est combien sont revenus ce mois-ci, ni lesquels ont cessé de venir. Pointili met un chiffre là-dessus, sans rien changer à votre façon de les accueillir.": "هذا بالضبط علاش تمشي. إنت تعرف الحرفاء الدايمين متاعك؛ اللي ما تعرفوش هو قدّاش منهم رجع هذا الشهر، وشكون فيهم بطّل يجي. Pointili يحطّلك رقم على هالحكاية، من غير ما تبدّل شيء في طريقة ما تستقبل بيها حرفاءك.",
  "Votre marque": "المارك متاعك",
  "La carte porte votre nom. Pas le nôtre.": "الكارت باسمك إنت. موش باسمنا أحنا.",
  "Votre couleur, votre logo, et une photo de votre salle si vous en voulez une. Vous choisissez la hauteur du bandeau, l'arrondi des angles et le motif — depuis vos Réglages, en trente secondes, sans nous écrire.": "اللون متاعك، اللوڨو متاعك، وتصويرة من الصالة متاعك كان تحبّ. إنت اللّي تختار علوّ الشريط، وتدوير الزوايا، والنقشة — من «Réglages» متاعك، في ثلاثين ثانية، من غير ما تكتبلنا.",
  "Ci-dessous, le même écran, trois commerces.": "تحت هوني، نفس الإيكران، ثلاث محلّات.",
  "Une couleur": "لون",
  "La vôtre, avec un motif discret et des angles arrondis.": "اللون متاعك، مع نقشة خفيفة وزوايا مدوّرة.",
  "Une photo": "تصويرة",
  "Votre salle, votre comptoir. Le nom reste lisible dessus.": "الصالة متاعك، الكونتوار متاعك. والإسم يبقى يتقرا فوقها.",
  "Un aplat": "لون سادة",
  "Net, carré, sans dégradé — si c'est votre style.": "واضح، مربّع، من غير ديڨرادي — كان هذا هو الستيل متاعك.",
  "La carte client — une couleur": "كارت الحريف — لون",
  "La carte client — une photo": "كارت الحريف — تصويرة",
  "La carte client — un aplat": "كارت الحريف — لون سادة",
  "Et la langue": "واللغة",
  "Vos clients lisent leur carte en": "الحرفاء متاعك يقراو الكارت متاعهم",
  "français": "بالفرنسية",
  " ou en": " ولا",
  "tunisien": "بالتونسي",
  ", pas en arabe littéraire. Chacun choisit, sur son téléphone.": "، موش بالعربية الفصحى. كلّ واحد يختار على تليفونو.",

  /*
    ── THE SENTENCES THAT CARRY MARKUP ───────────────────────────────────
    Whole sentences with {slots}, not the fragments above them, because the
    emphasised piece does not sit in the same place in both languages. See
    components/Tpl. The wording is exactly the wording already agreed in the
    fragments; only the order is free to move.

    The language line drops {ar} on purpose. In French, «tunisien — بالتونسي»
    shows a French reader the word in its own script, which is the whole point
    of writing it twice. In Tunisian it would print بالتونسي twice in a row and
    read as a stutter.
  */
  "La carte de fidélité de votre commerce, dans le téléphone de vos clients. {none} — ni pour eux, ni pour vous.":
    "كارت الفيداليتي متاع محلّك، في تليفون حرفاءك. {none} — لا ليهم ولا ليك.",
  "Un numéro, un code secret, et vos cartes sont là. {nothing}":
    "نمرة، كود سرّي، والكوارط متاعك هاهي. {nothing}",
  "{how} Vous envoyez la photo du reçu depuis l'application, et votre compte est prolongé — pas de carte bancaire, pas de prélèvement qui se renouvelle tout seul.":
    "{how} تصوّر الوصل وتبعثو من الأبليكاسيون، والحساب متاعك يتمدّد — من غير كارت بنكية، ومن غير ما يتسحبولك فلوس وحدهم.",
  "Vos clients lisent leur carte en {fr} ou en {tn} — {ar}, pas en arabe littéraire. Chacun choisit, sur son téléphone.":
    "الحرفاء متاعك يقراو الكارت متاعهم {fr} ولا {tn}، موش بالعربية الفصحى. كلّ واحد يختار على تليفونو.",
  "La carte client": "كارت الحريف",
  /* The six-month offer is a line inside the year now, not a second card. */
  /* Templated, because the figures come from lib/billing — the page must not
     be able to advertise a price the renewal screen does not charge. */
  "Ou {n} TND pour 6 mois — sans engagement.": "ولا {n} دينار لـ6 شهور — من غير التزام.",
  "Économisez {n} TND": "توفّر {n} د.ت",
  /* The two price boxes. "1 an" and "6 mois" also exist in lib/billing as the
     offer labels; these are the headings above the numbers. */
  "1 an": "عام",
  "6 mois": "6 شهور",
  TND: "د.ت",
  "Choisir 6 mois": "إختار 6 شهور",
  /* The landing page is read by both audiences; this is the customer's line.
     /moi carries the mirror of it — "Vous êtes commerçant ?" */
  "Vous êtes client ?": "إنت حريف؟",
  "Retrouvez vos cartes": "إلقى الكارطات متاعك",
  "Sans engagement": "من غير engagement",
  /* The comparison lines, as lib/billing writes them. They are keyed on the
     exact French so a change to the catalogue shows up here as untranslated
     rather than as a stale figure in Arabic. */
  "≈ 10 TND / mois": "قرابة 10 د.ت في الشهر",
  "≈ 13 TND / mois": "قرابة 13 د.ت في الشهر",
  /*
    The hero's second line. "Simplement." replaced "Vous saurez enfin lesquels."
    — بساطة would be the noun; ".وبكل بساطة" is how the promise is actually
    said, and it keeps the full stop the design sets it with.
  */
  "Simplement.": "بكل سهولة.",
  "Découvrir Pointili": "شوف Pointili",
  "Voir comment ça marche": "شوف كيفاش تخدم",
  /* The hero's three reasons. Short on purpose — they sit under an icon. */
  "Ultra rapide": "سريع برشة",
  "Encaissez en 5 secondes": "تكمّل الخلاص في 5 ثواني",
  "Sans application": "من غير application",
  "Ni pour vous, ni pour vos clients": "لا إنت يلزمك application، لا حريفك.",
  "Zéro frais caché": "من غير مصاريف مخبّية",
  "Pas de commission sur vos ventes": "ما فما حتى commission على مبيعاتك.",
  /* The four columns under the price, and the two lines above it. */
  "Pas de commission sur vos ventes. Pas de limite de clients.":
    "ما فماش commission على مبيعاتك. وما فماش حدّ في عدد الحرفاء.",
  "D17, Flouci ou virement — vous envoyez la photo du reçu depuis l'application.":
    "D17، Flouci ولا virement — تبعت تصويرة الوصل من داخل التطبيق.",
  "Points, visites et récompenses": "نقاط، زيارات وهدايا",
  "Un coût maîtrisé": "ثمن واضح",
  "Un seul paiement par an, rien d'autre": "خلاص وحيد في العام، وخلاص",
  "Rapports clairs": "أرقام واضحة",
  "Qui revient, et à quel rythme": "شكون يرجعلك، وقدّاش من مرّة",
  "Une équipe là pour vous aider": "فمّا فريق هوني باش يعاونك",
  "Encaisser": "الخلاص",
  "Cinq secondes, pendant que vous rendez la monnaie": "5 ثواني، وإنت تعطي في الصرف",
  "Le client donne son numéro de téléphone. Vous tapez le montant en dinars. C'est fini.": "الحريف يعطيك رقم تلفونو. تدخل المبلغ بالدينار. وهكّا وفّينا.",
  "Le numéro suffit — le client n'a rien à sortir": "النمرة تكفي — الحريف ما يحتاجش يخرّج حتّى حاجة",
  "Vous tapez des DINARS, jamais des points": "إنت تكتب الدنانير، وعمرك ما تكتب نقاط",
  "Le calcul se fait sur le serveur : personne n'invente un solde": "الحساب يتعمل في السيرفور: حتّى حدّ ما ينجّمش يخترع رصيد",
  "Tamponner": "الطابع",
  "Votre carte en carton, sauf qu'elle ne se perd pas": "الكارت الكرتون متاعك، أمّا هاذي ما تضيعش",
  "Une visite, un tampon. En plus des points, si vous voulez — ou à la place.": "زيارة، طابع. مع النقاط كان تحبّ — ولا في بلاصتهم.",
  "Vous choisissez le nombre de visites": "إنت اللّي تختار قدّاش من زيارة",
  "Carte pleine : le code de récompense part tout seul": "كارت كامل: كود الهديّة يمشي وحدو",
  "Rien à ranger, rien à retrouver": "ما فمّا حتّى حاجة ترتّبها، ولا حتّى حاجة تلوّج عليها",
  "Savoir": "إعرف",
  "Enfin le chiffre que vous n'avez jamais eu": "أخيرًا تعرف شكون من حرفاك يرجع يشري عندك",
  "Combien de vos clients reviennent ? Sur 7 jours, 30 jours, ou depuis le début — avec l'écart par rapport à la période d'avant.": "قدّاش من حريف رجعلك؟ في آخر 7 أيّام، 30 يوم، ولا من نهار بديت — وتشوف الفرق بين الفترة هاذي واللي قبلها.",
  "Taux de retour, visites, clients servis, nouveaux": "نسبة الرجوع، الزيارات، الحرفاء اللّي خدمتهم، والجداد",
  "En dessous de 5 clients : « Trop tôt pour conclure »": "أقلّ من 5 حرفاء: «مازال بكري باش نحكمو»",
  "Aucun « bénéfice net » inventé — votre marge ne nous regarde pas": "ما نخترعولكش «ربح صافي» — الربح متاعك ما يخصّناش",
  "Régler": "الرّيڨلاج",
  "Votre programme, vos règles": "البرنامج متاعك، والقوانين متاعك",
  "Chaque réglage affiche sa valeur actuelle. Un tap pour la changer, un bouton pour l'enregistrer.": "كلّ ريڨلاج يوريلك القيمة متاعو توّا. نقرة باش تبدّلها، وزرّ باش تسجّلها.",
  "Points par dinar, bonus de bienvenue, validité des codes": "النقاط في كلّ دينار، هديّة التسجيل، وقتاش يفوت وقت الكود",
  "L'échelle des récompenses, avec photo": "سلّم الهدايا، بالتصويرة",
  "Le nom, le logo et le type de votre commerce": "الإسم، اللوڨو، ونوع المحلّ متاعك",
  "Imprimer": "الطباعة",
  "Le kit, prêt ce soir": "الكيت، حاضر هالليلة",
  "Chevalet de table, affiche A5, autocollant, story. Votre QR, à vos couleurs, prêt à imprimer.": "شوفالي متاع الطاولة، أفيش A5، ستيكر، وستوري. الكود متاعك، بالألوان متاعك، حاضر باش تطبعو.",
  "Quatre formats, générés depuis votre espace": "أربع مقاسات، يتعملوا من الفضاء متاعك",
  "Le QR reste sur fond blanc — pour qu'il scanne toujours": "الكود يبقى على أرضية بيضة — باش يتسكانى ديما",
  "Imprimé chez vous, sans rien commander": "تطبعو عندك، من غير ما تكوموندي حتّى حاجة",
  "S'inscrire": "التسجيل",
  "Dix secondes, sans application et sans e-mail": "عشر ثواني، من غير أبليكاسيون ومن غير إيميل",
  "Le client scanne le QR posé sur la table. Un numéro, un code secret, et sa carte existe.": "الحريف يسكاني الكود اللّي على الطاولة. نمرة، كود سرّي، والكارت متاعو ولّى موجود.",
  "Rien à télécharger — la carte s'ouvre dans le navigateur": "ما فمّا حتّى حاجة تنزّلها — الكارت تتحلّ في النافيڨاتور",
  "Pas d'e-mail, pas de mot de passe à retenir": "لا إيميل، ولا موت دو پاس تحفظو",
  "Le bonus de bienvenue arrive immédiatement": "هديّة التسجيل توصل توّا",
  "Retrouver": "الكوارط",
  "Vos points vous attendent, dans chaque commerce": "النقاط متاعك تستنّاك، في كلّ محلّ",
  "Une carte par commerce, toutes dans le même téléphone. Votre code à quatre caractères marche partout.": "كارت لكلّ محلّ، والكلّ في نفس التليفون. الكود متاعك بأربع حروف يخدم في كلّ بلاصة.",
  "Un seul compte pour tous les commerces Pointili": "حساب واحد برك في كلّ المحلّات اللّي تخدم بـPointili",
  "Vos points n'expirent pas": "النقاط متاعك ما يفوتش وقتهم",
  "Votre numéro n'est jamais affiché au comptoir": "نمرتك عمرها ما تبان في الكونتوار",
  "Échanger": "التبديل",
  "Des points contre du réel": "نقاط تتبدّل بحاجة حقيقيّة",
  "Le client choisit sa récompense et reçoit un code à six caractères. Vous le vérifiez, puis vous le validez.": "الحريف يختار الهديّة متاعو ويوصلو كود بستّ حروف. إنت تشيكيه، ومن بعدها تأكّدو.",
  "Vérifier d'abord, valider ensuite — deux gestes distincts": "تشيكي الأوّل، وأكّد من بعد — زوز حركات، موش وحدة",
  "Utilisable une seule fois, et il expire": "يتستعمل مرّة وحدة برك، ووقتو يفوت",
  "Le code s'affiche en grand : il se lit à travers un comptoir": "الكود يبان بالكبير: يتقرا من ورا الكونتوار",
  "Corriger": "التصحيح",
  "Une erreur se répare, elle ne s'efface pas": "الغلطة تتصلّح، ما تتمحاش",
  "Votre caissier s'est trompé de montant ? Corrigez-le. La correction s'inscrit dans l'historique.": "الكياس متاعك غلط في المبلغ؟ صلّحو. والتصحيح يتكتب في الحركات.",
  "Chaque ligne reste : achat, bienvenue, échange, correction": "كلّ سطر يبقى: شرا، مرحبا، تبديل، تصحيح",
  "Rien n'est supprimé, donc rien ne peut être maquillé": "ما يتمسح حتّى شيء، ومعناها حتّى حاجة ما تنجّمش تتغطّى",
  "L'historique complet du client, depuis la caisse": "الحركات الكلّ متاع الحريف، من الكاس",
  "Votre caisse": "الكاس متاعك",
  "Le téléphone du client": "تليفون الحريف",
  "Pour mon commerce": "للمحلّ متاعي",
  "Commerce": "المحلّ",
  "Je suis client": "أنا حريف",
  "Client": "حريف",
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
  /*
    [^{}]+ , NOT \w+ — the two fill paths have to agree on what a slot is.

    t(fr, vars) replaces by plain string search, so `{vie privée}` worked there;
    this matched \w+ only, so the same template rendered the braces LITERALLY on
    screen — "et notre {vie privée}." went out on the join page in Tunisian.
    One of them being stricter than the other is the whole bug, and the fix is
    for them to accept the same thing rather than for callers to remember which
    is which. Slot names are still identifiers by convention.
  */
  const re = /\{([^{}]+)\}/g;
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
