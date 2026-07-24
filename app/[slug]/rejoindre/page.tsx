import { notFound, redirect } from "next/navigation";
import { currentDiner } from "@/lib/auth/diner";
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

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 pt-8">
      <section className="pb-7">
        <h1 className="text-[30px] font-extrabold leading-tight text-white">
          Ta carte de fidélité
        </h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-white/75">
          {program.welcomePoints > 0 ? (
            <>
              <b className="text-white">{program.welcomePoints} points offerts ⭐</b> à
              l&apos;inscription. En 10 secondes, sans app ni e-mail.
            </>
          ) : (
            <>En 10 secondes. Pas d&apos;app, pas d&apos;e-mail.</>
          )}
        </p>
      </section>

      <div className="d-card px-5 pb-7 pt-6">
        <JoinForm slug={slug} />
      </div>
    </div>
  );
}
