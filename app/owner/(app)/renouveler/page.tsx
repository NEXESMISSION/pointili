import { redirect } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { currentOwner, ownerCafe, ownerHome } from "@/lib/auth/owner";
import { guardArea } from "@/lib/auth/staff";
import { REQUEST_STATUS, tnd } from "@/lib/billing";
import { pickMethod, pickOffer, platformSettings } from "@/lib/settings";
import { myRenewals, remaining } from "@/lib/platform";
import { RenewForm } from "./RenewForm";

export const metadata = { title: "Renouveler" };
export const dynamic = "force-dynamic";

/**
 * RENOUVELER MON ABONNEMENT.
 *
 * There is no card payment here and there should not be one yet: shops in
 * Tunisia pay by D17, by Flouci or by transfer, and a Stripe checkout would
 * serve a market this product does not have. What an owner needs is the total,
 * the account to send it to, and a way to prove they sent it. What the operator
 * needs is that proof attached to a shop, an amount and a date — instead of a
 * photograph in a WhatsApp thread.
 *
 * So this screen is: pick the offer → see the total → pay → photograph the
 * receipt → send. The console does the rest (see admin_decide_renewal, which is
 * what actually extends the plan).
 */
export default async function Renouveler() {
  const [owner, cafe, settings] = await Promise.all([
    currentOwner(),
    ownerCafe(),
    platformSettings(),
  ]);
  if (!cafe || !owner) redirect(await ownerHome());
  /* Roles: a cashier does not open this one. Enforced here AND in every action
     behind it — a server action is a public endpoint (lib/auth/staff). */
  await guardArea(cafe.id, "reglages");


  const requests = await myRenewals(owner.id, cafe.id);
  const pending = requests.find((r) => r.status === "pending") ?? null;
  const left = remaining(cafe.planExpiresAt);

  return (
    <div className="space-y-4">
      <div className="px-1 md:hidden">
        <BackLink fallback="/owner/reglages" exact />
      </div>

      <header className="px-1">
        <h1 className="text-[24px] font-extrabold leading-tight text-charcoal">
          Renouveler mon abonnement
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-slate">
          {left.expired
            ? "Votre abonnement a expiré. Vos clients et leurs points sont intacts — il suffit de rallumer."
            : `Votre abonnement court ${left.label.toLowerCase()}. Renouveler ajoute la durée choisie à la fin, jamais à partir d'aujourd'hui.`}
        </p>
      </header>

      {pending ? (
        /*
          A REQUEST IN FLIGHT REPLACES THE FORM.

          Sending twice is the one mistake this screen invites: nothing visibly
          happens after a transfer, so an anxious owner sends the same receipt
          again. The database refuses a second pending row (0035) — this is the
          same rule, said before they try rather than after.
        */
        <section className="a-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate">
            Demande envoyée
          </p>
          <p className="mt-2 text-[15px] font-bold text-charcoal">
            {pickOffer(settings, pending.offer)?.label ?? pending.offer} ·{" "}
            {tnd(pending.amount)} ·{" "}
            {pickMethod(settings, pending.method)?.label ?? pending.method}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate">
            Reçue le{" "}
            {new Date(pending.createdAt).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
            . On vérifie le paiement et votre compte est prolongé — vous n&apos;avez
            rien d&apos;autre à faire.
          </p>
          <p className="mt-3 inline-flex rounded-full bg-[#a06e00]/12 px-3 py-1 text-[12px] font-bold text-[#a06e00]">
            {REQUEST_STATUS.pending.label}
          </p>
        </section>
      ) : (
        <RenewForm
          offers={settings.offers}
          methods={settings.methods}
          paymentsLive={settings.paymentsLive}
        />
      )}

      {/* what happened before — short, and only if there is anything */}
      {requests.filter((r) => r.status !== "pending").length > 0 && (
        <section>
          <h2 className="mb-1.5 px-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate">
            Mes demandes
          </h2>
          <ul className="a-card divide-y divide-[var(--o-edge)] overflow-hidden">
            {requests
              .filter((r) => r.status !== "pending")
              .map((r) => {
                const s = REQUEST_STATUS[r.status];
                return (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-charcoal">
                        {pickOffer(settings, r.offer)?.label ?? r.offer} · {tnd(r.amount)}
                      </span>
                      <span className="block text-[11.5px] text-slate">
                        {new Date(r.createdAt).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "long",
                        })}
                        {r.decidedNote ? ` · ${r.decidedNote}` : ""}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        s.tone === "ok"
                          ? "bg-ok/10 text-[#2f9e6e]"
                          : "bg-[#e5484d]/12 text-[#e5484d]"
                      }`}
                    >
                      {s.label}
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>
      )}
    </div>
  );
}
