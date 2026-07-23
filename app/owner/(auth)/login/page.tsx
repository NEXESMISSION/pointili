import Link from "next/link";
import { redirect } from "next/navigation";
import { currentOwner, ownerCafe, supabaseConfigured } from "@/lib/auth/owner";
import { AuthForm } from "./AuthForm";
import { loginAction } from "./actions";

export const metadata = { title: "Connexion" };

export default async function Login() {
  // Send an already-signed-in owner where they can actually land: /owner is
  // café-gated, so an owner without one must go to setup — otherwise the two
  // pages bounce off each other forever.
  const owner = await currentOwner();
  if (owner) redirect((await ownerCafe()) ? "/owner" : "/owner/nouveau");
  const configured = supabaseConfigured();

  return (
    <div>
      <h1 className="font-display text-[30px] font-black leading-tight text-ink">
        Espace café
      </h1>
      <p className="mt-1 mb-5 text-[14px] text-ink2">
        Gérez votre programme, votre caisse et vos jeux.
      </p>

      {!configured && (
        <p className="mb-4 rounded-xl bg-gold-soft px-3 py-2.5 text-[12px] leading-relaxed text-gold">
          Supabase n&apos;est pas encore configuré. En développement, l&apos;espace
          café est accessible sans connexion —{" "}
          <Link href="/owner" className="font-bold underline">
            entrer directement
          </Link>
          .
        </p>
      )}

      <AuthForm action={loginAction} cta="Se connecter" />

      <p className="mt-4 text-center text-[13px] text-mut">
        Pas encore de café ?{" "}
        <Link href="/owner/signup" className="font-bold text-brand">
          Créer un compte
        </Link>
      </p>
    </div>
  );
}
