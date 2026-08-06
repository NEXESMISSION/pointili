import { notFound, redirect } from "next/navigation";
import { currentDiner } from "@/lib/auth/diner";
import { businessType } from "@/lib/businessTypes";
import { getCafe, getLoyaltyProgram } from "@/lib/data";
import { creditPoints, enrollDiner, getAccount } from "@/lib/db";
import { JsonLd, localBusinessType, SITE_URL } from "@/lib/seo";
import { JoinForm } from "./JoinForm";

/**
 * Per-shop metadata. This is where the platform's SEO actually compounds.
 *
 * "Rejoindre" was the title of EVERY shop page — hundreds of identical titles,
 * which search engines treat as duplicates and collapse. Named after the shop,
 * each page becomes a real local result: a café with no website suddenly has a
 * page that ranks for its own name, and Pointili accumulates one local page per
 * customer instead of one generic page in total.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cafe = await getCafe(slug);
  if (!cafe) return { title: "Commerce introuvable" };

  const type = businessType(cafe.businessType);
  const title = `${cafe.name} — carte de fidélité`;
  const description =
    `Rejoignez la carte de fidélité de ${cafe.name} (${type.label.toLowerCase()}). ` +
    "Scannez, cumulez des points à chaque passage et échangez-les contre des récompenses. " +
    "Sans application, sans e-mail — juste votre numéro.";

  return {
    title,
    description,
    // Dark shops stay out of the index: pointing a crawler at "Momentanément
    // fermé" indexes a closed sign.
    robots: cafe.live ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: `/${slug}` },
    openGraph: {
      type: "website",
      title,
      description,
      url: `${SITE_URL}/${slug}`,
      images: cafe.logoUrl ? [{ url: cafe.logoUrl }] : undefined,
    },
  };
}

export default async function Rejoindre({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cafe = await getCafe(slug);
  if (!cafe) notFound();

  /*
    Check the ACCOUNT, not just the cookie. A signed cookie proves someone once
    signed up — not that the account still exists. (Trusting it alone once caused
    an infinite /[slug] ↔ /rejoindre loop that locked a diner out entirely.)
  */
  const phone = await currentDiner();
  const program = await getLoyaltyProgram(cafe.id);

  if (phone && (await getAccount(phone))) {
    /*
      Already signed in → ENROLL at this café, then go to the card.

      The account is global; a card is per café. So a diner who joined café A and
      now scans café B's QR gets B's welcome bonus and a fresh card at B. This is
      also what makes B appear in their wallet. credit_points is idempotent per
      café — re-visiting a café you already belong to grants nothing.
    */
    await enrollDiner(cafe.id, phone);
    if (program.active && program.welcomePoints > 0) {
      await creditPoints(cafe.id, phone, 0);
    }
    redirect(`/${slug}`);
  }

  const type = businessType(cafe.businessType);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden px-5 pb-8 pt-7">
      {/*
        The shop, as a local business. Typed properly — a café marked
        CafeOrCoffeeShop reads far better in a local result, and in an AI answer,
        than a generic LocalBusiness would.

        Only when the shop is live: a dark café must not be presented as open.
      */}
      {cafe.live && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": localBusinessType(cafe.businessType),
            "@id": `${SITE_URL}/${slug}#business`,
            name: cafe.name,
            url: `${SITE_URL}/${slug}`,
            image: cafe.logoUrl ?? undefined,
            address: { "@type": "PostalAddress", addressCountry: "TN" },
            /* What is actually true of this shop, and the reason a customer
               would search for it here rather than anywhere else. */
            makesOffer: {
              "@type": "Offer",
              name: "Programme de fidélité",
              description:
                program.active && program.welcomePoints > 0
                  ? `${program.welcomePoints} points offerts à l'inscription, puis ${program.pointsPerTnd} point(s) par dinar dépensé.`
                  : `${program.pointsPerTnd} point(s) par dinar dépensé.`,
              price: 0,
              priceCurrency: "TND",
            },
          }}
        />
      )}
      {/* A WASH OF THE SHOP'S COLOUR, not a purple glow.

          This screen is the first thing a stranger sees after scanning a
          sticker on a table, so the one decoration on it should be the shop
          they are standing in — not us. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[260px]"
        style={{
          background: "linear-gradient(180deg, var(--cafe-soft) 0%, transparent 100%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-[420px]">
        <p className="text-center font-display text-[23px] font-extrabold leading-none text-charcoal">
          Pointili
        </p>

        {/*
          WHOSE shop this is.

          The screen used to be completely anonymous — the café was fetched and
          never named — which is a lot to ask of someone who has just scanned a
          sticker taped to a table and is about to hand over a phone number.
        */}
        <div className="mt-6 flex flex-col items-center">
          <span className="relative">
            {cafe.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
              <img
                src={cafe.logoUrl}
                alt=""
                className="h-[84px] w-[84px] rounded-full object-cover"
                style={{ boxShadow: "0 0 0 2px var(--cafe-line)" }}
              />
            ) : (
              <span
                className="grid h-[84px] w-[84px] place-items-center rounded-full text-[36px]"
                style={{ background: "var(--cafe-soft)" }}
              >
                <span className="shop-mark">{type.emoji}</span>
              </span>
            )}
            <span
              className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full ring-4 ring-[var(--surface)]"
              style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                <path d="m5 12.5 4.5 4.5L19 7" />
              </svg>
            </span>
          </span>

          <p className="mt-4 text-[15.5px] font-extrabold text-charcoal">{cafe.name}</p>
          <p className="mt-0.5 text-[13px] text-slate">
            {program.active && program.welcomePoints > 0 ? (
              <>
                <b className="font-bold" style={{ color: "var(--cafe-text)" }}>
                  {program.welcomePoints} points offerts
                </b>{" "}
                à l&apos;inscription
              </>
            ) : (
              <>Création de ton compte</>
            )}
          </p>
          {/*
            The scale, before they commit — not after.

            Everything below this line asks the customer for something (their
            number, a secret code). The one thing they are being offered,
            "points", had no unit anywhere on the screen: the rate lived in the
            page's JSON-LD, which is for crawlers, not for the person deciding
            whether to type their phone number in.
          */}
          {program.active && program.pointsPerTnd > 0 && (
            <p className="mt-1.5 text-[12px] text-slate">
              {program.pointsPerTnd >= 1
                ? `1 dinar dépensé = ${Math.round(program.pointsPerTnd * 100) / 100} point${program.pointsPerTnd > 1 ? "s" : ""}`
                : `${Math.round((1 / program.pointsPerTnd) * 10) / 10} dinars dépensés = 1 point`}
              {" · ils n'expirent jamais"}
            </p>
          )}
        </div>

        <div className="mt-7">
          <JoinForm slug={slug} />
        </div>

        {/*
          True since the code moved to the account: one identity, every shop.
          It is also the answer to the question this screen actually raises —
          "do I have to do this again at the next place?".
        */}
        <p className="mt-9 text-center text-[14px] font-extrabold leading-snug text-charcoal">
          Un seul compte.
          <br />
          Utilisable <span style={{ color: "var(--cafe-text)" }}>partout</span>.
        </p>
      </div>
    </div>
  );
}
