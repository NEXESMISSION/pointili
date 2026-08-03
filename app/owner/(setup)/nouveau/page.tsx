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
      <p className="block text-[10px] font-bold uppercase tracking-[0.1em] text-white/45">◆ Étape 1 sur 2</p>
      <h1 className="mt-1 font-display text-[30px] leading-tight">
        Votre carte
      </h1>
      <p className="mt-1.5 mb-5 text-[15px] leading-relaxed text-white/55">
        C&apos;est ce que vos clients verront sur leur téléphone. Tout se change
        ensuite.
      </p>

      <CreateCafeForm />
    </div>
  );
}
