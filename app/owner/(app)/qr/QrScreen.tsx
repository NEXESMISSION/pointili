"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Mon QR, reduced to the two things an owner does with it.
 *
 * The page used to open with a title, a subtitle, the print kit's format
 * picker, three buttons, and a four-item list explaining where to put a sticker
 * — before the QR itself was fully on screen. All of it true, none of it what
 * somebody came for: they came to SHOW the code, or to send it somewhere.
 *
 * So the code is the page. Copy the link, or open the card the way a customer
 * sees it. Everything else — print, download, the sizes, the advice — is behind
 * the "…", which is where a thing you do once a month belongs.
 *
 * The glow is not decoration either: it is what stops a white slab on a dark
 * app reading as a broken image placeholder.
 */
export function QrScreen({
  url,
  svg,
  logoUrl,
  emoji,
  cafeName,
  children,
}: {
  url: string;
  /** The QR as inline SVG — rendered server-side so there is no flash. */
  svg: string;
  logoUrl: string | null;
  emoji: string;
  cafeName: string;
  /** The print kit, revealed by the "…". */
  children: ReactNode;
}) {
  const router = useRouter();
  const [more, setMore] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="mx-auto w-full max-w-[430px] print:max-w-none">
      {/* ── header: out, whose shop, everything else ── */}
      <div className="flex items-center justify-between print:hidden">
        <button
          type="button"
          onClick={() => router.push("/owner")}
          aria-label="Retour"
          className="grid h-11 w-11 place-items-center rounded-full text-white/80 transition active:scale-95"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        {/* the shop, so a cashier holding two phones knows which till this is */}
        <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-[#7c56e8]/25 ring-1 ring-white/15">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
            <img src={logoUrl} alt={cafeName} className="h-full w-full object-cover" />
          ) : (
            <span className="text-[22px]">{emoji}</span>
          )}
        </span>

        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          aria-label={more ? "Masquer les options" : "Imprimer, télécharger, formats"}
          className={`grid h-11 w-11 place-items-center rounded-full transition active:scale-95 ${
            more ? "bg-white/[0.12] text-white" : "text-white/80"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
            <circle cx="5" cy="12" r="1.9" />
            <circle cx="12" cy="12" r="1.9" />
            <circle cx="19" cy="12" r="1.9" />
          </svg>
        </button>
      </div>

      {/* ── the code, which is the page ── */}
      <div className="mt-4 rounded-[30px] border border-white/[0.08] bg-white/[0.03] px-6 py-10 print:border-0 print:bg-transparent print:p-0">
        <div className="relative mx-auto w-full max-w-[300px]">
          <span
            aria-hidden
            className="absolute inset-[-9%] rounded-[36px] print:hidden"
            style={{ background: "radial-gradient(closest-side, rgba(124,86,232,.85), transparent 78%)" }}
          />
          {/*
            White plate, dark modules — the polarity the QR spec assumes and
            every scanner accepts. The DINER's screen can invert safely because
            the only decoder that reads it is this product's own; a sticker on a
            table is read by whatever camera a stranger happens to be holding.
          */}
          <div className="relative rounded-[26px] bg-white p-5 shadow-[0_20px_60px_-20px_rgba(124,86,232,.9)] print:shadow-none">
            <div className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full">
              <div dangerouslySetInnerHTML={{ __html: svg }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── the two things you do with it ── */}
      <div className="mt-4 space-y-3 print:hidden">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(url).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              },
              () => {},
            );
          }}
          className="flex w-full items-center justify-center gap-2.5 rounded-[22px] border border-white/[0.12] bg-white/[0.05] py-4 text-[15px] font-bold text-white transition active:scale-[0.99]"
        >
          {copied ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px] text-[#7ff0b0]">
                <path d="m5 13 4 4L19 7" />
              </svg>
              Lien copié
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]">
                <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
                <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" />
              </svg>
              Copier le lien
            </>
          )}
        </button>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2.5 rounded-[22px] bg-[#7c3aed] py-4 text-[15px] font-bold text-white shadow-[0_18px_40px_-16px_rgba(124,58,237,1)] transition active:scale-[0.99]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]">
            <path d="M15 3h6v6M10 14 21 3" />
            <path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
          </svg>
          Voir la carte client
        </a>
      </div>

      {/*
        Kept, not deleted. Printing a sticker is the single most valuable thing
        this page enables — it is just not a thing anyone does twice in a day,
        so it does not get to sit between an owner and their own QR code.
      */}
      {more && <div className="mt-4 print:mt-0">{children}</div>}
    </div>
  );
}
