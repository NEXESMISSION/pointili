import Link from "next/link";
import { redirect } from "next/navigation";
import { OwnerSidebar, OwnerTabs } from "@/components/OwnerNav";
import { ownerAccess, ownerCafe } from "@/lib/auth/owner";
import { ownerNotices, remaining } from "@/lib/platform";

export const metadata = { title: "Espace café" };

/**
 * Never prerender the owner app: every page here reads live, per-owner data
 * (balances, stats, codes). Without this the dev-bypass path (which reads no
 * cookies) would let Next statically cache the dashboard at build time and
 * serve frozen numbers.
 */
export const dynamic = "force-dynamic";

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const owner = await ownerAccess();
  if (!owner) redirect("/login");

  const cafe = await ownerCafe();
  const notices = cafe ? await ownerNotices(cafe.id) : [];

  const left = cafe ? remaining(cafe.planExpiresAt) : null;

  const planChip = cafe
    ? cafe.plan === "pro"
      ? { text: "Pro", cls: "bg-[#6d4ae6] text-white" }
      : left?.expired
        ? { text: "Expiré", cls: "bg-[#ff6b6b]/12 text-[#ff9a9a]" }
        : { text: `Essai · ${left?.label ?? ""}`.trim(), cls: "bg-[#ffd27a]/12 text-[#ffd27a]" }
    : null;

  return (
    /* Phone: one column, header on top, tabs at the bottom.
       Laptop: a sidebar owns navigation, so the header collapses to nothing. */
    /* NOT .app-shell — that is the diner's phone column and it would cap this
       whole app (sidebar included) at ~480px. It is unlayered CSS, so a
       md:max-w-* utility cannot win against it; the class has to be absent. */
    <div className="a-shell flex min-h-dvh md:items-start">
      <OwnerSidebar
        name={cafe?.name ?? null}
        initial={(cafe?.name ?? "P").charAt(0).toUpperCase()}
        colour={cafe?.primaryColor ?? "#5b3fd1"}
        plan={planChip}
      />

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/12 bg-[#0d0819]/80 px-4 py-3 backdrop-blur md:hidden">
        {cafe ? (
          <>
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px] font-extrabold text-white shadow-[0_6px_14px_-6px_rgba(40,18,59,.5)]"
              style={{ background: cafe.primaryColor }}
            >
              {cafe.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-extrabold leading-tight text-white">
                {cafe.name}
              </span>
              <span className="block text-[10.5px] font-semibold text-white/55">
                Espace café
              </span>
            </span>
            {planChip && (
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${planChip.cls}`}>
                {planChip.text}
              </span>
            )}
          </>
        ) : (
          <span className="text-[16px] font-extrabold text-white">
            pointili<span className="text-[#b9a3ff]">.online</span>
          </span>
        )}
      </header>

      {owner.dev && (
        <p className="border-b border-white/12 bg-[#ffd27a]/12 px-5 py-2 font-mono text-[9.5px] uppercase leading-relaxed tracking-[0.08em] text-[#ffd27a]">
          ⚠ Mode développement — aucune authentification
        </p>
      )}

      {/*
        The café is dark. The owner keeps their panel and their data — they just
        can't serve diners — so tell them plainly rather than letting them wonder
        why the QR stopped working.
      */}
      {cafe && !cafe.live && (
        <div className="border-b border-[#ff6b6b]/35 bg-[#ff6b6b]/12 px-5 py-2.5">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[#ff9a9a]">
            ◆ Café hors ligne
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-[#ff9a9a]">
            {cafe.suspendedAt
              ? `Suspendu : ${cafe.suspendedReason ?? "contactez-nous"}`
              : "Votre abonnement a expiré — vos clients ne peuvent plus scanner."}
          </p>
          {/* A dead end otherwise: the product told an owner their shop was dark
              and gave them nothing to press. */}
          {!cafe.suspendedAt && (
            <Link href="/reglages" className="mt-1.5 inline-block text-[12px] font-bold text-white underline underline-offset-2">
              Renouveler mon abonnement →
            </Link>
          )}
        </div>
      )}

      {cafe?.live && left?.soon && !left.unlimited && (
        <p className="border-b border-[#ffd27a]/30 bg-[#ffd27a]/12 px-5 py-2 text-[11.5px] leading-snug text-[#ffd27a]">
          Votre {cafe.plan === "trial" ? "essai" : "abonnement"} se termine dans{" "}
          <b>{left.label}</b>.{" "}
          <Link href="/reglages" className="font-bold underline underline-offset-2">
            Voir les formules
          </Link>
        </p>
      )}

      {notices.map((n) => (
        <div
          key={n.id}
          className={`border-b-[1.5px] px-5 py-2.5 ${
            n.kind === "urgent"
              ? "border-[#ff6b6b]/35 bg-[#ff6b6b]/12 text-[#ff9a9a]"
              : n.kind === "warning"
                ? "border-[#ffd27a]/30 bg-[#ffd27a]/12 text-[#ffd27a]"
                : "border-white/12 bg-white/[0.06] text-white/70"
          }`}
        >
          <p className="text-[9px] font-semibold uppercase tracking-[0.06em] opacity-70">
            {n.kind === "urgent" ? "◆ Urgent" : n.kind === "warning" ? "◆ Important" : "◆ Info"}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug">{n.message}</p>
        </div>
      ))}

      <main className="flex-1 px-5 py-5 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-[680px]">{children}</div>
      </main>

      <OwnerTabs />
      </div>
    </div>
  );
}
