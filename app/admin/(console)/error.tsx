"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

/**
 * Console-facing. The likeliest cause here is an elevation that lapsed mid-task
 * (the page re-checks `requireElevatedSuperAdmin`), so the safe way back is the
 * console door, not a bare retry. Retry stays for transient DB errors.
 */
export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      title="Console indisponible"
      message="Ta session console a peut-être expiré, ou la base n'a pas répondu."
      reset={reset}
      homeHref="/admin"
      homeLabel="Reconnecter la console"
    />
  );
}
