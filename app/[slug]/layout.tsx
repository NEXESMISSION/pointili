import { notFound } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { Logo } from "@/components/Logo";
import { TopBar } from "@/components/TopBar";
import { getCafe, getDiner } from "@/lib/data";
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
  if (!cafe.live) return <CafeDark name={cafe.name} />;

  // For the top bar: does this diner hold more than one card (→ show the switch
  // chevron)? Null when not yet a member.
  const diner = await getDiner(cafe.id);
  const wallet = diner ? await dinerWallet(diner.phone) : [];

  return (
    /*
      The mockup look: a deep-purple loyalty CARD. The café's brand colour drives
      a dark gradient (default = deep purple), each page floats frosted panels on
      it, and everything is one phone-width column.
    */
    <div
      className="app-shell flex min-h-dvh flex-col text-white"
      style={{
        ["--cafe" as string]: cafe.primaryColor,
        backgroundColor: "#0f0a1c",
        backgroundImage: `radial-gradient(115% 55% at 50% -6%, color-mix(in oklab, ${cafe.primaryColor}, #fff 8%) 0%, transparent 62%), linear-gradient(180deg, color-mix(in oklab, ${cafe.primaryColor}, #000 30%) 0%, color-mix(in oklab, ${cafe.primaryColor}, #000 56%) 46%, color-mix(in oklab, ${cafe.primaryColor}, #08040f 82%) 100%)`,
        backgroundAttachment: "fixed",
      }}
    >
      <TopBar
        slug={cafe.slug}
        cafeName={cafe.name}
        logoUrl={cafe.logoUrl}
        multiCard={wallet.length > 1}
      />

      <main className="flex flex-1 flex-col">{children}</main>

      <BottomNav slug={cafe.slug} />
    </div>
  );
}

/**
 * Suspended, or the subscription lapsed.
 *
 * Deliberately vague: the diner is a customer of the CAFÉ, not of Pointili, and
 * "this café hasn't paid us" is not their business. Their points are safe and
 * come back the moment the café does.
 */
function CafeDark({ name }: { name: string }) {
  return (
    <div className="app-shell paper-grain flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo size={22} />
      <div className="mt-8 w-full rounded-xl border border-line bg-paper2 px-5 py-8">
        <p className="ticket-label">Momentanément fermé</p>
        <h1 className="mt-2 font-display text-[24px] leading-tight">{name}</h1>
        <p className="mx-auto mt-2 max-w-[30ch] text-[13.5px] leading-relaxed text-ink2">
          La carte de fidélité de ce café est en pause. Tes points sont
          conservés — repasse bientôt.
        </p>
        <div className="tear mt-5" />
        <p className="mt-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-faint">
          Rien n&apos;est perdu
        </p>
      </div>
    </div>
  );
}
