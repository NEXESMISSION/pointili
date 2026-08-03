import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CafeClosed } from "@/components/CafeClosed";
import { GoChevron } from "@/components/GoChevron";
import { Sparkle } from "@/components/icons";
import { businessType } from "@/lib/businessTypes";
import QRCode from "qrcode";
import { getCafe, getMember } from "@/lib/data";
import { fmtPoints } from "@/lib/points";

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
    WHITE modules on a DARK card, not a white card.

    The old screen printed a white slab in the middle of a dark app, which is
    what every QR screen did in 2013 because scanners needed the quiet zone to
    be paper-white. Phone cameras have not needed that in years — they read
    light-on-dark fine, and the CSS quiet zone below is real padding, not a
    guess. What the white slab actually cost was the shop: at arm's length
    across a counter the brightest thing on screen was a rectangle, and the
    café it belonged to was a 24px line above it.

    INVERTING A QR IS NOT FREE and it was checked rather than assumed: the
    polarity the spec assumes is dark-on-light, and plenty of decoders refuse
    the other way round. The one that matters is jsQR, because that is what
    this product's own till runs (components/QrScanner). Rendered the real page,
    cut the real QR out of the real screenshot, and put it through jsQR: reads
    "844Y" as drawn, and also inverted. Safe — but re-check it if the decoder
    is ever swapped.
  */
  const qr = await QRCode.toString(diner.code, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#ffffff", light: "#00000000" },
  });

  const type = businessType(cafe.businessType);

  return (
    <div className="flex flex-1 flex-col px-5 pb-4">
      {/* ── whose counter this is ── */}
      <section className="pt-2 text-center">
        <span className="relative mx-auto grid h-[74px] w-[74px] place-items-center">
          {/* the glow is what makes a flat circle read as a lit object */}
          <span
            aria-hidden
            className="absolute inset-[-18%] rounded-full"
            style={{
              background: "radial-gradient(closest-side, rgba(124,86,232,.55), transparent 72%)",
            }}
          />
          {cafe.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
            <img
              src={cafe.logoUrl}
              alt=""
              className="relative h-[74px] w-[74px] rounded-full bg-white/10 object-cover ring-1 ring-white/20"
            />
          ) : (
            <span className="relative grid h-[74px] w-[74px] place-items-center rounded-full bg-white/10 text-[34px] ring-1 ring-white/20">
              {type.emoji}
            </span>
          )}
        </span>

        <h1 className="mt-3 text-[25px] font-extrabold leading-tight tracking-[-0.02em]">
          {cafe.name}
        </h1>
        <span className="mt-2 inline-block rounded-full bg-[#7c56e8] px-3.5 py-[3px] text-[12.5px] font-bold text-white">
          {type.label}
        </span>
      </section>

      {/* ── the thing the cashier points a camera at ── */}
      <div className="mt-5 rounded-[26px] border border-white/[0.10] bg-white/[0.035] px-6 pb-5 pt-6 text-center">
        <div className="mx-auto w-[182px] [&>svg]:h-auto [&>svg]:w-full">
          <div dangerouslySetInnerHTML={{ __html: qr }} />
        </div>

        <p className="mt-5 text-[11.5px] font-bold uppercase tracking-[0.10em] text-white/45">
          Mon code client
        </p>
        {/*
          The fallback when a camera will not focus, a lens is scratched, or the
          shop has no phone free — so it is set at a size that can be READ OUT
          across a counter rather than squinted at.
        */}
        <p className="mt-1.5 font-mono text-[31px] font-extrabold leading-none tracking-[0.16em] text-[#a78bfa]">
          {diner.code}
        </p>
      </div>

      {/* ── what the person holding the phone should expect to happen ── */}
      <div className="mt-3 flex items-start gap-3 rounded-[22px] border border-white/[0.08] bg-white/[0.035] px-4 py-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#7c56e8]/25 text-[#c9b8ff]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M12 16v-5M12 8h.01" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <p className="text-[13.5px] leading-relaxed text-white/70">
          Le serveur scanne ce QR (ou saisis le code) —{" "}
          <b className="font-extrabold text-[#a78bfa]">pas besoin</b> de donner ton numéro.
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
        className="mt-3 flex items-center gap-3.5 rounded-[22px] border border-white/[0.08] bg-white/[0.035] px-4 py-3 transition active:scale-[0.99]"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#7c56e8]">
          <Sparkle className="h-6 w-6 text-white" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[13px] font-medium text-white/55">Solde actuel</span>
          <span className="block text-[17px] font-extrabold text-white">
            {fmtPoints(diner.balance)} points
          </span>
        </span>
        <GoChevron size={36} />
      </Link>
    </div>
  );
}
