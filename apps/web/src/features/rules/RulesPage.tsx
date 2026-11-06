import { links } from "@app/config/constants";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { TurnPhases } from "../../components/playmat/framer";
import { Zone } from "../../components/playmat/Zone";
import { ArrowLink } from "../../components/ui/ArrowLink";
import { formatWif } from "../../lib/format";
import { facts } from "../../lib/game/facts";
import { listedFixtures, matchName } from "../../lib/game/fixtures";
import { useBoard } from "../../lib/game/queries";
import { turnPhaseProps } from "../../lib/game/rules";
import { sleeveCodes, sleeveTag } from "../../lib/game/sleeve";
import { palette } from "../../lib/palette";

const price = formatWif(facts.price);
const burnPercent = facts.burnBps / 100;
const payPercent = 100 - burnPercent;
const windowHours = facts.disputeWindow / 3600;
const matchdays = [...new Set(listedFixtures.filter((f) => !f.warmUp).map((f) => f.matchday))].sort();
const onBoard = listedFixtures.filter((fixture) => !fixture.warmUp);

const roadmap = [
  {
    when: "Now",
    tag: `Nations League, Matchdays ${matchdays.join(" and ")}`,
    title: "One settler, open to challenge",
    text: `Top FotMob rating, posted with the link. ${windowHours}h to flag.`,
    stats: [
      { value: String(onBoard.length), label: "matches" },
      { value: "1", label: "settler" },
    ],
  },
  {
    when: "Dec 2026",
    tag: "Club matchdays",
    title: "A new board every week",
    text: "New fixtures every week.",
    stats: [
      { value: "Same", label: "rules" },
      { value: "More", label: "matches" },
    ],
  },
  {
    when: "2027",
    tag: "Verified results",
    title: "Attested settlement",
    text: "An enclave verifier signs every result.",
    stats: [{ value: "No", label: "single settler" }],
  },
] as const;

const elsewhere = [
  { label: "World is Flat", to: new URL(links.rules).origin },
  { label: "Blockscout", to: `${facts.explorerUrl}/token/${facts.wifAddress}` },
  { label: "DexScreener", to: facts.poolUrl },
] as const;

/** The landing's Rules page, in the app: house rules, this week, how a match plays out, the board, roadmap. */
export function RulesPage() {
  const ink = palette();
  const board = useBoard();
  const next = board.data?.find((view) => view.state === "Open");

  return (
    <div className="playmat">
      <div className="playmat-col col-side hide-tablet">
        <Zone label="House Rules" size="auto" className="gap-4 px-4.5 pt-7.5 pb-4.5">
          {[
            { value: price, label: "$WIF per card" },
            { value: `${burnPercent}%`, label: "of every pot burned" },
            { value: `${windowHours}h`, label: "to flag a result" },
          ].map((rule) => (
            <div key={rule.label} className="flex flex-col gap-1">
              <p className="t-stat num">{rule.value}</p>
              <p className="t-small">{rule.label}</p>
            </div>
          ))}
        </Zone>
        <Zone label="This Week" className="gap-3 px-4.5 pt-7.5 pb-4.5">
          <div className="sticky-note">
            <p className="t-zone text-mat">Matchday {matchdays.join(" and ")}</p>
            <dl className="flex flex-col gap-2 text-mat">
              <div>
                <dt className="t-small text-mat">Next kickoff</dt>
                <dd className="t-body-strong text-mat">
                  {next ? matchName(next.fixture) : "Reading the board…"}
                </dd>
              </div>
            </dl>
          </div>
        </Zone>
      </div>

      <div className="playmat-col col-fill phone-first">
        <Zone label="Rules">
          <div className="zone-scroll page-end flex flex-col gap-8 px-7 pt-7.5 max-tab:px-4 max-tab:pt-6">
            <section className="flex max-w-170 flex-col gap-4">
              <h1 className="t-heading text-balance">One match. One pick. One card.</h1>
              <p className="t-body">
                Pick the man of the match for {price} $WIF. Right call splits {payPercent}% of the pot;{" "}
                {burnPercent}% burns.
              </p>
            </section>

            <section aria-labelledby="phases-title" className="flex flex-col gap-4">
              <h2 id="phases-title" className="t-heading">
                How a match plays out
              </h2>
              <TurnPhases summary="Every match runs the same four phases" {...turnPhaseProps(ink)} />
            </section>

            <section aria-labelledby="roadmap-title" className="flex flex-col gap-4">
              <h2 id="roadmap-title" className="t-heading">
                Roadmap
              </h2>
              <ol className="grid-results">
                {roadmap.map((step, index) => (
                  <li key={step.when} className={`result ${index === 0 ? "shadow-result-pink" : ""}`}>
                    <p className="t-zone">
                      {step.when} · {step.tag}
                    </p>
                    <p className="t-title">{step.title}</p>
                    <p className="t-small">{step.text}</p>
                    <dl className="mt-auto flex gap-4 pt-2">
                      {step.stats.map((stat) => (
                        <div key={stat.label} className="flex flex-col">
                          <dt className="t-small order-2">{stat.label}</dt>
                          <dd className="t-title num text-cyan">{stat.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </Zone>
      </div>

      <div className="playmat-col col-side">
        <Zone label="On the Board" className="gap-1 px-4.5 pt-7.5 pb-4.5">
          <ul className="flex flex-col">
            {onBoard.map((fixture) => (
              <li key={fixture.slug} className="border-b border-line-soft last:border-0">
                <Link
                  to={`/m/${fixture.slug}`}
                  className="flex min-h-12 items-center justify-between gap-3 rounded-input py-2 transition-opacity hover:opacity-70"
                  aria-label={`${matchName(fixture)}, ${sleeveTag(fixture)}`}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="t-small num">{sleeveTag(fixture)}</span>
                    <span className="t-body-strong">{sleeveCodes(fixture)}</span>
                  </span>
                  <ArrowRight size={14} strokeWidth={2} className="flex-none" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <p className="t-small mt-2">
            <span className="t-body-strong num">{onBoard.length}</span> matches on the board
          </p>
        </Zone>
        <Zone label="Elsewhere" size="auto" className="gap-0 px-4.5 pt-6 pb-3">
          {elsewhere.map((link) => (
            <ArrowLink key={link.label} to={link.to} direction="out">
              {link.label}
            </ArrowLink>
          ))}
        </Zone>
      </div>
    </div>
  );
}
