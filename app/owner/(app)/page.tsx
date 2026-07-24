import { redirect } from "next/navigation";
import { ownerCafe } from "@/lib/auth/owner";
import { getLoyaltyProgram } from "@/lib/data";
import { CreditForm, ScanPanel, StampForm, ValidateForm } from "./caisse/CaisseForms";

export const metadata = { title: "Caisse" };

/**
 * The owner's HOME is the Caisse, not Analytics.
 *
 * The caisse is the one thing an owner does every shift — credit a purchase,
 * validate a code. Analytics is a check-occasionally view, and it's also the
 * heaviest page (it aggregates the whole ledger). Leading with it made the app
 * both slower to open and wrong for the daily job. Caisse first.
 */
export default async function OwnerHome() {
  const cafe = await ownerCafe();
  // No café yet → set one up. NOT /owner/login: that would see a valid session
  // and bounce straight back here, forever.
  if (!cafe) redirect("/owner/nouveau");
  const program = await getLoyaltyProgram(cafe.id);

  return (
    <div className="space-y-3.5">
      {/* Lead with the two everyday actions: scan a customer, validate a code. */}
      <ScanPanel stampsEnabled={program.stampsEnabled} />
      <ValidateForm />

      {/* Manual entry is the fallback (no camera / typed number or code), so it's
          tucked behind a toggle to keep the till clean. */}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl border border-hair bg-white px-4 py-3 text-[13.5px] font-bold text-charcoal [&::-webkit-details-marker]:hidden">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-lilac-2 text-[14px]">⌨️</span>
          Saisie manuelle
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto h-4 w-4 text-slate transition-transform group-open:rotate-180" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div className="mt-3 space-y-3.5">
          <CreditForm pointsPerTnd={program.pointsPerTnd} />
          {program.stampsEnabled && <StampForm required={program.stampsRequired} />}
        </div>
      </details>
    </div>
  );
}
