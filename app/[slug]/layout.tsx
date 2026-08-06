import { notFound } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { CafeClosed } from "@/components/CafeClosed";
import { TopBar } from "@/components/TopBar";
import { SideRail } from "@/components/SideRail";
import { businessType } from "@/lib/businessTypes";
import { themeVars } from "@/lib/theme";
import { getCafe, getMember } from "@/lib/data";
import { dinerWallet } from "@/lib/db";

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
  /* Only for the rail's wallet row. Skipped entirely for somebody who has not
     joined yet — they have no wallet and the rail is not rendered for them. */
  const cards = diner ? (await dinerWallet(diner.phone)).length : 0;

  return (
    /*
      A white app that belongs to the SHOP, not to us.

      The café's own colour is injected here as custom properties and nothing
      below hard-codes a hue — every accent, stamp, active tab and banner reads
      --cafe / --cafe-ink / --cafe-text, all three computed in lib/theme.ts so a
      pale or a fluorescent brand still produces a readable screen.

      ONE COLUMN ON A PHONE, TWO ON A LAPTOP. The journey starts at a QR glued
      to a table, so the phone is the shape that matters — but the same 480px
      column stranded in the middle of a 1440px window is a screenshot, not a
      page. At lg the tab bar becomes a rail and the content gets real width.
    */
    /*
      THE CLASS LIST IS BUILT WITH A JOIN, NOT A TEMPLATE LITERAL.

      It used to end "...flex-col lg:flex-row${cond}" — and Tailwind v4 scans
      source text for candidates, so a class written flush against `${` is not a
      class it ever sees. `lg:flex-row` was never generated: the shell stayed a
      COLUMN on desktop, which stacked the 900px-tall rail on top of the page
      and pushed the card exactly one viewport down. Every screenshot came back
      showing a rail and an empty white void, with the DOM insisting everything
      was visible — because it was, at y=900.

      Anything interpolated goes in the array, where it cannot touch a name.
    */
    <div
      className={[
        "app-shell app-shell--light d-shell flex min-h-dvh flex-col lg:flex-row",
        cafe.designSettings.theme.surface === "dark" ? "surface-dark" : "",
      ].join(" ")}
      style={themeVars(cafe.primaryColor, cafe.designSettings.theme)}
    >
      {/* nothing below lg — see the component */}
      <SideRail
        slug={cafe.slug}
        name={cafe.name}
        logoUrl={cafe.logoUrl}
        emoji={businessType(cafe.businessType).emoji}
        cards={cards}
      />

      {/* The content column keeps a phone's measure even on a monitor: a
          loyalty card read across 900px would be a table, not a card. */}
      <div className="flex min-w-0 flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-[560px]">
        <TopBar slug={cafe.slug} pendingCodes={diner?.codes.length ?? 0} />

        <main className="flex flex-1 flex-col">{children}</main>

        <BottomNav slug={cafe.slug} />
      </div>

      {/* the customer's card is the thing worth keeping one tap away */}
      <InstallPrompt audience="client" />
    </div>
  );
}

