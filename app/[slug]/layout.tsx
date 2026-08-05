import { notFound } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { CafeClosed } from "@/components/CafeClosed";
import { TopBar } from "@/components/TopBar";
import { themeVars } from "@/lib/theme";
import { getCafe, getMember } from "@/lib/data";

export default async function CafeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  // Next 16: params is async and must be awaited.
  const { slug } = await params;
  const cafe = await getCafe(slug);
  if (!cafe) notFound();

  /*
    The gate that gives a subscription teeth.

    getCafe() deliberately resolves suspended and expired cafés so this page can
    explain itself — a diner standing at the counter deserves better than a 404.
    But nothing past this point may render: no points, no stamps, no redeeming.
  */
  if (!cafe.live) return <CafeClosed name={cafe.name} />;

  /*
    Only for the bell's dot. Null for someone who has scanned the QR but not
    joined yet — they have no card, so nothing can be waiting for them, and the
    bar must not fall over on the one screen that exists to sign them up.
  */
  const diner = await getMember(cafe.id);

  return (
    /*
      A white app that belongs to the SHOP, not to us.

      The café's own colour is injected here as custom properties and nothing
      below hard-codes a hue — every accent, stamp, active tab and banner reads
      --cafe / --cafe-ink / --cafe-text, all three computed in lib/theme.ts so a
      pale or a fluorescent brand still produces a readable screen.

      One phone-width column, as before: the journey starts at a QR glued to a
      table, so a phone is the honest shape.
    */
    <div
      className={`app-shell app-shell--light d-shell flex min-h-dvh flex-col${
        cafe.designSettings.theme.surface === "dark" ? " surface-dark" : ""
      }`}
      style={themeVars(cafe.primaryColor, cafe.designSettings.theme)}
    >
      <TopBar slug={cafe.slug} pendingCodes={diner?.codes.length ?? 0} />

      <main className="flex flex-1 flex-col">{children}</main>

      <BottomNav slug={cafe.slug} />
      {/* the customer's card is the thing worth keeping one tap away */}
      <InstallPrompt audience="client" />
    </div>
  );
}

