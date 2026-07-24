import { redirect } from "next/navigation";
import { OwnerNav } from "@/components/OwnerNav";
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
  if (!owner) redirect("/owner/login");

  const cafe = await ownerCafe();
  const notices = cafe ? await ownerNotices(cafe.id) : [];

  const left = cafe ? remaining(cafe.planExpiresAt) : null;

  const planChip = cafe
    ? cafe.plan === "pro"
      ? { text: "Pro", cls: "bg-royal text-white" }
      : left?.expired
        ? { text: "Expiré", cls: "bg-seal-soft text-seal" }
        : { text: `Essai · ${left?.label ?? ""}`.trim(), cls: "bg-gold-soft text-gold-deep" }
    : null;

  return (
    <div className="app-shell o-shell flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-hair bg-white/85 px-4 py-3 backdrop-blur">
        {cafe ? (
          <>
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px] font-extrabold text-white shadow-[0_6px_14px_-6px_rgba(40,18,59,.5)]"
              style={{ background: cafe.primaryColor }}
            >
              {cafe.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-extrabold leading-tight text-charcoal">
                {cafe.name}
              </span>
              <span className="block text-[10.5px] font-semibold text-slate">
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
          <span className="text-[16px] font-extrabold text-charcoal">
            pointili<span className="text-royal2">.online</span>
          </span>
        )}
      </header>

      {owner.dev && (
        <p className="border-b border-line bg-gold-soft px-5 py-2 font-mono text-[9.5px] uppercase leading-relaxed tracking-[0.08em] text-gold-deep">
          ⚠ Mode développement — aucune authentification
        </p>
      )}

      {/*
        The café is dark. The owner keeps their panel and their data — they just
        can't serve diners — so tell them plainly rather than letting them wonder
        why the QR stopped working.
      */}
      {cafe && !cafe.live && (
        <div className="border-b border-seal/40 bg-seal-soft px-5 py-2.5">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-seal">
            ◆ Café hors ligne
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-seal">
            {cafe.suspendedAt
              ? `Suspendu : ${cafe.suspendedReason ?? "contactez-nous"}`
              : "Votre abonnement a expiré — vos clients ne peuvent plus scanner."}
          </p>
        </div>
      )}

      {cafe?.live && left?.soon && !left.unlimited && (
        <p className="border-b border-gold/40 bg-gold-soft px-5 py-2 text-[11.5px] leading-snug text-gold-deep">
          Votre {cafe.plan === "trial" ? "essai" : "abonnement"} se termine dans{" "}
          <b>{left.label}</b>.
        </p>
      )}

      {notices.map((n) => (
        <div
          key={n.id}
          className={`border-b-[1.5px] px-5 py-2.5 ${
            n.kind === "urgent"
              ? "border-seal/40 bg-seal-soft text-seal"
              : n.kind === "warning"
                ? "border-gold/40 bg-gold-soft text-gold-deep"
                : "border-line bg-brand-soft/60 text-ink2"
          }`}
        >
          <p className="text-[9px] font-semibold uppercase tracking-[0.06em] opacity-70">
            {n.kind === "urgent" ? "◆ Urgent" : n.kind === "warning" ? "◆ Important" : "◆ Info"}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug">{n.message}</p>
        </div>
      ))}

      <main className="flex-1 px-5 py-5">{children}</main>

      <OwnerNav />
    </div>
  );
}
