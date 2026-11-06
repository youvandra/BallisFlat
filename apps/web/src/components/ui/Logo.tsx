import { logo } from "@app/config/brand";
import type * as React from "react";

/**
 * The BIF mark in the current text colour: white on the dark playmat, ink-dark on pink and cyan
 * card backs. Letters and outer ring are one shape, so the gap between them shows the background.
 * Without a title it is decorative (the surrounding link or label names it).
 */
export function Logo({
  className = "",
  title,
  style,
}: {
  className?: string;
  title?: string;
  style?: React.CSSProperties;
}) {
  const path = <path fill="currentColor" fillRule="evenodd" d={logo.path} />;
  if (title) {
    return (
      <svg viewBox={logo.viewBox} className={className} style={style} role="img">
        <title>{title}</title>
        {path}
      </svg>
    );
  }
  return (
    <svg viewBox={logo.viewBox} className={className} style={style} aria-hidden="true">
      {path}
    </svg>
  );
}
