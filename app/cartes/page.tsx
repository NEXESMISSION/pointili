import { redirect } from "next/navigation";
import { InstallPrompt } from "@/components/InstallPrompt";
import { OwnerReturn } from "@/components/OwnerReturn";
import { WalletView } from "@/components/WalletView";
import { currentDiner } from "@/lib/auth/diner";
import { dinerWallet } from "@/lib/db";
import { currentLang, dir } from "@/lib/i18n";

export const metadata = { title: "Mes cartes" };
export const dynamic = "force-dynamic";

/**
 * The wallet — the home base above any single shop. Fetches every card the diner
 * holds; the interactive search / sort / open lives in WalletView. `?from=slug`
 * tells it which card they came from, so that one shows as "Actuelle".
 */
export default async function Cartes({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const phone = await currentDiner();
  // Signed out → the diner front door. This used to send them to "/", the B2B
  // marketing landing: the customer whose bookmark this is got a pitch for a
  // shop subscription instead of a way back to their own points.
  if (!phone) redirect("/moi");

  const { getAccount } = await import("@/lib/db");
  const { hasOwnerCookie } = await import("@/lib/auth/owner");
  const [{ from }, cards, account, isOwner] = await Promise.all([
    searchParams,
    dinerWallet(phone),
    getAccount(phone),
    hasOwnerCookie(),
  ]);

  /*
    What each card is CLOSE to.

    The wallet used to show a balance and nothing else, so every card said "223
    points" — a number with no meaning to the person holding it. What makes them
    open a card is being nearly there, and the shop already knows: the same
    nextRewardNudge() the card screen uses.

    Resolved here rather than inside diner_wallet, because that is an RPC and
    this needs no migration — a wallet holds a handful of cards, and it is one
    small query each, in parallel.
  */
  const lang = await currentLang();

  const { getRewards, nextRewardNudge } = await import("@/lib/data");
  const nudges = Object.fromEntries(
    await Promise.all(
      cards.map(async (c) => {
        const nudge = nextRewardNudge(c.balance, await getRewards(c.businessId));
        return [
          c.businessId,
          nudge ? { label: nudge.target.label, needed: nudge.needed, cost: nudge.target.pointsCost } : null,
        ] as const;
      }),
    ),
  );

  return (
    /* No --cafe here on purpose: this screen belongs to no single shop. Each
       card carries its own colour (see WalletView), and the page around them
       stays the same white as the rest of the client app. */
    /* This screen sits OUTSIDE /[slug], so no layout above it has set lang or
       dir — it carries both itself or the Tunisian wallet renders left to
       right with its chevrons pointing the wrong way. */
    <div
      lang={lang === "tn" ? "ar-TN" : "fr"}
      dir={dir(lang)}
      className={`safe-t safe-b app-shell app-shell--light d-shell min-h-dvh px-5 lg:max-w-[880px] [--safe-pb:2.5rem] [--safe-pt:1.5rem] ${lang === "tn" ? "lang-tn" : ""}`}
    >
      {/* The wallet is the only shop-neutral diner screen, which makes it the
          right home for a code that is the same at every shop. */}
      <WalletView
        cards={cards}
        currentSlug={from ?? null}
        code={account?.code ?? null}
        nudges={nudges}
        isOwner={isOwner}
        lang={lang}
      />
      {/* the wallet is the customer's home base — the likeliest place to install from */}
      <InstallPrompt audience="client" lang={lang} />
      {/* owners only — the door back to the till, see OwnerReturn */}
      <OwnerReturn />
    </div>
  );
}
