import { redirect } from "next/navigation";

/**
 * ── MERGED INTO /historique ───────────────────────────────────────────────
 *
 * This screen and the history screen listed THE SAME LEDGER. "+12 points · Un
 * achat chez Café Test" here, "Achat · +12" there — same rows, same order,
 * different words — and the card linked to both, one from the bell and one
 * from a tile. Whichever a customer opened, they were looking at their history
 * and could not tell that the other one was the same thing.
 *
 * The merged screen kept this one's SHAPE (what is waiting first, then the
 * timeline) and the other one's NAME, because "historique" is what a customer
 * calls it and "notifications" promised something unread that never existed —
 * nothing here was ever stored, read or unread; every line was derived.
 *
 * The route stays as a redirect rather than a 404: the bell has pointed here
 * for months, and so has anything an owner may have written down.
 */
export default async function Notifications({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/${slug}/historique`);
}
