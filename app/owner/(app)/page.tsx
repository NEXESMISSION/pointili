import { redirect } from "next/navigation";
import { ownerCafe } from "@/lib/auth/owner";
import { getLoyaltyProgram } from "@/lib/data";
import { CaisseDesk } from "./caisse/CaisseForms";

export const metadata = { title: "Caisse" };

/**
 * The owner's HOME is the Caisse — the one thing they do every shift.
 *
 * It behaves like a terminal, not a page: two modes (a client, or a code), the
 * camera live by default, a keypad when it isn't, and the identified customer
 * taking over the whole screen so it stays readable at arm's length. The old
 * separate "Clients" page folded in here as the recents strip.
 */
export default async function OwnerHome() {
  const cafe = await ownerCafe();
  // No café yet → set one up. NOT /owner/login: that would see a valid session
  // and bounce straight back here, forever.
  if (!cafe) redirect("/nouveau");
  const program = await getLoyaltyProgram(cafe.id);

  return (
    <CaisseDesk
      pointsPerTnd={program.pointsPerTnd}
      stampsEnabled={program.stampsEnabled}
      stampsRequired={program.stampsRequired}
    />
  );
}
