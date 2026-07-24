import { redirect } from "next/navigation";
import { ownerCafe } from "@/lib/auth/owner";
import { getLoyaltyProgram } from "@/lib/data";
import { ownerCards } from "@/lib/db";
import { ClientsView } from "./ClientsView";

export const metadata = { title: "Clients" };

/**
 * Card management (§ owner). Every cardholder at this café — searchable, and
 * each one openable to correct points/stamps or read their history. Built to
 * stay usable at hundreds of cards: server-side search + paginated loading.
 */
export default async function Clients() {
  const cafe = await ownerCafe();
  if (!cafe) redirect("/owner/nouveau");

  const [initial, program] = await Promise.all([
    ownerCards(cafe.id, "", 30, 0),
    getLoyaltyProgram(cafe.id),
  ]);

  return (
    <ClientsView
      initial={initial}
      stampsEnabled={program.stampsEnabled}
      stampsRequired={program.stampsRequired}
    />
  );
}
