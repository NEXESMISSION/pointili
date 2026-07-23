import { notFound } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { Logo } from "@/components/Logo";
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
    But nothing past this point may render: no points, no spins, no redeeming.
  */
  if (!cafe.live) return <CafeDark name={cafe.name} />;

  return (
    // app-shell = the mobile-only mandate: one phone-width column, centered.
    <div
      className="app-shell flex min-h-dvh flex-col"
      // The owner's brand colour drives accents inside their café.
      style={{ ["--cafe" as string]: cafe.primaryColor }}
    >
      {/*
        The café's own identity leads — Pointili is the platform, not the star.
        No logo → an inked monogram stamp rather than a SaaS avatar chip.
      */}
      <header className="flex items-center gap-2.5 px-5 pt-5 pb-3">
        {cafe.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, arbitrary remote host
          <img
            src={cafe.logoUrl}
            alt=""
            className="h-9 w-9 rounded-full border border-ink object-cover"
          />
        ) : (
          <span
            className="grid h-9 w-9 -rotate-3 place-items-center rounded-full border-[1.5px] font-display text-[15px]"
            style={{ borderColor: "var(--cafe)", color: "var(--cafe)" }}
          >
            {cafe.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="font-display text-[17px] text-ink">{cafe.name}</span>
      </header>

      <main className="flex-1 px-5 pb-6">{children}</main>

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
