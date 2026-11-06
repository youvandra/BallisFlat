/** A football drawn in one thin line (circle, centre panel, seams), the backdrop's corner mark. */
export function FootballMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
        <circle cx="14" cy="14" r="12.25" />
        <polygon points="14,9.6 18.2,12.6 16.6,17.6 11.4,17.6 9.8,12.6" />
        <path d="M14 9.6V4.6M18.2 12.6L23 11M16.6 17.6L19.6 21.8M11.4 17.6L8.4 21.8M9.8 12.6L5 11" />
      </g>
    </svg>
  );
}
