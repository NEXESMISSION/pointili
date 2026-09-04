import { redirect } from "next/navigation";
import { ownerCafe, ownerHome } from "@/lib/auth/owner";
import { getLoyaltyProgram } from "@/lib/data";
import { activePointsMultiplier, ownerToday } from "@/lib/db";
import { CaisseDesk } from "./caisse/CaisseForms";
import { Today } from "./caisse/Today";

export const metadata = { title: "Caisse" };

/**
 * The owner's HOME is the Caisse — the one thing they do every shift.
 *
 * It behaves like a terminal, not a page: the camera on demand, the client
 * field and the voucher field both present, and the identified customer taking
 * over the whole screen so it stays readable at arm's length.
 *
 * ── AND, ON A LAPTOP, THE DAY BESIDE IT ───────────────────────────────────
 *
 * The till is a phone-shaped tool and it should stay one. What it should not be
 * is a phone-shaped tool alone in the middle of a 1900px screen — which is what
 * an owner opening their own admin on a laptop actually saw: two small cards
 * and two thirds of the display carrying nothing.
 *
 * So the width that the till does not want goes to the thing the till could
 * never say: how the shift is going. Takings, passages, new cards, and the last
 * twelve operations at this counter — the four numbers an owner checks at six
 * in the evening, which until now required leaving the till, opening the
 * customers screen and doing arithmetic on a seven-day window.
 *
 * The QR that used to sit here has its own tab now. It creates every card in
 * the shop; it was a line at the bottom of one screen.
 */
export default async function OwnerHome() {
  const cafe = await ownerCafe();
  // No café yet → set one up. NOT /owner/login: that would see a valid session
  // and bounce straight back here, forever.
  if (!cafe) redirect(await ownerHome());

  const [program, day, multiplier] = await Promise.all([
    getLoyaltyProgram(cafe.id),
    ownerToday(cafe.id),
    /* The till previews the points BEFORE it knows the customer now, and an
       active "points doublés" event is the one thing that would make that
       preview a lie. It is shop-wide, so it is knowable here. */
    activePointsMultiplier(cafe.id),
  ]);

  /* Who is on the till, so the screen can offer them the way out. Null unless
     the shop asked to be told (0048). */

  return (
    <CaisseDesk
      pointsPerTnd={program.pointsPerTnd}
      multiplier={multiplier}
      stampsEnabled={program.stampsEnabled}
      stampsRequired={program.stampsRequired}
      /* Rendered here and handed down: CaisseDesk is a Client Component and
         these figures are a server read. */
      today={<Today day={day} pointsPerTnd={program.pointsPerTnd} />}
    />
  );
}
