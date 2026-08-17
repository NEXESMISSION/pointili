"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

/**
 * Console-facing. The likeliest cause is a session that stopped being valid
 * mid-task — the console re-checks against the auth server on every read, so a
 * sign-out elsewhere lands here rather than showing stale data. The safe way
 * back is the console door; retry stays for transient DB errors.
 *
 * (This used to say "an elevation that lapsed". There is no elevation: the
 * step-up screen was removed and the comment outlived it.)
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
