import Link from "next/link";
import { H1, H2, P, UL, LI } from "../layout";

export const metadata = {
  title: "Conditions",
  description:
    "Ce que Pointili fait, ce qu'il ne fait pas, ce qu'il coûte, et ce qui se passe si vous arrêtez.",
};

/**
 * Written from the code. Every number and every behaviour here is what the
 * software actually does — the 14-day trial is in create_cafe(), the prices are
 * the ones in Réglages, and "rien ne s'efface" is true because no cron, no
 * scheduled task and no DELETE on the ledger exists anywhere in the product.
 */
export default function Conditions() {
  return (
    <>
      <H1 sub="Dernière mise à jour : juillet 2026">Conditions d&apos;utilisation</H1>

      <P>
        En clair, et sans article numéroté : voici ce que Pointili fait, ce
        qu&apos;il ne fait pas, et ce qui se passe si vous arrêtez.
      </P>

      <H2>Ce que c&apos;est</H2>
      <P>
        Un programme de fidélité pour votre commerce. Vous posez un QR code, vos
        clients le scannent et ouvrent une carte dans leur navigateur, vous
        créditez des points à la caisse, ils les échangent contre les
        récompenses que vous avez définies.
      </P>
      <P>
        Vous décidez de tout ce qui compte : combien de points par dinar, le
        bonus de bienvenue, la liste des récompenses et leur coût, les cartes à
        tampons, la durée de validité des codes.
      </P>

      <H2>Ce que ça ne fait pas</H2>
      <UL>
        <LI>
          <b className="text-white">Ça ne fait revenir personne tout seul.</b> Il
          n&apos;y a ni SMS, ni notification, ni relance. Pointili compte vos
          clients fidèles ; il ne les rappelle pas.
        </LI>
        <LI>
          <b className="text-white">Ce n&apos;est branché sur aucune caisse.</b>{" "}
          Créditer est un geste de plus à chaque vente. Si votre équipe ne le
          fait pas, il ne se passe rien.
        </LI>
        <LI>
          <b className="text-white">Il n&apos;y a qu&apos;un identifiant par
          commerce.</b> Pas encore de compte séparé par serveur.
        </LI>
      </UL>

      <H2>Le prix</H2>
      <P>
        <b className="text-white">65 TND</b> pour six mois,{" "}
        <b className="text-white">80 TND</b> pour un an. Tout est compris :
        points, récompenses, tampons, analyses, kit d&apos;impression. Pas de
        commission sur vos ventes, et aucune limite — quatre clients ou quatre
        cents, c&apos;est le même prix.
      </P>

      <H2>L&apos;essai</H2>
      <P>
        Quatorze jours, complets, sans carte bancaire. Au bout de quatorze jours
        la boutique s&apos;éteint d&apos;elle-même si vous n&apos;avez pas pris
        d&apos;abonnement. Ce n&apos;est pas une formule commerciale : c&apos;est
        littéralement ce que fait le logiciel.
      </P>

      <H2>Comment on encaisse</H2>
      <P>
        Il n&apos;y a aucun paiement en ligne. Pas de carte bancaire enregistrée,
        pas de prélèvement, rien à résilier. Vous nous écrivez, vous réglez comme
        vous voulez, et nous activons votre compte. Aucun compte ne peut être
        débité automatiquement, parce qu&apos;il n&apos;existe rien pour le
        faire.
      </P>
      <P>
        Si vous renouvelez en avance, vous ne perdez rien : la nouvelle période
        démarre à votre date d&apos;expiration, pas au jour du paiement.
      </P>

      <H2>Si vous arrêtez</H2>
      <P>
        Votre boutique s&apos;éteint. Vos clients voient « Momentanément fermé »
        et ne peuvent plus gagner ni échanger de points chez vous.
      </P>
      <P>
        <b className="text-white">Rien n&apos;est effacé.</b> Les soldes de vos
        clients restent exactement où ils étaient, et ils sont là le jour où vous
        rallumez. Aucune tâche automatique ne supprime quoi que ce soit.
      </P>
      <P>
        Une réserve honnête : une carte à tampons <i>en cours</i> peut repartir
        de zéro si vous lui avez réglé une durée de validité. Les points, eux, ne
        s&apos;effacent jamais.
      </P>

      <H2>Vos clients sont à vous</H2>
      <P>
        Nous ne les contactons pas, nous ne leur vendons rien, et nous ne
        vendons pas leurs données. Voir la{" "}
        <Link href="/confidentialite" className="font-semibold text-[#a78bfa] underline underline-offset-2">
          page confidentialité
        </Link>
        , qui dit exactement ce qui est stocké.
      </P>
      <P>
        Un client Pointili a un seul code, valable dans tous les commerces qui
        utilisent Pointili. Cela veut dire que le vôtre marche aussi ailleurs, et
        que celui d&apos;ailleurs marche chez vous : le jour où vous posez votre
        QR, une partie de vos clients a déjà une carte. Les points, eux, ne
        circulent pas — chaque solde appartient à un seul commerce.
      </P>

      <H2>Ce qu&apos;on attend de vous</H2>
      <UL>
        <LI>Honorer les récompenses que vous affichez.</LI>
        <LI>
          Ne pas créditer de points contre autre chose qu&apos;un achat réel.
        </LI>
        <LI>Garder votre identifiant pour vous et votre équipe.</LI>
      </UL>
      <P>
        Nous pouvons suspendre un commerce qui ne respecte pas cela, ou dont
        l&apos;abonnement a expiré. Une suspension coupe l&apos;accès
        immédiatement ; elle n&apos;efface rien.
      </P>

      <H2>Le service</H2>
      <P>
        Pointili est un jeune produit, développé en Tunisie. Nous ne promettons
        pas une disponibilité parfaite et nous ne vous ferons pas signer un
        engagement de service que nous ne pourrions pas tenir. Si quelque chose
        casse, écrivez-nous — c&apos;est une petite équipe, et vous parlerez à
        quelqu&apos;un qui peut le réparer.
      </P>

      <H2>Nous écrire</H2>
      <P>
        {/*
          A real address goes here and nothing else. A placeholder on a contact
          line is worse than an absent one: it looks like a business you can
          reach, and it is not.
        */}
        Les coordonnées de contact seront publiées ici avant l&apos;ouverture des
        inscriptions.
      </P>
    </>
  );
}
