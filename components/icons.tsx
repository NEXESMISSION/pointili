/**
 * Icons — kept deliberately few.
 *
 * Le Ticket speaks in type, not iconography: the nav is Space Mono with a ◆
 * marker, and features are numbered (№ 01) rather than badged. So this file
 * holds only the handful of marks the system actually calls for. The sparkle is
 * lifted from the logo.
 *
 * 24x24 grid, currentColor.
 */

type P = { className?: string };

/** The logo's four-point sparkle — the brand's core motif. */
export function Sparkle({ className = "h-5 w-5" }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2c.3 3.9 1.9 6.6 5.6 7.6.6.2.6 1 0 1.2C13.9 12 12.3 14.6 12 22c-.3-7.4-1.9-10-5.6-11.2-.6-.2-.6-1 0-1.2C10.1 8.6 11.7 5.9 12 2Z" />
    </svg>
  );
}

/** Stacked loyalty cards — lifted from the logo. */
export function CardIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="2.5" y="7" width="15" height="12" rx="3" />
      <path d="M6.5 7V6a3 3 0 0 1 3.6-2.9l8.5 1.7A3 3 0 0 1 21 8.5l-1.4 8.2" />
    </svg>
  );
}

/** A wheel reads best as a rim + spokes + a pointer — not an asterisk. */
export function WheelIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="13" r="8" />
      <path d="M12 5v16M4 13h16" opacity=".55" />
      <circle cx="12" cy="13" r="1.9" fill="currentColor" stroke="none" />
      <path d="M12 1.6 14 5H10l2-3.4Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function GiftIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 11h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Z" />
      <path d="M2.5 7.5h19V11h-19zM12 7.5V22" />
      <path d="M12 7.5S10.8 3 8.4 3a2.3 2.3 0 0 0 0 4.5H12Zm0 0S13.2 3 15.6 3a2.3 2.3 0 0 1 0 4.5H12Z" />
    </svg>
  );
}

export function QrIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3zM18 18h3v3h-3z" strokeLinecap="round" />
    </svg>
  );
}

export function ChartIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M3 21h18" />
      <path d="M6 21v-7M11 21V6M16 21v-4M21 21V10" />
    </svg>
  );
}

export function TillIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19" />
      <path d="M6 14.5h4" strokeLinecap="round" />
    </svg>
  );
}

export function SlidersIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="8" cy="17" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function HomeIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3.5 10.5 12 3l8.5 7.5" />
      <path d="M5.5 9.5V21h13V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

export function UserIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.5-3.4 4.2-5 7.5-5s6 1.6 7.5 5" />
    </svg>
  );
}

export function BellIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6 9a6 6 0 0 1 12 0c0 5 1.5 6.5 2 7H4c.5-.5 2-2 2-7Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

/** A scan viewfinder — the "show me at the counter" mark. */
export function ScanIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M4 12h16" opacity=".9" />
    </svg>
  );
}

export function ChevronDownIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CheckIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}
