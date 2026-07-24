import Image from "next/image";
import Link from "next/link";

/**
 * Public auth shell — deliberately OUTSIDE app/owner/(app)/layout.tsx, whose
 * guard redirects here. Nesting these under the guard would be an infinite
 * redirect loop.
 *
 * Modern, friendly: the brand on a soft lilac field, a single centered card
 * (each page fills it), matching the royal / o-card system used everywhere else.
 */
export default function OwnerAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="o-shell modern flex min-h-dvh flex-col items-center px-5 py-9">
      <Link href="/" className="mb-7 mt-2 inline-flex items-center gap-2">
        <Image src="/logo-icon.png" alt="" width={30} height={30} priority className="h-[26px] w-auto" />
        <span className="text-[18px] font-extrabold tracking-[-0.02em] text-charcoal">
          pointili<span className="text-royal2">.online</span>
        </span>
      </Link>
      <div className="w-full max-w-[400px]">{children}</div>
    </div>
  );
}
