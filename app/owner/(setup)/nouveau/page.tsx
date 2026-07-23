import { redirect } from "next/navigation";
import { ownerCafe } from "@/lib/auth/owner";
import { CreateCafeForm } from "./CreateCafeForm";

export const metadata = { title: "Créer mon café" };

export default async function NouveauCafe() {
  // Already has one → nothing to set up.
  if (await ownerCafe()) redirect("/owner");

  return (
    <div>
      <p className="ticket-label">◆ Dernière étape</p>
      <h1 className="mt-1 font-display text-[30px] leading-tight">
        Créez votre café
      </h1>
      <p className="mt-1.5 mb-5 text-[14px] leading-relaxed text-ink2">
        On vous prépare tout : points, récompenses et la roue. Vous pourrez
        changer chaque réglage ensuite.
      </p>

      <CreateCafeForm />
    </div>
  );
}
