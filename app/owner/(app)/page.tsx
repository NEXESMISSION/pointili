import { redirect } from "next/navigation";
import { ownerCafe } from "@/lib/auth/owner";
import { getLoyaltyProgram } from "@/lib/data";
import { CreditForm, ValidateForm } from "./caisse/CaisseForms";

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
    <div className="space-y-4">
      <div>
        <h1 className="text-[26px] font-extrabold text-charcoal">Caisse</h1>
        <p className="text-[13px] text-slate">{cafe.name}</p>
      </div>

      <CreditForm pointsPerTnd={program.pointsPerTnd} />
      <ValidateForm />
    </div>
  );
}
