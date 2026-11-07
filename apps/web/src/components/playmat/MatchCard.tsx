import { ArrowRight, Info, Undo2 } from "lucide-react";
import { type ReactNode, useState } from "react";
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
 * A fixture on the board. The face stays quiet (cover art, one status, title, pot) and opens the match; a
 * small Details button turns the card over to the schedule and numbers, and Back turns it again. Nothing
 * moves on hover. The hidden face is inert, so keyboard focus only ever lands on the side you can see.
 */
export function MatchCard({ to, label, testId, image, status, kicker, title, headline, rows, cta }: Props) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className={`match-card${flipped ? " is-flipped" : ""}`} data-testid={testId}>
      <span className="match-card-inner">
        <span
          className="match-card-face match-card-front"
          style={{ backgroundImage: `url(${image})` }}
          inert={flipped}
        >
          <Link to={to} className="match-card-open" aria-label={label} />
          <span className="match-card-top">
            {status}
            <button
              type="button"
              className="match-card-flip"
              onClick={() => setFlipped(true)}
              aria-label={`Details for ${title}`}
            >
              <Info size={13} strokeWidth={2} aria-hidden />
              Details
            </button>
          </span>
          <span className="match-card-bottom">
            <span className="t-small match-card-kicker">{kicker}</span>
            <span className="t-title text-balance">{title}</span>
            <span className="t-body-strong num text-pink">{headline}</span>
          </span>
        </span>
        <span className="match-card-face match-card-back" inert={!flipped}>
          <span className="match-card-top">
            <span className="t-title text-balance">{title}</span>
            <button type="button" className="match-card-flip" onClick={() => setFlipped(false)}>
              <Undo2 size={13} strokeWidth={2} aria-hidden />
              Back
            </button>
          </span>
          <dl className="match-card-rows">
            {rows.map((row) => (
              <span key={row.label} className="match-card-row">
                <dt className="t-small">{row.label}</dt>
                <dd className="t-body-strong num">{row.value}</dd>
              </span>
            ))}
          </dl>
          <Link to={to} className="text-link mt-auto">
            {cta}
            <ArrowRight size={14} strokeWidth={2} aria-hidden />
          </Link>
        </span>
      </span>
    </div>
  );
}
