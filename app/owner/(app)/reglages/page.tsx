import { redirect } from "next/navigation";
import { currentOwner, ownerCafe } from "@/lib/auth/owner";
import { businessType } from "@/lib/businessTypes";
import { getLoyaltyProgram, getRewards } from "@/lib/data";
import { remaining } from "@/lib/platform";
import { logoutAction } from "../../(auth)/login/actions";
import { SettingsList } from "./SettingsList";

export const metadata = { title: "Réglages" };

const PLAN_LABEL: Record<string, string> = { trial: "Essai", pro: "Pro", free: "Gratuite" };

/**
 * Réglages — a settings LIST, not a page of forms.
 *
 * This page only states the shop's identity and account; every knob lives one
 * tap deeper, in a focused editor. See SettingsList for why.
 */
export default async function Reglages() {
  const cafe = await ownerCafe();
  // No café yet → set one up. NOT /owner/login: that would see a valid session
  // and bounce straight back here, forever.
  if (!cafe) redirect("/owner/nouveau");

  const left = remaining(cafe.planExpiresAt);
  const [owner, program, rewards] = await Promise.all([
    currentOwner(),
    getLoyaltyProgram(cafe.id),
    getRewards(cafe.id),
  ]);
  const type = businessType(cafe.businessType);

  return (
    <div className="space-y-4">
      {/* ── who you are ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-1">
        {cafe.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
          <img src={cafe.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/[0.08] text-[22px]">
            {type.emoji}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[21px] font-extrabold leading-tight text-white">
            {cafe.name}
          </h1>
          <p className="truncate text-[12px] text-white/50">
            {type.label} · pointili.online/{cafe.slug}
          </p>
        </div>
      </div>

      <SettingsList cafe={cafe} program={program} rewards={rewards} typeLabel={type.label} />

      {/* ── the account ────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-1.5 px-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/40">
          Votre compte
        </h2>
        <div className="a-card divide-y divide-white/[0.08] overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="text-[14.5px] font-semibold text-white">Formule</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-[13px] font-bold text-white/60">
                {PLAN_LABEL[cafe.plan] ?? cafe.plan}
              </span>
              <span
                className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  left.expired
                    ? "bg-[#ff6b6b]/12 text-[#ff9a9a]"
                    : left.soon && !left.unlimited
                      ? "bg-[#ffd27a]/12 text-[#ffd27a]"
                      : "bg-ok/10 text-[#7ff0b0]"
                }`}
              >
                {left.label}
              </span>
            </span>
          </div>

          {cafe.planExpiresAt && (
            <div className="flex items-center justify-between gap-3 px-4 py-3.5">
              <span className="text-[14.5px] font-semibold text-white">
                {left.expired ? "Expiré le" : "Expire le"}
              </span>
              <span className="shrink-0 text-[13px] font-bold text-white/60">
                {new Date(cafe.planExpiresAt).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="shrink-0 text-[14.5px] font-semibold text-white">Identifiant</span>
            <span className="min-w-0 truncate text-right font-mono text-[12px] text-white/60">
              {owner?.email ?? "—"}
            </span>
          </div>
        </div>
      </section>

      <form action={logoutAction} className="px-1">
        <button
          type="submit"
          className="w-full rounded-2xl border border-white/12 py-3 text-[13px] font-bold text-white/55 active:scale-[0.99]"
        >
          Se déconnecter
        </button>
      </form>
    </div>
  );
}
