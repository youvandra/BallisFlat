import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

type Props = {
  to: string;
  label: string;
  testId?: string;
  image: string;
  /** Front: one status pill, the matchday line, the title and the headline number. */
  status: ReactNode;
  kicker: string;
  title: string;
  headline: string;
  /** Back: the schedule and the numbers, as label/value rows. */
  rows: { label: string; value: string }[];
  cta: string;
};

/**
 * A fixture on the board. The face stays quiet (cover art, one status, title, pot); hovering or focusing it
 * turns the card over to the schedule and numbers. On touch screens there is no hover, so the face also
 * carries the kickoff line and a tap opens the match.
 */
export function MatchCard({ to, label, testId, image, status, kicker, title, headline, rows, cta }: Props) {
  const kickoff = rows[0];
  return (
    <Link to={to} className="match-card" aria-label={label} data-testid={testId}>
      <span className="match-card-inner">
        <span className="match-card-face match-card-front" style={{ backgroundImage: `url(${image})` }}>
          <span className="match-card-top">{status}</span>
          <span className="match-card-bottom">
            <span className="t-small match-card-kicker">{kicker}</span>
            <span className="t-title text-balance">{title}</span>
            <span className="t-small num match-card-touch-only">{kickoff?.value}</span>
            <span className="t-body-strong num text-pink">{headline}</span>
          </span>
        </span>
        <span className="match-card-face match-card-back" aria-hidden>
          <span className="t-title text-balance">{title}</span>
          <dl className="match-card-rows">
            {rows.map((row) => (
              <span key={row.label} className="match-card-row">
                <dt className="t-small">{row.label}</dt>
                <dd className="t-body-strong num">{row.value}</dd>
              </span>
            ))}
          </dl>
          <span className="text-link mt-auto">
            {cta}
            <ArrowRight size={14} strokeWidth={2} aria-hidden />
          </span>
        </span>
      </span>
    </Link>
  );
}
