import { platformSettings } from "@/lib/settings";
import { PageHead, Section } from "../ui";
import { SettingsForm } from "./SettingsForm";

export const metadata = { title: "Réglages" };

/**
 * THE PLATFORM'S OWN SETTINGS.
 *
 * Everything else in this console is about a shop, a customer or a lead. This
 * page is about US: what we charge, where the money is sent, and whether we are
 * actually taking any yet.
 *
 * ── WHY IT EXISTS ─────────────────────────────────────────────────────────
 *
 * All of it lived in lib/billing.ts as constants, behind a flag whose own
 * comment read: "To go live: put the real values below and set PLACEHOLDER to
 * false." So starting to take money was a source change, a build and a deploy —
 * and until somebody did that, every shop that reached the renewal screen was
 * shown a RIB of all zeroes with a warning banner over it. A bank account
 * number is operational data. It changes when a bank changes, not when the
 * software does.
 *
 * ── AND THE FLAG IS SEPARATE FROM THE VALUES, ON PURPOSE ──────────────────
 *
 * "Are the coordinates filled in?" is not the same question as "are these real?"
 * Somebody halfway through typing a RIB has filled it in. The go-live switch is
 * its own deliberate act, and until it is thrown every screen that prints these
 * numbers says out loud that they are not real yet.
 */
export default async function SettingsPage() {
  const s = await platformSettings();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead
        title="Réglages de la plateforme"
        context={
          s.usingFallback
            ? "Valeurs par défaut du code — rien n'a encore été enregistré ici."
            : `${s.offers.length} offre${s.offers.length === 1 ? "" : "s"} · ${
                s.methods.length
              } moyen${s.methods.length === 1 ? "" : "s"} de paiement.`
        }
      />

      {/*
        The state of the whole page, said before the form. An operator who opens
        this screen is asking exactly one question first — "are we live?" — and
        it should not require reading a checkbox halfway down.
      */}
      <div
        className={`mb-5 rounded-[14px] border px-4 py-3.5 ${
          s.paymentsLive
            ? "border-[#bfe4d1] bg-[#e7f6ee]"
            : "border-[#f0d9a6] bg-[#fdf3dd]"
        }`}
      >
        <p className={`text-[13.5px] font-bold ${s.paymentsLive ? "text-[#1f7a52]" : "text-[#8a5a00]"}`}>
          {s.paymentsLive
            ? "Les paiements sont en direct."
            : "Mode test — les coordonnées ne sont pas réelles."}
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-charcoal/70">
          {s.paymentsLive
            ? "Les cafés voient les coordonnées ci-dessous et peuvent envoyer un vrai virement. Vérifiez-les avant chaque changement de banque."
            : "L'écran de renouvellement affiche un avertissement au-dessus de chaque numéro, pour que personne n'envoie 120 TND à un RIB d'exemple."}
        </p>
      </div>

      {s.usingFallback && (
        <p className="mb-5 text-[12px] leading-relaxed text-slate">
          Ces valeurs viennent encore de <span className="k-num">lib/billing.ts</span>,
          c&apos;est-à-dire de ce qui a été déployé. Le premier enregistrement fait
          basculer la plateforme sur cette page — le code ne sera plus consulté.
        </p>
      )}

      <Section title="Ce que la plateforme facture">
        <SettingsForm settings={s} />
      </Section>
    </div>
  );
}
