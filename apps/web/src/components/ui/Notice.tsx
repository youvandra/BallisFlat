import type { ReactNode } from "react";

type Props = { tone?: "info" | "warn" | "danger"; children: ReactNode; className?: string };

const tones = { info: "", warn: "notice-warn", danger: "notice-danger" } as const;

/**
 * A short message as a Card panel with the hard cyan print (pink for a warning); an error uses the Submit /
 * Error fill and border. Status is carried by the words too, never colour alone.
 */
export function Notice({ tone = "info", children, className = "" }: Props) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`notice t-small text-ink ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  );
}
