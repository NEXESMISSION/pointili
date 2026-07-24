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
    But nothing past this point may render: no points, no spins, no redeeming.
  */
  if (!cafe.live) return <CafeDark name={cafe.name} />;

  // For the top bar: is a reward code waiting, and does this diner hold more
  // than one card (→ show the "switch" chevron). Null when not yet a member.
  const diner = await getDiner(cafe.id);
  const wallet = diner ? await dinerWallet(diner.phone) : [];

  return (
    /*
      The mockup look: the café's brand colour IS the page — a violet gradient
      behind the greeting and the points card — and each page pulls a white
      rounded sheet up over it for its content. One phone-width column.
    */
    <div
      className="app-shell flex min-h-dvh flex-col"
      style={{
        ["--cafe" as string]: cafe.primaryColor,
        backgroundImage: `linear-gradient(170deg, color-mix(in oklab, ${cafe.primaryColor}, #fff 14%) 0%, ${cafe.primaryColor} 34%, color-mix(in oklab, ${cafe.primaryColor}, #000 32%) 100%)`,
      }}
    >
      <TopBar
        slug={cafe.slug}
        cafeName={cafe.name}
        logoUrl={cafe.logoUrl}
        hasCodes={(diner?.codes.length ?? 0) > 0}
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
