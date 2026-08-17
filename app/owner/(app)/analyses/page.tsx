import { permanentRedirect } from "next/navigation";

/**
 * /owner/analyses → /owner/clients.
 *
 * The page was renamed long after it stopped being a report. Its own header has
 * said so for a while — "this page used to be five cards of arithmetic… it is
 * now the two questions that word actually means, and both of them are answered
 * with names" — and the navigation has called it "Clients" ever since. Only the
 * address still said Analyses, which is the one label an owner reads out loud
 * when they ask for help.
 *
 * ── AND THE OLD ADDRESS KEEPS WORKING ─────────────────────────────────────
 *
 * Not out of politeness. It is in an owner's history and their bookmarks, in
 * the revalidatePath calls of three server actions, in a capture script and in
 * a test. A rename that 404s the previous address breaks the back button of the
 * person it was done for.
 *
 * THE PERIOD TRAVELS WITH IT. ?p=7 is the whole state this page carries, so a
 * redirect that dropped it would land a bookmarked week on the default month
 * and look like the bookmark had rotted.
 *
 * permanentRedirect (308), not redirect (307): the move is permanent, and 308
 * is what tells a browser and a crawler to stop asking.
 */
export default async function AnalysesMoved({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  permanentRedirect(p ? `/owner/clients?p=${encodeURIComponent(p)}` : "/owner/clients");
}
