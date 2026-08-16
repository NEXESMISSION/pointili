import { ShopLogo } from "@/components/ShopLogo";
import { t as translation } from "@/lib/i18n";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CafeClosed } from "@/components/CafeClosed";
import { GoChevron } from "@/components/GoChevron";
import { Sparkle } from "@/components/icons";
import { businessType } from "@/lib/businessTypes";
import { codeQr } from "@/lib/qr";
import { getCafe, getMember } from "@/lib/data";

export const metadata = { title: "Mon code" };

/**
 * The diner's "I'm here" screen. Staff scans this QR (or types the 4-char CODE)
 * to credit points / add a stamp — so it encodes the ACCOUNT code, never the
 * phone number. The phone is never shown here or to the cashier.
 *
 * The code is the same at every shop, which is why it works even at a counter
 * the diner has never visited. This page still lives under /[slug] because it
 * also shows this shop's balance.
 */
export default async function Scanner({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cafe = await getCafe(slug);
  if (!cafe) notFound();
  // Re-checked per PAGE, not just in the layout: Next does not re-run a layout
  // on client-side transitions, so a shop that went dark mid-session kept
  // serving every screen.
  if (!cafe.live) return <CafeClosed name={cafe.name} />;

  const diner = await getMember(cafe.id);
  if (!diner) redirect(`/${slug}/rejoindre`);

  /*
    DARK MODULES AGAIN, now that the app is white.

    This used to be white-on-dark, deliberately: the app was a dark card and a
    white slab in the middle of it made the QR — not the shop — the brightest
    thing on the screen. That reasoning died with the dark app. Inverted modules
    on a white page would simply be an invisible QR, so this is back to the
    polarity the spec actually promises decoders will read, from the one
    renderer every code in the product now shares.
  */
  const qr = await codeQr(diner.code);

  const type = businessType(cafe.businessType);
  const t = await translation();

  return (
    <div className="flex flex-1 flex-col px-5 pb-4">
      {/* ── whose counter this is ── */}
      <section className="pt-2 text-center">
        <span className="relative mx-auto grid h-[74px] w-[74px] place-items-center">
          <ShopLogo
            url={cafe.logoUrl}
            shape={cafe.designSettings.theme.logoShape}
            emoji={type.emoji}
            size={74}
            ring="var(--cafe-line)"
            tint="var(--cafe-soft)"
            className="relative"
          />
        </span>

        <h1 className="mt-3 text-[25px] font-extrabold leading-tight tracking-[-0.02em] text-charcoal">
          {cafe.name}
        </h1>
        <span
          className="mt-2 inline-block rounded-full px-3.5 py-[3px] text-[12.5px] font-bold"
          style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
        >
          {t(type.label)}
        </span>
      </section>

      {/* ── the thing the cashier points a camera at ── */}
      <div className="d-card mt-5 px-6 pb-5 pt-6 text-center">
        <div className="d-pass mx-auto w-[198px] p-2 [&>svg]:h-auto [&>svg]:w-full">
          <div dangerouslySetInnerHTML={{ __html: qr }} />
        </div>

        <p className="mt-5 text-[11.5px] font-bold uppercase tracking-[0.10em] text-slate">
          {t("Mon code client")}
        </p>
        {/*
          The fallback when a camera will not focus, a lens is scratched, or the
          shop has no phone free — so it is set at a size that can be READ OUT
          across a counter rather than squinted at.
        */}
        {/* dir=ltr: Latin characters with trailing letter-spacing, on the one
            string a customer reads out across a counter. */}
        <p
          dir="ltr"
          className="mt-1.5 font-mono text-[31px] font-extrabold leading-none tracking-[0.16em]"
          style={{ color: "var(--cafe-text)" }}
        >
          {diner.code}
        </p>
      </div>

      {/* ── what the person holding the phone should expect to happen ── */}
      <div className="d-soft mt-3 flex items-start gap-3 px-4 py-3">
        <span
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M12 16v-5M12 8h.01" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <p className="text-[13.5px] leading-relaxed text-slate">
          {t("Le serveur scanne ce QR (ou saisis le code) — pas besoin de donner ton numéro.")}
        </p>
      </div>

      {/*
        The balance, and a way back to it.

        It used to be a dead panel: the number, and nothing to press. Someone
        standing at a counter who wants to check what that number can BUY had to
        find the back button. It is the card link now.
      */}
      <Link
        href={`/${slug}`}
        className="d-card mt-3 flex items-center gap-3.5 px-4 py-3 transition active:scale-[0.99]"
      >
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full"
          style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
        >
          <Sparkle className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[13px] font-medium text-slate">{t("Solde actuel")}</span>
          <span className="block text-[17px] font-extrabold text-charcoal">
            {t.n(diner.balance, "point")}
          </span>
        </span>
        <GoChevron size={36} />
      </Link>
    </div>
  );
}
