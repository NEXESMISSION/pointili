import { CheckIcon } from "@/components/icons";
import { DEMO_VERSION } from "@/components/demoVersion";

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

export function Showcase() {
  return (
    <div className="space-y-16 md:space-y-24">
      {SHOTS.map((s, i) => (
        <Row key={s.clip} shot={s} flip={i % 2 === 1} />
      ))}
    </div>
  );
}

function Row({ shot, flip }: { shot: Shot; flip: boolean }) {
  const owner = shot.side === "Votre caisse";
  return (
    <section className="grid items-center gap-8 md:grid-cols-2 md:gap-14">
      {/* the phone */}
      <div className={flip ? "md:order-2" : ""}>
        <div className="mx-auto w-full max-w-[286px]">
          <div className="relative overflow-hidden rounded-[36px] border-[7px] border-[#1b1430] bg-[#0b0616] shadow-[0_34px_90px_-34px_rgba(0,0,0,.95)]">
            {/*
              autoPlay + muted + playsInline is the only combination every mobile
              browser will start on its own; without muted, iOS refuses, and
              without playsInline it takes over the whole screen.

              preload="none" keeps eight clips off the wire until they are wanted.
            */}
            <video
              src={`${shot.clip}?v=${DEMO_VERSION}`}
              poster={shot.poster && `${shot.poster}?v=${DEMO_VERSION}`}
              autoPlay
              muted
              loop
              playsInline
              preload="none"
              aria-label={`${shot.title} — ${shot.side}`}
              className="block h-auto w-full"
            />
          </div>
        </div>
      </div>

      {/* what it is */}
      <div className={flip ? "md:order-1" : ""}>
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#a78bfa]">
            {shot.eyebrow}
          </span>
          {/* whose screen — the two audiences look alike and this page shows both */}
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.05em] ${
              owner ? "bg-[#7c3aed] text-white" : "bg-white/10 text-white/65"
            }`}
          >
            {shot.side}
          </span>
        </div>

        <h3 className="mt-3 text-[26px] font-extrabold leading-[1.12] tracking-[-0.02em] md:text-[32px]">
          {shot.title}
        </h3>
        <p className="mt-3 max-w-[46ch] text-[15.5px] leading-relaxed text-white/60">
          {shot.lede}
        </p>

        <ul className="mt-6 space-y-2.5">
          {shot.facts.map((f) => (
            <li key={f} className="flex items-start gap-3">
              <span className="mt-[3px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#7c3aed]/20 text-[#a78bfa]">
                <CheckIcon className="h-3 w-3" />
              </span>
              <span className="text-[14.5px] leading-snug text-white/75">{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
