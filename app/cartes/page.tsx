import { redirect } from "next/navigation";
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
  // Signing in is per-shop (scan a QR), so there's nothing to show signed-out.
  if (!phone) redirect("/");

  const [{ from }, cards] = await Promise.all([searchParams, dinerWallet(phone)]);

  return (
    <div
      className="app-shell min-h-dvh px-5 pb-10 pt-6 text-white"
      style={{ ["--cafe" as string]: BRAND_COLOR, ...DINER_BG }}
    >
      <WalletView cards={cards} currentSlug={from ?? null} />
    </div>
  );
}
