import type { ReactNode } from "react";
import { Link } from "react-router";
import { type ButtonVariant, buttonStyles } from "./button-styles";

type Props = { to: string; children: ReactNode; variant?: ButtonVariant; className?: string };

export function ButtonLink({ to, children, variant = "primary", className = "" }: Props) {
  const classes = `${buttonStyles[variant]} ${className}`;
  if (/^https?:/.test(to)) {
    return (
      <a href={to} target="_blank" rel="noreferrer" className={classes}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={classes}>
      {children}
    </Link>
  );
}
