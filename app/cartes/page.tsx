import { redirect } from "next/navigation";
import { InstallPrompt } from "@/components/InstallPrompt";
import { WalletView } from "@/components/WalletView";
import { currentDiner } from "@/lib/auth/diner";
import { BRAND_COLOR, DINER_BG } from "@/lib/brand";
import { dinerWallet } from "@/lib/db";

export const metadata = { title: "Mes cartes" };
export const dynamic = "force-dynamic";

/**
 * The wallet — the home base above any single shop. Fetches every card the diner
 * holds; the interactive search / sort / open lives in WalletView. `?from=slug`
 * tells it which card they came from, so that one shows as "Actuelle".
 */
export default async function Cartes({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const phone = await currentDiner();
  // Signed out → the diner front door. This used to send them to "/", the B2B
  // marketing landing: the customer whose bookmark this is got a pitch for a
  // shop subscription instead of a way back to their own points.
  if (!phone) redirect("/moi");

  const { getAccount } = await import("@/lib/db");
  const [{ from }, cards, account] = await Promise.all([
    searchParams,
    dinerWallet(phone),
    getAccount(phone),
  ]);

  return (
    <div
      className="app-shell app-shell--dark min-h-dvh px-5 pb-10 pt-6 text-white"
      style={{ ["--cafe" as string]: BRAND_COLOR, ...DINER_BG }}
    >
      {/* The wallet is the only shop-neutral diner screen, which makes it the
          right home for a code that is the same at every shop. */}
      <WalletView cards={cards} currentSlug={from ?? null} code={account?.code ?? null} />
      {/* the wallet is the customer's home base — the likeliest place to install from */}
      <InstallPrompt audience="client" />
    </div>
  );
}
