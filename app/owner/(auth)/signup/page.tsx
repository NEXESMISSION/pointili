import Link from "next/link";
import { redirect } from "next/navigation";
import { currentOwner, ownerCafe } from "@/lib/auth/owner";
import { AuthForm } from "../login/AuthForm";
import { signupAction } from "../login/actions";

export const metadata = { title: "Créer mon café" };

export default async function Signup() {
  const owner = await currentOwner();
  if (owner) redirect((await ownerCafe()) ? "/owner" : "/owner/nouveau");

  return (
    <div>
      <h1 className="font-display text-[30px] font-black leading-tight text-ink">
        Créer mon café
      </h1>
      <p className="mt-1 mb-5 text-[14px] text-ink2">
        Quelques secondes, et vos clients peuvent scanner.
      </p>

      <AuthForm action={signupAction} cta="Créer mon compte" />

      <p className="mt-4 text-center text-[13px] text-mut">
        Déjà un compte ?{" "}
        <Link href="/owner/login" className="font-bold text-brand">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
