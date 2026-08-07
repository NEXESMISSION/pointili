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

/**
 * The strings.
 *
 * FRENCH IS THE KEY. Not `card.title` — the French sentence itself, because a
 * key is one more thing to keep in step with the screen and this way a missing
 * translation degrades to the sentence that was already there rather than to
 * "card.title" in front of a customer.
 *
 * Only the CUSTOMER app is here. The owner app and the console are one person's
 * back office, in one language, and translating them would double the surface
 * for no reader.
 */
const TN: Record<string, string> = {
  /* ── navigation ── */
  "Ma carte": "الكارت متاعي",
  "Récompenses": "الهدايا",
  "Mon activité": "الحركة متاعي",
  "Mon profil": "الحساب متاعي",
  "Mes cartes": "الكوارط متاعي",
  "Mon code": "الكود متاعي",
  "Historique": "الحركة",
  "Profil": "الحساب",
  "Mes codes": "الكودات متاعي",

  /* ── the card ── */
  "Mon code client": "الكود متاعي",
  "points": "نقطة",
  "Le serveur le scanne — pas besoin de ton numéro.":
    "الڨارسون يسكانيه — ما تحتاجش تعطي نمرتك.",
  "À gagner ici": "شنوّة تنجّم تاخذ هوني",
  "Tout voir": "شوف الكل",
  "points, visites, récompenses": "النقاط، الخرجات و الهدايا",
  "Ma carte de fidélité": "كارت الفيداليتي متاعي",
  "boutique": "بوتيك",
  "boutiques": "بوتيكات",
  "Encore": "باقي",
  "pour": "باش تاخذ",
  "point": "نقطة",
  "à prendre": "تنجّم تاخذها",
  "Tu peux prendre": "تنجّم تاخذ",
  "n'importe quelle récompense": "أيّ هديّة",
  "ici.": "هوني.",
  "Tu as assez de points — choisis la tienne.": "عندك نقاط برشا — اختار اللي تحبّ.",

  /* ── rewards ── */
  "Choisis ta récompense": "اختار الهديّة متاعك",
  "points disponibles": "نقطة موجودة",
  "Échanger": "بدّل",
  "Récompense réservée": "الهديّة محجوزة",
  "Fais scanner ça :": "خلّيهم يسكانيو هذا:",
  "Le serveur scanne le QR — ou tape le code.": "الڨارسون يسكاني الكود — ولا يكتبو.",
  "Pas de date limite": "ما فمّاش تاريخ آخر",
  "Échanger autre chose": "بدّل حاجة أخرى",
  "Oui, échanger": "إيه، بدّل",
  "Annuler": "خلّي",

  /* ── coming back ── */
  "Bon retour": "مرحبا بيك من جديد",
  "Ton code secret": "الكود السرّي متاعك",
  "Rouvrir ma carte": "افتح الكارت متاعي",
  "Ce n'est pas moi — utiliser un autre numéro": "موش أنا — نحب نستعمل نمرة أخرى",
  "Numéro de téléphone": "نمرة التيليفون",
  "Nouveau compte": "حساب جديد",
  "J'ai déjà un compte": "عندي حساب",
  "Créer mon compte": "اعمل حسابي",
  "Un seul compte.": "حساب واحد برك.",

  /* ── activity ── */
  "Achat": "شرا",
  "Bienvenue": "مرحبا",
  "Récupéré": "تاخذ",
  "Correction": "تصحيح",
  "Total gagné": "الجملة اللي ربحتها",
  "Rien pour l'instant": "ما فمّا حتّى حاجة توّا",

  /* ── profile ── */
  "Se déconnecter": "اخرج",
  "Mon code en grand": "الكود متاعي بالكبير",
  "Langue": "اللغة",
  "Français": "بالفرنسية",
  "Tunisien": "بالتونسي",
};

/**
 * Translate one sentence. `t("Ma carte")` in French returns "Ma carte".
 *
 * A missing Tunisian string falls back to the French, deliberately and
 * silently: a half-translated screen is a working screen, and a screen full of
 * missing-key markers is not.
 */
export function translator(lang: Lang) {
  return (fr: string): string => (lang === "tn" ? (TN[fr] ?? fr) : fr);
}

export type T = ReturnType<typeof translator>;
