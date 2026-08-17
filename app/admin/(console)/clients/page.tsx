import Link from "next/link";
import { findDiners, platformStats } from "@/lib/platform";
import { ago, day, Empty, PageHead, Section } from "../ui";

export const metadata = { title: "Clients" };

/**
 * THE PERSON WHO WAS INVISIBLE.
 *
 * "J'ai perdu mes points", "je n'arrive plus à me connecter", "mon code ne
 * marche pas" — the console could not so much as FIND the person writing any of
 * those. It knew about cafés; a customer existed only as an anonymised count on
 * a shop's page. Every one of those messages ended with somebody querying the
 * database by hand.
 *
 * ── A SEARCH BOX, NOT A LIST ──────────────────────────────────────────────
 *
 * There is no "all customers" page and there should not be. Two hundred and
 * sixty people hold cards today and the number is supposed to grow; a paginated
 * directory of them is a screen nobody has a reason to open and a very good way
 * to leave a list of Tunisian phone numbers on an unattended laptop. You arrive
 * here with a name, a number or a code, because you are already in a
 * conversation with one person.
 *
 * The search runs on the SERVER through ?q=, so it is a real address: the result
 * of a lookup can be sent to somebody, and the back button works after opening
 * a customer. That also means no phone number is ever held in browser state.
 */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const [hits, stats] = await Promise.all([
    query ? findDiners(query, 40) : Promise.resolve([]),
    platformStats(),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead
        title="Clients"
        context={`${stats.diners.toLocaleString("fr-FR")} cartes créées sur la plateforme.`}
      />

      {/* A GET form: the query lands in the address bar, which is what makes a
          result linkable and the back button behave. */}
      <form method="GET" className="mb-5 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={query}
          autoFocus
          placeholder="Numéro, code à 4 caractères, nom…"
          className="k-field w-full min-w-[220px] flex-1"
          aria-label="Chercher un client"
        />
        <button type="submit" className="k-btn">
          Chercher
        </button>
      </form>

      {!query ? (
        <Empty>
          Cherchez par numéro de téléphone (même partiel), par le code à quatre
          caractères que le client lit sur sa carte, par son identifiant, ou par son
          prénom. Il n&apos;y a pas de liste complète : on ouvre une fiche parce
          qu&apos;on parle déjà à quelqu&apos;un.
        </Empty>
      ) : hits.length === 0 ? (
        <Empty>
          Aucun client ne correspond à « {query} ». Un numéro se cherche aussi par ses
          derniers chiffres.
        </Empty>
      ) : (
        <Section title={`${hits.length} résultat${hits.length === 1 ? "" : "s"}`}>
          <ul className="space-y-2">
            {hits.map((h) => (
              <li key={h.publicId}>
                <Link href={`/admin/clients/${h.publicId}`} className="k-card block px-4 py-3">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-[14px] font-bold text-charcoal">
                      {h.name || "Sans prénom"}
                    </span>
                    {/* The code is what the customer reads to a cashier, so it is
                        the thing they will quote on the phone. */}
                    <span className="k-num rounded bg-[var(--o-inset)] px-1.5 py-0.5 text-[11px] font-bold text-royal">
                      {h.code}
                    </span>
                    <span className="k-num text-[11.5px] text-slate" dir="ltr">
                      {h.phoneMasked}
                    </span>
                    <span className="ms-auto text-[11.5px] text-slate">{ago(h.lastSeen)}</span>
                  </span>
                  <span className="k-num mt-1 flex flex-wrap gap-x-2 text-[11.5px] text-slate">
                    <span>
                      {h.shops} carte{h.shops === 1 ? "" : "s"}
                    </span>
                    <span className="text-slate/40">·</span>
                    <span>{Math.round(h.points)} points</span>
                    <span className="text-slate/40">·</span>
                    <span>depuis {day(h.createdAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p className="mt-6 text-[11px] leading-relaxed text-slate/70">
        Les numéros sont masqués dans les résultats. La fiche d&apos;un client, elle,
        affiche le numéro complet : on l&apos;ouvre pour rappeler quelqu&apos;un.
      </p>
    </div>
  );
}
