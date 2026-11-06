import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** A text link that acts in place (Try Again, Clear Filters): Body Strong Ink with a 14px icon, gap 6. */
export function TextButton({
  icon: Icon,
  onClick,
  children,
  className = "",
}: {
  icon: LucideIcon;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button type="button" onClick={onClick} className={`text-link ${className}`}>
      <Icon size={14} strokeWidth={2} aria-hidden />
      {children}
    </button>
  );
}
