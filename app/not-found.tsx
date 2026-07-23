import Link from "next/link";
import { Logo } from "@/components/Logo";

/**
 * The default Next 404 is a white page in Inter — jarring after a kraft app, and
 * the most likely way to land here is a mistyped café slug from a QR.
 */
export default function NotFound() {
  return (
    <div className="app-shell paper-grain flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo size={22} />

      <div className="mt-8 w-full rounded-xl border border-line bg-paper2 px-5 py-8">
        <p className="ticket-label">Erreur 404</p>
        <h1 className="mt-2 font-display text-[26px]">Ce café n&apos;existe pas</h1>
        <p className="mx-auto mt-2 max-w-[28ch] text-[13.5px] leading-relaxed text-ink2">
          Le lien est peut-être incomplet. Scannez à nouveau le QR posé sur votre
          table.
        </p>

        <div className="tear mt-5" />

        <Link
          href="/"
          className="mt-4 inline-block text-[11px] font-bold text-brand underline underline-offset-4"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
