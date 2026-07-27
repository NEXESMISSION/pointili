import { redirect } from "next/navigation";
import { ownerCafe } from "@/lib/auth/owner";
import { getLoyaltyProgram } from "@/lib/data";
import { CaisseDesk } from "./caisse/CaisseForms";

export const metadata = { title: "Caisse" };

/**
 * The owner's HOME is the Caisse — the one thing they do every shift.
 *
 * Everything the till needs is on this single screen, nothing behind an
 * accordion: find the customer (scan / type / pick from the list), then credit,
 * stamp, correct or read their history in the same panel. Validating a reward
 * code sits just below. The old separate "Clients" page folded in here.
 */
export default async function OwnerHome() {
  const cafe = await ownerCafe();
  // No café yet → set one up. NOT /owner/login: that would see a valid session
  // and bounce straight back here, forever.
  if (!cafe) redirect("/owner/nouveau");
  const program = await getLoyaltyProgram(cafe.id);

  return (
    <CaisseDesk
      pointsPerTnd={program.pointsPerTnd}
      stampsEnabled={program.stampsEnabled}
      stampsRequired={program.stampsRequired}
    />
  );
}
