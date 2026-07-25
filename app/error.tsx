"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

/**
 * The app-wide boundary. Catches anything without a closer one — including a
 * throw in the café layout (getCafe) that a segment error.tsx can't reach.
 */
export default function AppError() {
  return (
    <ErrorScreen
      title="Un souci de notre côté"
      message="Quelque chose n'a pas répondu. Réessaie dans un instant."
      /*
        A full reload, not reset().

        This boundary exists to catch a throw in the LAYOUT (getCafe). reset()
        only re-renders the segment below the boundary, so for exactly that
        failure the button did nothing. Reloading always re-runs the layout.
      */
      reset={() => window.location.reload()}
      homeHref="/"
      homeLabel="Accueil"
    />
  );
}
