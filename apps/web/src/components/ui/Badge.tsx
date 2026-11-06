import type { ReactNode } from "react";

type Tone = "pink" | "cyan" | "note";

/** Badge (Framer Discipline Badge YB1nn0ddN): a pill of Small text in Mat on Pink, cyan, or Note for "Coming Soon". */
export function Badge({
  tone = "pink",
  children,
  className = "",
  testId,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  const fill = tone === "cyan" ? "badge-cyan" : tone === "note" ? "badge-note" : "";
  return (
    <span className={`badge ${fill} ${className}`} data-testid={testId}>
      {children}
    </span>
  );
}
