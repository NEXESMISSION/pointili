import { Splash } from "@/components/Splash";

/**
 * The owner app's loader.
 *
 * Was a bare spinner on a transparent background — fine in a browser tab and
 * wrong in an installed app, where there is no address bar, no tab throbber and
 * nothing else on screen to say the phone is still working. The mark answers
 * the question a cashier actually has mid-shift ("is this alive?") faster than
 * a rotating ring does.
 *
 * Not `full`: this sits inside the owner shell, which already paints the
 * background and holds the nav in place — and the tabs staying put is itself a
 * signal that nothing has crashed.
 */
export default function Loading() {
  return <Splash />;
}
