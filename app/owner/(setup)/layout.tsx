import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { logoutAction } from "../(auth)/login/actions";
import { ownerAccess } from "@/lib/auth/owner";

export const dynamic = "force-dynamic";

/**
 * Setup shell — authenticated, but NOT café-gated.
 *
 * This group exists to break a redirect loop: an owner with no café used to be
 * bounced /owner → /owner/login → /owner forever, with no way to reach a logout.
 * The café guard lives on the pages inside (app); this group deliberately has no
 * café requirement, so it is always a reachable destination.
 */
export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const owner = await ownerAccess();
  if (!owner) redirect("/owner/login");

  return (
    // A single centred form, so it wants a narrow column — but its own, not the
    // diner's phone shell.
    <div className="a-shell flex min-h-dvh flex-col px-6 py-8">
      {/* One centred form. It still wants a narrow measure — just its own, not
          the diner's phone shell, which would have capped the whole app. */}
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col">
        <div className="flex items-center justify-between">
          <Logo size={22} />
          {/* Always leave a way out — being stuck signed-in with nowhere to go is
              exactly the bug this group fixes. */}
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate underline underline-offset-2"
            >
              Se déconnecter
            </button>
          </form>
        </div>
        <div className="flex flex-1 flex-col justify-center">{children}</div>
      </div>
    </div>
  );
}
