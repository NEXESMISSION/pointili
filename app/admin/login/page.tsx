import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isElevated } from "@/lib/auth/elevate";
import { currentOwner } from "@/lib/auth/owner";
import { ElevateForm } from "./ElevateForm";

export const metadata = { title: "Console" };
export const dynamic = "force-dynamic";

/**
 * The console door — modern brand.
 *
 * A non-super-admin gets a 404, not "forbidden": the existence of this page is
 * itself information. Someone probing /admin/login should learn nothing.
 */
export default async function AdminLogin() {
  const owner = await currentOwner();
  if (!owner) redirect("/owner/login");
  if (owner.role !== "super_admin") notFound();
  if (await isElevated(owner.id)) redirect("/admin");

  return (
    <div className="modern mx-auto flex min-h-dvh max-w-md flex-col bg-cloud px-6 py-8">
      <span className="inline-flex items-center gap-2 self-start">
        <Image src="/logo-icon.png" alt="" width={26} height={26} className="h-[22px] w-auto" />
        <span className="text-[16px] font-extrabold text-charcoal">
          pointili<span className="text-royal2">.online</span>
        </span>
      </span>

      <div className="flex flex-1 flex-col justify-center">
        <span className="inline-block self-start rounded-full bg-[#fdecec] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#c0341c]">
          Zone sensible
        </span>

        <h1 className="mt-4 text-[28px] font-extrabold leading-tight text-charcoal">
          Console plateforme
        </h1>
        <p className="mt-1.5 mb-5 text-[13.5px] leading-relaxed text-slate">
          Confirmez votre mot de passe pour continuer. L&apos;accès reste ouvert
          30 minutes, puis se reverrouille.
        </p>

        <p className="mb-3 rounded-xl border border-hair bg-white px-3.5 py-2.5 text-[12px] font-medium text-slate">
          {owner.email}
        </p>

        <ElevateForm />

        <p className="mt-5 text-center text-[12px] text-slate">
          <Link href="/owner" className="font-semibold text-royal underline underline-offset-2">
            Retour à mon café
          </Link>
        </p>
      </div>
    </div>
  );
}
