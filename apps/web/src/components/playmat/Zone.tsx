import type { ReactNode } from "react";

type Props = {
  label: string;
  /** "fill" grows to the column height (Framer height 1fr), "auto" hugs its content. */
  size?: "fill" | "auto";
  /** The Field zone has the larger 28px corner. */
  field?: boolean;
  className?: string;
  children: ReactNode;
  as?: "section" | "div" | "aside";
  labelledBy?: string;
  id?: string;
};

/**
 * A print zone on the playmat (Framer "Zone" frames, e.g. JdSF3ZoTz): transparent 1px border, 18px corners,
 * 16 x 2 cyan crop marks in each corner and a pink label chip on the mat colour at top -9px, left 18px.
 * Padding is the caller's, since every zone on the landing sets its own.
 */
export function Zone({
  label,
  size = "fill",
  field = false,
  className = "",
  children,
  as: Tag = "section",
  labelledBy,
  id,
}: Props) {
  return (
    <Tag
      id={id}
      className={`zone ${size === "fill" ? "zone-fill" : "flex-none"} ${field ? "zone-field" : ""} ${className}`}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
    >
      <p className="zone-label t-zone" aria-hidden={labelledBy ? undefined : true}>
        {label}
      </p>
      {children}
    </Tag>
  );
}
