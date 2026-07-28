export const metadata = { title: "Console" };
export const dynamic = "force-dynamic";

/**
 * Deliberately a passthrough.
 *
 * It used to exist because /admin/login was a child of this route, and a layout
 * that redirected here would have bounced that page off itself forever. That
 * page is gone — the console has one door now, /owner/login — but the guard
 * still belongs in app/admin/(console)/layout.tsx, next to the chrome it
 * governs, not in a shell that knows nothing about it.
 */
export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
