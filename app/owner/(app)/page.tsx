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
      <ScanPanel stampsEnabled={program.stampsEnabled} />
      <CreditForm pointsPerTnd={program.pointsPerTnd} />
      {program.stampsEnabled && <StampForm required={program.stampsRequired} />}
      <ValidateForm />
    </div>
  );
}
