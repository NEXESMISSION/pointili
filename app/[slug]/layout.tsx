import { notFound } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { CafeClosed } from "@/components/CafeClosed";
import { TopBar } from "@/components/TopBar";
import { BRAND_COLOR } from "@/lib/brand";
import { getCafe } from "@/lib/data";

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

  return (
    /*
      The mockup look: a deep-purple loyalty CARD. The café's brand colour drives
      a dark gradient (default = deep purple), each page floats frosted panels on
      it, and everything is one phone-width column.
    */
    <div
      className="app-shell flex min-h-dvh flex-col text-white"
      style={{
        ["--cafe" as string]: BRAND_COLOR,
        backgroundColor: "#0f0a1c",
        backgroundImage: `radial-gradient(115% 55% at 50% -6%, color-mix(in oklab, ${BRAND_COLOR}, #fff 8%) 0%, transparent 62%), linear-gradient(180deg, color-mix(in oklab, ${BRAND_COLOR}, #000 30%) 0%, color-mix(in oklab, ${BRAND_COLOR}, #000 56%) 46%, color-mix(in oklab, ${BRAND_COLOR}, #08040f 82%) 100%)`,
        backgroundAttachment: "fixed",
      }}
    >
      <TopBar
        slug={cafe.slug}
        cafeName={cafe.name}
        logoUrl={cafe.logoUrl}
        businessTypeKey={cafe.businessType}
      />

      <main className="flex flex-1 flex-col">{children}</main>

      <BottomNav slug={cafe.slug} />
    </div>
  );
}

