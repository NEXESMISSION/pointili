export const metadata = { title: "Console" };
export const dynamic = "force-dynamic";

/**
 * Deliberately a passthrough.
 *
 * The guard CANNOT live here: /admin/login is a child of this route, and a
 * layout that redirects unelevated users to /admin/login would bounce that page
 * off itself forever. (That exact loop already shipped once between /owner and
 * /owner/login.) So the console guard lives in app/admin/(console)/layout.tsx,
 * and the door sits outside it.
 */
export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
