import type { ReactNode } from "react";
import { Link } from "react-router";

type Props = {
  to: string;
  image: string;
  imageAlt: string;
  title: string;
  number: string;
  type: string;
  /** Top-right of the art: the Matchday badge, Pink or cyan. */
  badge: string;
  badgeTone: "pink" | "cyan";
  /** Top-left of the art: an extra Badge (your card status). */
  corner?: ReactNode;
  /** Small lines under the type line. */
  extra?: ReactNode;
  label: string;
  testId?: string;
};

/**
 * The Project Card from the landing's Matches page (Work page zXqSEnnGz): Card fill, 8px padding, radius 16,
 * hard 5px cyan print, cover art 300px tall with radius 10 and the Matchday badge top-right, then the Title,
 * the number in Small on the right and the competition in Small under it.
 */
export function ProjectCard({
  to,
  image,
  imageAlt,
  title,
  number,
  type,
  badge,
  badgeTone,
  corner,
  extra,
  label,
  testId,
}: Props) {
  return (
    <Link to={to} className="project-card" aria-label={label} data-testid={testId}>
      <span
        className="project-card-art"
        role="img"
        aria-label={imageAlt}
        style={{ backgroundImage: `url(${image})` }}
      >
        <span className="project-card-pills">
          {corner}
          <span className={`project-card-badge ${badgeTone === "cyan" ? "bg-cyan" : "bg-pink"}`}>
            {badge}
          </span>
        </span>
      </span>
      <span className="project-card-text">
        <span className="flex items-baseline justify-between gap-3">
          <span className="t-title min-w-0 text-balance">{title}</span>
          <span className="t-small flex-none">{number}</span>
        </span>
        <span className="t-small">{type}</span>
        {extra}
      </span>
    </Link>
  );
}
