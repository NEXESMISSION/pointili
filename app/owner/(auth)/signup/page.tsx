import Link from "next/link";
import { redirect } from "next/navigation";
import { currentOwner, ownerCafe } from "@/lib/auth/owner";
import { AuthForm } from "../login/AuthForm";
import { signupAction } from "../login/actions";
import { platformSettings } from "@/lib/settings";

export const metadata = { title: "Créer mon compte" };

export default async function Signup() {
  const owner = await currentOwner();
  if (owner) redirect((await ownerCafe()) ? "/owner" : "/owner/nouveau");

  /*
    ── NO TRIAL WE CANNOT LET THEM FINISH ────────────────────────────────────

    While payments are off, this door was open and the exit was not. A shop
    could sign up today, spend fourteen days putting their rewards in and their
    QR on the tables, and then reach /owner/renouveler — which, with
    paymentsLive false, tells them in as many words NOT to pay because the
    transfer details are a placeholder. Trial over, shop dark, no way back in,
    and their customers' cards along with it.

    That is worse than being closed. So while payments are off, the way in is
    the waiting list at /early, which is the real funnel and says so honestly.

    SIGNING IN IS UNTOUCHED. This gates creating a NEW shop, never reaching an
    existing one: an owner who already has a trial running still has an app,
    and locking them out of it would be the same mistake pointing the other way.
  */
  const { paymentsLive } = await platformSettings();
  if (!paymentsLive) redirect("/early");

  return (
    <div className="a-card px-6 py-7">
      <h1 className="text-[24px] font-extrabold leading-tight text-charcoal">
        Créez votre compte
      </h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate">
        Quelques secondes, et vos clients peuvent scanner.
      </p>

      {/* the offer, up front — matches the landing + marketing */}
      <p className="mt-4 rounded-xl bg-[var(--o-inset)] px-3.5 py-2.5 text-[12px] font-semibold leading-relaxed text-[#5b3fd1]">
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

      <p className="mt-5 text-center text-[13px] text-slate">
        Déjà un compte ?{" "}
        <Link href="/owner/login" className="font-bold text-[#5b3fd1]">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
