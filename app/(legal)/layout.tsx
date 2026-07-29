import Link from "next/link";
import { BrandLockup } from "@/components/BrandMark";

/**
 * Shell for the legal pages.
 *
 * Same dark surface as the landing, deliberately quieter: no gradients, no
 * lights, generous measure. These are read, not scanned.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-dark min-h-dvh bg-[#070510] text-white">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <BrandLockup size={32} accent="#8b5cf6" />
        </Link>
        <Link href="/" className="text-[13px] text-white/45 hover:text-white/80">
          Retour
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24 pt-4">{children}</main>
    </div>
  );
}

/* Shared bits, so both pages read as one document. */
export function H1({ children, sub }: { children: React.ReactNode; sub: string }) {
  return (
    <>
      <h1 className="text-[34px] font-extrabold leading-[1.1] tracking-[-0.03em] md:text-[42px]">
        {children}
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-white/45">{sub}</p>
      <div className="my-9 h-px bg-white/10" />
    </>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-11 text-[19px] font-bold tracking-[-0.015em] text-white">{children}</h2>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[15px] leading-[1.75] text-white/65">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="mt-3 space-y-2 text-[15px] leading-[1.7] text-white/65">{children}</ul>;
}

export function LI({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#8b5cf6]" />
      <span>{children}</span>
    </li>
  );
}
