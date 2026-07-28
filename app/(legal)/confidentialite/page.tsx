import Link from "next/link";
import { H1, H2, P, UL, LI } from "../layout";

export const metadata = {
  title: "Confidentialité",
  description:
    "Ce que Pointili collecte, pourquoi, où c'est stocké et qui peut le voir. Un numéro de téléphone et un code chiffré — rien d'autre.",
};

/**
 * Written from the code, not from a template.
 *
 * Every claim here is checkable in the repo: the columns of `accounts`, the
 * seven dependencies in package.json, the cookie flags in lib/auth/diner.ts,
 * the database region. If any of that changes, this page changes with it —
 * a privacy page that drifts from the software is worse than none.
 */
export default function Confidentialite() {
  return (
    <>
      <H1 sub="Dernière mise à jour : juillet 2026">Confidentialité</H1>

      <P>
        Pointili est une carte de fidélité. Pour qu&apos;elle fonctionne, il faut
        pouvoir vous reconnaître d&apos;une visite à l&apos;autre — c&apos;est la
        seule raison pour laquelle nous gardons quoi que ce soit.
      </P>

      <H2>Ce que nous gardons sur un client</H2>
      <P>Trois choses, et c&apos;est tout :</P>
      <UL>
        <LI>
          <b className="text-white">Votre numéro de téléphone.</b> C&apos;est ce
          qui relie vos points à vous.
        </LI>
        <LI>
          <b className="text-white">Votre code secret, chiffré.</b> Il est passé
          par une fonction à sens unique (scrypt) avant d&apos;être stocké. Nous
          ne pouvons pas le lire, et personne chez nous ne peut vous le rappeler
          — c&apos;est pour ça qu&apos;un commerçant peut vous en donner un
          nouveau, mais jamais retrouver l&apos;ancien.
        </LI>
        <LI>
          <b className="text-white">Votre prénom, si vous le donnez.</b> Il est
          facultatif. Sans lui, le comptoir voit vos quatre caractères.
        </LI>
      </UL>
      <P>
        Pas d&apos;e-mail. Pas d&apos;adresse. Pas de date de naissance. Pas de
        carte bancaire — il n&apos;existe aucun paiement en ligne dans Pointili,
        donc aucune donnée bancaire ne peut y entrer.
      </P>
      <P>
        À cela s&apos;ajoute votre activité dans les commerces où vous avez une
        carte : les points crédités, les récompenses échangées, les tampons. Ces
        lignes appartiennent au commerce concerné.
      </P>

      <H2>Ce que le commerçant voit</H2>
      <P>
        Chez lui, vous êtes un prénom (ou vos quatre caractères) et un solde. Il
        voit votre historique <i>dans son commerce</i> : ce que vous y avez
        gagné et échangé.
      </P>
      <P>
        Il ne voit pas ce que vous faites ailleurs. Un commerce ne peut pas lire
        les points d&apos;un autre, même si vous utilisez le même code partout.
      </P>
      <P>
        Pour être exact : le système connaît votre numéro, puisque c&apos;est la
        clé de vos points, et le commerçant peut vous retrouver en le tapant.
        Mais le comptoir n&apos;a pas besoin de vous le demander — vos quatre
        caractères suffisent, et c&apos;est la raison pour laquelle ils existent.
      </P>

      <H2>Ce que nous ne faisons pas</H2>
      <UL>
        <LI>Nous ne vendons rien à personne.</LI>
        <LI>
          Nous n&apos;envoyons ni SMS ni e-mail publicitaire. Le produit
          n&apos;a aucun mécanisme pour vous écrire.
        </LI>
        <LI>
          Nous n&apos;utilisons aucun traqueur, aucune régie publicitaire, aucun
          outil d&apos;analyse tiers. Le site tourne avec sept bibliothèques, et
          aucune ne sert à ça.
        </LI>
        <LI>Nous ne suivons pas votre position.</LI>
      </UL>

      <H2>Les cookies</H2>
      <P>
        Un seul, <span className="font-mono text-[13.5px] text-white/80">pointili_diner</span>.
        Il contient un jeton signé qui dit « cette personne est ce numéro », il
        est <i>httpOnly</i> — donc illisible par le JavaScript de la page — et il
        dure 90 jours. C&apos;est ce qui vous évite de retaper votre code à
        chaque visite. Aucun cookie publicitaire, donc aucune bannière à cliquer.
      </P>

      <H2>Où c&apos;est stocké</H2>
      <P>
        Sur Supabase, dans un centre de données en Suisse (Zurich). Les
        connexions sont chiffrées.
      </P>

      <H2>Combien de temps</H2>
      <P>
        Tant que votre compte existe. Rien ne s&apos;efface tout seul : si un
        commerce arrête son abonnement, vos points y restent tels quels, et ils
        sont là le jour où il revient.
      </P>

      <H2>Effacer votre compte</H2>
      <P>
        Écrivez-nous et nous supprimons votre compte, vos points et votre
        historique. Il n&apos;y a pas encore de bouton pour le faire vous-même :
        nous préférons le dire que le laisser croire.
      </P>

      <H2>Pour un commerçant</H2>
      <P>
        Nous gardons votre e-mail, votre mot de passe chiffré (par Supabase
        Auth), et ce qui décrit votre commerce : nom, adresse de votre carte,
        logo, type, et vos réglages de fidélité. Les clients de votre commerce
        sont les vôtres — nous ne les contactons jamais.
      </P>

      <H2>Nous écrire</H2>
      <P>
        Pour une question, une correction ou une suppression :{" "}
        <Link href="/conditions" className="font-semibold text-[#a78bfa] underline underline-offset-2">
          voir les conditions
        </Link>{" "}
        pour nos coordonnées.
      </P>
    </>
  );
}
