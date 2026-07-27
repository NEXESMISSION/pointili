import Link from "next/link";
import { redirect } from "next/navigation";
import { currentOwner, ownerCafe } from "@/lib/auth/owner";
import { AuthForm } from "../login/AuthForm";
import { signupAction } from "../login/actions";

export const metadata = { title: "Créer mon compte" };

export default async function Signup() {
  const owner = await currentOwner();
  if (owner) redirect((await ownerCafe()) ? "/" : "/nouveau");

  return (
    <div className="a-card px-6 py-7">
      <h1 className="text-[26px] font-extrabold leading-tight text-white">
        Créez votre compte
      </h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/55">
        Quelques secondes, et vos clients peuvent scanner.
      </p>

      {/* the offer, up front — matches the landing + marketing */}
      <p className="mt-4 rounded-xl bg-white/[0.08] px-3.5 py-2.5 text-[12.5px] font-semibold leading-relaxed text-[#b9a3ff]">
        ✦ 14 jours gratuits — sans carte bancaire.
      </p>

      <div className="mt-5">
        <AuthForm
          action={signupAction}
          cta="Créer mon compte"
          passwordAutoComplete="new-password"
          passwordHint="8 caractères minimum."
        />
      </div>

      <p className="mt-5 text-center text-[13px] text-white/55">
        Déjà un compte ?{" "}
        <Link href="/login" className="font-bold text-[#b9a3ff]">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
