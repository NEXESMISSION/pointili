import Link from "next/link";
import { Logo } from "@/components/Logo";

/**
 * Public auth shell — deliberately OUTSIDE app/owner/(app)/layout.tsx, whose
 * guard redirects here. Nesting these under the guard would be an infinite
 * redirect loop.
 */
export default function OwnerAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell paper-grain flex min-h-dvh flex-col px-6 py-8">
      <Link href="/" className="self-start">
        <Logo size={22} />
      </Link>
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </div>
  );
}
