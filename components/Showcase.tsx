import { DEMO_VERSION } from "@/components/demoVersion";
import { translator, type Lang } from "@/lib/dict";

/*
  THE PRODUCT, FILMED, EXPLAINED ONE CAPABILITY AT A TIME.

  What was here before was four icons with a caption each, then — briefly — a
  hand-drawn imitation of one flow. Both were the same mistake in different
  clothes: a description of software rather than the software. And both covered
  a quarter of what an owner needs to see. Nothing showed the analytics, the
  settings, the reward ladder, the print kit or the history.

  These clips are the real product. scripts/capture.mjs drives it with Playwright
  against the demo café — 35 customers, ~90 days of history — and records what
  happens. Nothing here is drawn, so nothing here can drift away from what ships.

  WEBM, NOT GIF. A GIF of a phone screen is 1–3 MB and 256 colours. These are
  ~120–430 KB each in full colour. On Tunisian 4G that is the difference between
  a page that loads and one that does not — and there are eight of them.

  EVERY CLIP IS LAZY. preload="none" means a visitor who never scrolls past the
  first section downloads none of them.
*/

type Shot = {
  eyebrow: string;
  title: string;
  lede: string;
  /** Concrete, checkable facts — not adjectives. */
  facts: string[];
  clip: string;
  poster?: string;
  /** Whose screen this is, so nobody has to guess. */
  side: "Votre caisse" | "Le téléphone du client";
};

const SHOTS: Shot[] = [
  {
    eyebrow: "Encaisser",
    title: "Cinq secondes, pendant que vous rendez la monnaie",
    lede: "Le client donne son numéro de téléphone. Vous tapez le montant en dinars. C'est fini.",
    facts: [
      "Le numéro suffit — le client n'a rien à sortir",
      "Vous tapez des DINARS, jamais des points",
      "Le calcul se fait sur le serveur : personne n'invente un solde",
    ],
    clip: "/demo/credit.webm",
    poster: "/demo/credit.png",
    side: "Votre caisse",
  },
  {
    eyebrow: "Tamponner",
    title: "Votre carte en carton, sauf qu'elle ne se perd pas",
    lede: "Une visite, un tampon. En plus des points, si vous voulez — ou à la place.",
    facts: [
      "Vous choisissez le nombre de visites",
      "Carte pleine : le code de récompense part tout seul",
      "Rien à ranger, rien à retrouver",
    ],
    clip: "/demo/stamp.webm",
    poster: "/demo/stamp.png",
    side: "Votre caisse",
  },
  {
    eyebrow: "Savoir",
    title: "Enfin le chiffre que vous n'avez jamais eu",
    lede: "Combien de vos clients reviennent ? Sur 7 jours, 30 jours, ou depuis le début — avec l'écart par rapport à la période d'avant.",
    facts: [
      "Taux de retour, visites, clients servis, nouveaux",
      "En dessous de 5 clients : « Trop tôt pour conclure »",
      "Aucun « bénéfice net » inventé — votre marge ne nous regarde pas",
    ],
    clip: "/demo/analyses.webm",
    poster: "/demo/analyses.png",
    side: "Votre caisse",
  },
  {
    eyebrow: "Régler",
    title: "Votre programme, vos règles",
    lede: "Chaque réglage affiche sa valeur actuelle. Un tap pour la changer, un bouton pour l'enregistrer.",
    facts: [
      "Points par dinar, bonus de bienvenue, validité des codes",
      "L'échelle des récompenses, avec photo",
      "Le nom, le logo et le type de votre commerce",
    ],
    clip: "/demo/reglages.webm",
    poster: "/demo/reglages.png",
    side: "Votre caisse",
  },
  {
    eyebrow: "Imprimer",
    title: "Le kit, prêt ce soir",
    lede: "Chevalet de table, affiche A5, autocollant, story. Votre QR, à vos couleurs, prêt à imprimer.",
    facts: [
      "Quatre formats, générés depuis votre espace",
      "Le QR reste sur fond blanc — pour qu'il scanne toujours",
      "Imprimé chez vous, sans rien commander",
    ],
    clip: "/demo/qr.webm",
    poster: "/demo/qr.png",
    side: "Votre caisse",
  },
  {
    eyebrow: "S'inscrire",
    title: "Dix secondes, sans application et sans e-mail",
    lede: "Le client scanne le QR posé sur la table. Un numéro, un code secret, et sa carte existe.",
    facts: [
      "Rien à télécharger — la carte s'ouvre dans le navigateur",
      "Pas d'e-mail, pas de mot de passe à retenir",
      "Le bonus de bienvenue arrive immédiatement",
    ],
    clip: "/demo/signup.webm",
    poster: "/demo/signup.png",
    side: "Le téléphone du client",
  },
  {
    /* carte.webm was filmed and then never placed. It is the screen a customer
       opens most — their own card — and it sat unused while the page showed
       them the till instead. */
    eyebrow: "Retrouver",
    title: "Vos points vous attendent, dans chaque commerce",
    lede: "Une carte par commerce, toutes dans le même téléphone. Votre code à quatre caractères marche partout.",
    facts: [
      "Un seul compte pour tous les commerces Pointili",
      "Vos points n'expirent pas",
      "Votre numéro n'est jamais affiché au comptoir",
    ],
    clip: "/demo/carte.webm",
    poster: "/demo/carte.png",
    side: "Le téléphone du client",
  },
  {
    eyebrow: "Échanger",
    title: "Des points contre du réel",
    lede: "Le client choisit sa récompense et reçoit un code à six caractères. Vous le vérifiez, puis vous le validez.",
    facts: [
      "Vérifier d'abord, valider ensuite — deux gestes distincts",
      "Utilisable une seule fois, et il expire",
      "Le code s'affiche en grand : il se lit à travers un comptoir",
    ],
    clip: "/demo/redeem.webm",
    poster: "/demo/redeem.png",
    side: "Le téléphone du client",
  },
  {
    eyebrow: "Corriger",
    title: "Une erreur se répare, elle ne s'efface pas",
    lede: "Votre caissier s'est trompé de montant ? Corrigez-le. La correction s'inscrit dans l'historique.",
    facts: [
      "Chaque ligne reste : achat, bienvenue, échange, correction",
      "Rien n'est supprimé, donc rien ne peut être maquillé",
      "L'historique complet du client, depuis la caisse",
    ],
    clip: "/demo/correction.webm",
    poster: "/demo/correction.png",
    side: "Votre caisse",
  },
];

/**
 * THE CLIPS THE PAGE ASKS FOR, in the order it asks for them.
 *
 * It used to render all nine and filter them by a Commerce/Client switch. Nine
 * clips is nine screens of scrolling, and the switch was a whole parallel page
 * — a second hero, a second set of steps — maintained so that the visitor who
 * almost never arrives here could be sold to. Customers reach their card by
 * scanning the sticker on the table; the page keeps one quiet link for the one
 * who lost it.
 *
 * SHOTS keeps all nine because they are filmed, captioned and true; the caller
 * names the three that carry the argument. Adding one back is a word in a list,
 * not a rebuild.
 *
 * No longer a client component. The audience switch was the only state on it —
 * the clips play from plain HTML attributes.
 */
export function Showcase({ lang = "fr", only }: { lang?: Lang; only: string[] }) {
  const shots = only
    .map((clip) => SHOTS.find((s) => s.clip === `/demo/${clip}.webm`))
    .filter((s): s is Shot => Boolean(s));

  /*
    SIDE BY SIDE, NOT ONE UNDER THE OTHER.

    These were full-width rows — phone on one side, words on the other, sides
    alternating — which is the right shape for nine of them and costs a whole
    screen each for two. Two screens to say "here is the till, here is what you
    learn", on a page whose entire argument is that it is short.

    As a pair they take one. It also puts the two claims where they can be read
    together, which is the actual argument: the thing you do all day, and the
    thing you get for doing it.
  */
  return (
    <div className="grid gap-12 sm:grid-cols-2 sm:gap-8 md:gap-12">
      {shots.map((s) => (
        <Card key={s.clip} shot={s} lang={lang} />
      ))}
    </div>
  );
}

/* The copy stays in SHOTS in French and is translated HERE, at the point of
   use: the French line is the dictionary key, so the data reads as prose in the
   source and there is exactly one t() per field instead of one per string. */
function Card({ shot, lang }: { shot: Shot; lang: Lang }) {
  const t = translator(lang);
  return (
    /*
      A CARD, NOT A FLOATING PHONE.

      These were two devices standing in white space with a chip and two
      paragraphs underneath — nothing held them, so at a glance the page read
      as two screenshots somebody had dropped in, and the words belonged to
      whichever phone you decided they were nearer.

      The device now sits IN something: a tinted panel it is cropped by, with
      the words in the white below it. The crop is the point — a phone running
      off the bottom edge reads as a screen you are looking into rather than an
      image that has been placed, and it costs a third of the height a whole
      device did.
    */
    <section className="overflow-hidden rounded-[20px] border border-hair bg-white">
      <div className="relative flex justify-center overflow-hidden bg-lilac-2 px-6 pt-8">
        {/* -mb keeps the bezel running past the panel's bottom edge, and the
            panel's overflow does the cutting. */}
        <div className="-mb-10 w-full max-w-[196px] md:max-w-[212px]">
          <div className="overflow-hidden rounded-t-[30px] border-[6px] border-b-0 border-[#1b1430] bg-[#0b0616] shadow-[0_18px_40px_-26px_rgba(36,18,59,.6)]">
            {/*
              autoPlay + muted + playsInline is the only combination every
              mobile browser will start on its own; without muted, iOS refuses,
              and without playsInline it takes over the whole screen.

              preload="none" keeps the clips off the wire until they are wanted.
            */}
            <video
              src={`${shot.clip}?v=${DEMO_VERSION}`}
              poster={shot.poster && `${shot.poster}?v=${DEMO_VERSION}`}
              autoPlay
              muted
              loop
              playsInline
              preload="none"
              aria-label={`${t(shot.title)} — ${t(shot.side)}`}
              className="block h-auto w-full"
            />
          </div>
        </div>
      </div>

      <div className="p-6 md:p-7">
        {/*
          A CHIP, NOT A CATALOGUE ENTRY. This was "№ 01 —— ENCAISSER" in 11px
          letterspaced uppercase mono with a hairline rule through it: a printed
          catalogue treatment from when there were nine of these and reading
          them in order was the point.
        */}
        <p className="inline-flex items-center rounded-full bg-lilac-2 px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.1em] text-royal">
          {t(shot.eyebrow)}
        </p>

        <h3 className="mt-3.5 text-[22px] leading-[1.18] md:text-[25px]">{t(shot.title)}</h3>
        <p className="mt-2.5 text-[14.5px] leading-relaxed text-slate">{t(shot.lede)}</p>
      </div>

      {/*
        THE FACTS LIST IS GONE FROM THE PAGE, and `facts` stays on the type.

        Three ticked claims under every clip was nine lines of reading beside
        films of the thing doing exactly what they claimed. The clip is the
        evidence; the list was the page explaining its own evidence. They stay
        in SHOTS because they are true, and because deleting them is the kind of
        thing that gets rewritten from memory two months later, worse.
      */}
    </section>
  );
}
