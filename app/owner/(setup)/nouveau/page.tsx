import { redirect } from "next/navigation";
import { ownerHome } from "@/lib/auth/owner";
import { CreateCafeForm } from "./CreateCafeForm";

export const metadata = { title: "Créer mon café" };

export default async function NouveauCafe() {
  /*
    Only a shop owner with no café belongs here. Anyone else is sent where they
    actually belong — a café they already own, or, for a platform operator, the
    console. A super-admin used to be trapped on this form with no way out but
    to create a junk café.
  */
  const home = await ownerHome();
  if (home !== "/owner/nouveau") redirect(home);

  return (
    <div>
      <p className="block text-[10px] font-bold uppercase tracking-[0.1em] text-white/45">◆ Dernière étape</p>
      <h1 className="mt-1 font-display text-[30px] leading-tight">
        Créez votre café
      </h1>
      <p className="mt-1.5 mb-5 text-[14px] leading-relaxed text-white/55">
        On vous prépare tout : les points et les récompenses. Vous pourrez
        changer chaque réglage ensuite.
      </p>

      <CreateCafeForm />
    </div>
  );
}
