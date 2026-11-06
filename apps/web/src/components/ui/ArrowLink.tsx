import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

type Props = {
  to: string;
  children: ReactNode;
  /** back: ← before the text; forward: → after it; out: ↗ after it and a new tab. */
  direction?: "back" | "forward" | "out";
  className?: string;
};

const icon = { size: 14, strokeWidth: 2, className: "flex-none", "aria-hidden": true } as const;

/**
 * A text link with the app's one arrow set: ← for going back, → for moving forward inside the app and ↗
 * only for a link that leaves it in a new tab.
 */
export function ArrowLink({ to, children, direction = "forward", className = "" }: Props) {
  const classes = `t-body-strong inline-flex min-h-11 items-center gap-1.5 rounded-input transition-opacity hover:opacity-70 ${className}`;
  if (direction === "out") {
    return (
      <a href={to} target="_blank" rel="noreferrer" className={classes}>
        <span>{children}</span>
        <ArrowUpRight {...icon} />
      </a>
    );
  }
  return (
    <Link to={to} className={classes}>
      {direction === "back" ? <ArrowLeft {...icon} /> : null}
      <span>{children}</span>
      {direction === "forward" ? <ArrowRight {...icon} /> : null}
    </Link>
  );
}
