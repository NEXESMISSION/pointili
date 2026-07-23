import { notFound, redirect } from "next/navigation";
import { Wheel } from "@/components/Wheel";
import { currentDiner } from "@/lib/auth/diner";
import { getCafe, getGame } from "@/lib/data";
import { nextPlayAt } from "@/lib/db";

export const metadata = { title: "Jeux" };

export default async function Jeux({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cafe = await getCafe(slug);
  if (!cafe) notFound();

  // Playing needs an identity — send them through onboarding first, rather than
  // letting them spin into a 401.
  const phone = await currentDiner();
  if (!phone) redirect(`/${slug}/rejoindre`);

  const game = await getGame(cafe.id);

  // The owner can switch the game off entirely (games.active).
  if (!game) {
    return (
      <div className="grid min-h-[55vh] place-items-center text-center">
        <div>
          <p className="font-display text-[22px]">Pas de jeu pour l&apos;instant</p>
          <p className="mx-auto mt-1 max-w-[26ch] text-[13.5px] text-mut">
            Reviens bientôt — {cafe.name} prépare quelque chose.
          </p>
        </div>
      </div>
    );
  }

  const next = await nextPlayAt(game.id, phone, game.cooldownHours);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="ticket-label">◆ Un tour par visite</p>
        <h1 className="mt-1 font-display text-[26px]">Tourne et gagne</h1>
        <p className="mt-1 text-[13px] text-mut">
          Tout le monde repart avec quelque chose.
        </p>
      </div>

      <Wheel
        slug={cafe.slug}
        cafeName={cafe.name}
        prizes={game.prizes}
        nextPlayAt={next ? next.toISOString() : null}
      />
    </div>
  );
}
