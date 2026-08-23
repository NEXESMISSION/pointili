import { redirect } from "next/navigation";
import { ownerCafe } from "@/lib/auth/owner";
import { guardArea } from "@/lib/auth/staff";
import { getRewards } from "@/lib/data";
import { cafeAvgTicket } from "@/lib/db";
import { RewardsSetup } from "./RewardsSetup";

export const metadata = { title: "Vos récompenses" };

export default async function Recompenses() {
  /*
    Step 2 needs the OPPOSITE guard to step 1: that page is for an owner with no
    café, this one is for an owner who has just made one. Someone who lands here
    without a café gets sent to make one.
  */
  const cafe = await ownerCafe();
  if (!cafe) redirect("/owner/nouveau");
  /*
    AND THE SAME ROLE AS RéGLAGES. This screen prices every reward in the shop,
    and it lives OUTSIDE the layout that renders the staff gate — so without
    this line a cashier could reach the reward editor by typing the address,
    long after the signup it was built for.
  */
  await guardArea(cafe.id, "reglages");

  // Rewards are priced in visits now; a brand-new café has no sales, so this
  // returns the platform yardstick and the screen says so.
  const [rewards, ticket] = await Promise.all([getRewards(cafe.id), cafeAvgTicket(cafe.id)]);

  return (
    <div>
      <p className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate">◆ Étape 2 sur 2</p>
      <h1 className="mt-1 font-display text-[30px] leading-tight">
        Vos récompenses
      </h1>
      <p className="mt-1.5 mb-5 text-[15px] leading-relaxed text-slate">
        Ce que vos clients gagnent en revenant. On vous en a déjà mis
        quelques-unes — changez les mots, réglez le nombre de visites, videz une
        ligne pour la retirer.
      </p>

      <RewardsSetup
        seeded={rewards.map((r) => ({ id: r.id, label: r.label, pointsCost: r.pointsCost }))}
        ticket={ticket}
        businessType={cafe.businessType}
      />
    </div>
  );
}
