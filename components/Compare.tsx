/**
 * Le tableau comparatif, et les questions.
 *
 * Deux choses qu'un concurrent français (Earnly) met sur sa page d'accueil et
 * que celle-ci n'avait pas — et qui manquaient pour une raison précise : cette
 * page montre très bien CE QUE FAIT le produit (huit clips du vrai logiciel)
 * et pas du tout POURQUOI LUI plutôt qu'autre chose. Un visiteur qui hésite
 * entre Pointili, une carte en carton et une autre plateforme repartait sans
 * réponse.
 *
 * LE TABLEAU NE SE MOQUE PAS DU CARTON. C'est une règle du dictionnaire de
 * marque et c'est aussi la bonne tactique : la carte papier a rendu service à
 * des milliers de commerces, la personne qui lit s'en sert peut-être encore, et
 * la mépriser revient à lui dire qu'elle a eu tort. On dit ce qu'elle fait bien,
 * puis là où elle s'arrête.
 *
 * LES RÉPONSES SONT VÉRIFIABLES, pas commerciales. Chacune décrit un
 * comportement réel du code — le walk-in existe (scripts/test-walkin.mjs), la
 * caisse n'affiche pas le numéro, la correction s'inscrit dans l'historique. Si
 * l'une devient fausse, elle doit changer ici le jour même.
 *
 * Pas de prix : docs/PRODUIT.md le marque encore « à confirmer ».
 */

type Row = { label: string; us: string; paper: string; other: string };

const ROWS: Row[] = [
  {
    label: "Mise en route",
    us: "Quelques minutes, depuis votre téléphone",
    paper: "Imprimer, découper, distribuer",
    other: "Souvent une installation à prévoir",
  },
  {
    label: "Côté client",
    us: "Le navigateur — rien à installer",
    paper: "Une carte à ne pas perdre",
    other: "Une application à télécharger",
  },
  {
    label: "Client sans compte",
    us: "Ses points l'attendent : le numéro suffit",
    paper: "Il repart sans rien",
    other: "Il doit s'inscrire d'abord",
  },
  {
    label: "Ce que vous apprenez",
    us: "Qui revient, à quel rythme, quelle récompense marche",
    paper: "Rien — le carton ne compte pas",
    other: "Des tableaux de bord, souvent payants",
  },
  {
    label: "Une erreur de caisse",
    us: "Se corrige, et la correction reste inscrite",
    paper: "Un tampon de trop, tant pis",
    other: "Variable",
  },
  {
    label: "Le numéro du client",
    us: "Jamais affiché à la caisse — un code à 4 caractères",
    paper: "Sans objet",
    other: "Variable",
  },
];

const QA: { q: string; a: string }[] = [
  {
    q: "Mon client doit-il installer une application ?",
    a: "Non. Il scanne le QR posé sur la table et sa carte s'ouvre dans son navigateur. Pas d'e-mail, pas de mot de passe : un numéro et un code secret. Ni lui ni vous n'avez d'application à télécharger.",
  },
  {
    q: "Et s'il n'a pas encore de carte au moment de payer ?",
    a: "Vous tapez son numéro et vous créditez quand même. Les points l'attendent. Le jour où il crée sa carte, il les retrouve tous — rien ne se perd, et personne ne repart les mains vides parce qu'il n'était pas encore inscrit.",
  },
  {
    q: "Qu'est-ce qu'il me faut comme matériel ?",
    a: "Un téléphone. Pas de caisse à changer, pas de lecteur à acheter, pas de formation. Vous créez votre espace, vous réglez vos récompenses, vous imprimez votre QR.",
  },
  {
    q: "Combien de temps ça prend à la caisse ?",
    a: "Le client donne son numéro ou son code à 4 caractères, vous tapez le montant en dinars, vous validez. Le calcul se fait sur le serveur, à votre taux — ni vous ni votre caissier n'avez de points à calculer.",
  },
  {
    q: "Est-ce que je vois le numéro de téléphone de mes clients ?",
    a: "L'écran de caisse ne l'affiche pas : vos clients y sont identifiés par un code à quatre caractères. Le système, lui, connaît le numéro — c'est la clé de leur registre de points.",
  },
  {
    q: "Et si mon caissier se trompe de montant ?",
    a: "Vous corrigez depuis la fiche du client. La correction s'inscrit dans l'historique au lieu d'effacer la ligne : rien n'est supprimé, donc rien ne peut être maquillé.",
  },
  {
    q: "J'ai déjà une carte en carton. Je dois tout arrêter ?",
    a: "Non, et beaucoup gardent les deux au début. Pointili fait la même chose — une visite, un tampon — sauf que la carte est dans le téléphone du client, qu'elle ne se perd pas, et qu'à la fin du mois vous savez combien de vos clients sont revenus.",
  },
  {
    q: "Mes clients me connaissent déjà. À quoi ça sert ?",
    a: "C'est exactement pour ça que ça marche. Vous connaissez vos habitués ; ce que vous ne savez pas, c'est combien sont revenus ce mois-ci, ni lesquels ont cessé de venir. Pointili met un chiffre là-dessus, sans rien changer à votre façon de les accueillir.",
  },
];

function Check({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

export function Compare() {
  return (
    <>
      {/* ── le comparatif ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-16 md:px-8 md:pb-24">
        <h2 className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.025em] md:text-[38px]">
          Pourquoi Pointili plutôt qu&apos;un carnet ?
        </h2>
        <p className="mt-3 max-w-[54ch] text-[15.5px] leading-relaxed text-white/60">
          La carte en carton a fait tourner des milliers de commerces et elle
          marche encore. Voilà simplement là où elle s&apos;arrête.
        </p>

        {/*
          ── PHONE: one card per row, not a 720px table in a scroller ────────
          The table below is 720px wide, so on a 390px screen it showed roughly
          one and a half columns and asked the reader to swipe sideways to
          compare — which is the one thing a comparison must never make you do.
          Here the three answers stack under the question, and Pointili's is the
          one with the colour and the tick.
        */}
        <ul className="mt-8 space-y-3 md:hidden">
          {ROWS.map((r) => (
            <li key={r.label} className="rounded-[18px] bg-white/[0.03] p-4 ring-1 ring-white/10">
              <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-white/45">
                {r.label}
              </p>

              <div className="mt-3 rounded-xl bg-[#7c3aed]/[0.14] px-3.5 py-3 ring-1 ring-[#7c3aed]/30">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#c4b5fd]">
                  Pointili
                </p>
                <p className="mt-1 flex gap-2 text-[14px] font-semibold leading-snug text-white">
                  <Check className="mt-[3px] h-[13px] w-[13px] shrink-0 text-[#4ade9f]" />
                  {r.us}
                </p>
              </div>

              <div className="mt-2.5 grid gap-2.5">
                {[
                  { who: "Carte en carton", what: r.paper },
                  { who: "Autres plateformes", what: r.other },
                ].map(({ who, what }) => (
                  <div key={who} className="px-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/35">
                      {who}
                    </p>
                    <p className="mt-0.5 text-[13.5px] leading-snug text-white/60">{what}</p>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>

        {/* ── TABLET AND UP: the real table ─────────────────────────────── */}
        <div className="mt-8 hidden overflow-x-auto rounded-[22px] ring-1 ring-white/12 md:block">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="bg-white/[0.04]">
                <th className="p-4 text-[11px] font-bold uppercase tracking-[0.09em] text-white/45" />
                <th className="p-4 text-[13px] font-extrabold text-white">
                  Pointili
                </th>
                <th className="p-4 text-[13px] font-bold text-white/55">
                  Carte en carton
                </th>
                <th className="p-4 text-[13px] font-bold text-white/55">
                  Autres plateformes
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label} className="border-t border-white/10">
                  <td className="p-4 align-top text-[13px] font-bold text-white/50">
                    {r.label}
                  </td>
                  <td className="bg-[#7c3aed]/[0.09] p-4 align-top text-[14px] font-semibold leading-snug text-white">
                    <span className="flex gap-2.5">
                      <Check className="mt-[3px] h-[14px] w-[14px] shrink-0 text-[#4ade9f]" />
                      {r.us}
                    </span>
                  </td>
                  <td className="p-4 align-top text-[14px] leading-snug text-white/55">{r.paper}</td>
                  <td className="p-4 align-top text-[14px] leading-snug text-white/55">{r.other}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12.5px] text-white/35">
          « Autres plateformes » décrit ce qui est courant sur ce marché, pas un
          concurrent en particulier — leurs offres changent, la nôtre aussi.
        </p>
      </section>

      {/* ── les questions ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-16 md:px-8 md:pb-24">
        <h2 className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.025em] md:text-[38px]">
          Les questions qu&apos;on nous pose
        </h2>
        <p className="mt-3 max-w-[54ch] text-[15.5px] leading-relaxed text-white/60">
          Les vraies, celles du comptoir.
        </p>

        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {QA.map(({ q, a }) => (
            /* <details> so a phone shows eight questions instead of four
               screens of answers, and so it works with JavaScript off */
            <details
              key={q}
              className="group rounded-[18px] bg-white/[0.04] px-5 ring-1 ring-white/10 transition open:bg-white/[0.06] open:ring-white/20"
            >
              <summary className="flex cursor-pointer list-none items-start gap-3 py-4 text-[15.5px] font-bold leading-snug marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="mt-[2px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#7c3aed]/25 text-[#c4b5fd] transition group-open:rotate-45">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="h-2.5 w-2.5" aria-hidden>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                <span className="flex-1">{q}</span>
              </summary>
              <p className="pb-5 pl-[30px] text-[14.5px] leading-relaxed text-white/65">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
