import { notFound, redirect } from "next/navigation";
import { currentDiner } from "@/lib/auth/diner";
import { businessType } from "@/lib/businessTypes";
import { getCafe, getLoyaltyProgram } from "@/lib/data";
import { creditPoints, enrollDiner, getAccount } from "@/lib/db";
import { JoinForm } from "./JoinForm";

export const metadata = { title: "Rejoindre" };

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
      {/* the ambient glow behind everything */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[320px] w-[320px] -translate-x-1/2 rounded-full opacity-70 blur-[70px]"
        style={{ background: "radial-gradient(circle, #7b52ff 0%, transparent 68%)" }}
      />

      <div className="relative mx-auto w-full max-w-[420px]">
        <p className="text-center font-display text-[26px] font-extrabold leading-none text-white">
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
                className="h-[84px] w-[84px] rounded-full object-cover ring-1 ring-white/15"
              />
            ) : (
              <span className="grid h-[84px] w-[84px] place-items-center rounded-full bg-white/[0.09] text-[36px] ring-1 ring-white/15">
                {type.emoji}
              </span>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full bg-[#6d4ae6] ring-4 ring-[#0e0720]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                <path d="m5 12.5 4.5 4.5L19 7" />
              </svg>
            </span>
          </span>

          <p className="mt-4 text-[17px] font-extrabold text-white">{cafe.name}</p>
          <p className="mt-0.5 text-[13px] text-white/50">
            {program.active && program.welcomePoints > 0 ? (
              <>
                <b className="font-bold text-[#b9a3ff]">
                  {program.welcomePoints} points offerts
                </b>{" "}
                à l&apos;inscription
              </>
            ) : (
              <>Création de ton compte</>
            )}
          </p>
        </div>

        <div className="mt-7">
          <JoinForm slug={slug} />
        </div>

        {/*
          True since the code moved to the account: one identity, every shop.
          It is also the answer to the question this screen actually raises —
          "do I have to do this again at the next place?".
        */}
        <p className="mt-9 text-center text-[15px] font-extrabold leading-snug text-white">
          Un seul compte.
          <br />
          Utilisable <span className="text-[#b9a3ff]">partout</span>.
        </p>
      </div>
    </div>
  );
}
