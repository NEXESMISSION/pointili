import Link from "next/link";
import { redirect } from "next/navigation";
import { currentOwner, ownerCafe, supabaseConfigured } from "@/lib/auth/owner";
import { AuthForm } from "./AuthForm";
import { loginAction } from "./actions";

export const metadata = { title: "Connexion" };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ lien?: string }>;
}) {
  // Send an already-signed-in owner where they can actually land: /owner is
  // café-gated, so an owner without one must go to setup — otherwise the two
  // pages bounce off each other forever.
  const owner = await currentOwner();
  if (owner) redirect((await ownerCafe()) ? "/owner" : "/owner/nouveau");
  const configured = supabaseConfigured();
  const { lien } = await searchParams;

  return (
    <div className="a-card px-6 py-7">
      <h1 className="text-[26px] font-extrabold leading-tight text-white">
        Bon retour 👋
      </h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/55">
        Connectez-vous pour gérer vos points, votre caisse et vos récompenses.
      </p>

      {/*
        /auth/callback sends ?lien=expire here when a confirmation link has
        already been used or has run out. It has always sent it; nothing ever
        rendered it, so the owner just saw a bare login form and no reason why
        their click did nothing.
      */}
      {lien === "expire" && (
        <p className="mt-4 rounded-xl bg-[#ffd27a]/12 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#ffd27a]">
          Ce lien de confirmation a expiré ou a déjà été utilisé. Connectez-vous
          ci-dessous — si le compte n&apos;est pas encore confirmé, créez-le à
          nouveau pour recevoir un nouveau lien.
        </p>
      )}

      {!configured && (
        <p className="mt-4 rounded-xl bg-[#ffd27a]/12 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#ffd27a]">
          Supabase n&apos;est pas encore configuré. En développement, l&apos;espace
          est accessible sans connexion —{" "}
          {/* /owner, not "/". This used to work only because the proxy mapped
              "/" onto the till on the app host; on one domain "/" is the sales
              page and the link silently meant the opposite of what it says. */}
          <Link href="/owner" className="font-bold underline">
            entrer directement
          </Link>
          .
        </p>
      )}

      <div className="mt-5">
        <AuthForm action={loginAction} cta="Se connecter" />
      </div>

      <p className="mt-5 text-center text-[13px] text-white/55">
        Pas encore de compte ?{" "}
        <Link href="/owner/signup" className="font-bold text-[#b9a3ff]">
          Créer un compte
        </Link>
      </p>
    </div>
  );
}
