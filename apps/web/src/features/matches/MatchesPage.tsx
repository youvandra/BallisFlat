import { ArrowRight, RotateCw } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { CardBackStack } from "../../components/playmat/CardBackStack";
import { SummonCard } from "../../components/playmat/framer";
import { MatchCard } from "../../components/playmat/MatchCard";
import { PackLoader } from "../../components/playmat/PackLoader";
import { Zone } from "../../components/playmat/Zone";
import { Badge } from "../../components/ui/Badge";
import { Notice } from "../../components/ui/Notice";
import { TextButton } from "../../components/ui/TextButton";
import { useNow } from "../../hooks/use-now";
import { matchArtUrl, useCoverArtReady } from "../../lib/art";
import { formatCountdown, formatKickoff, formatKickoffShort, formatWif, surname } from "../../lib/format";
import { facts } from "../../lib/game/facts";
import { matchdayLabel, matchName, playerOf, shownKickoff } from "../../lib/game/fixtures";
import { useOpenedSet } from "../../lib/game/opened";
import { type BinderCard, type MatchView, useAccount, useBoard, useMyCards } from "../../lib/game/queries";
import { type CardStatus, cardStatus, matchPhase } from "../../lib/game/status";
import { palette } from "../../lib/palette";

/** Statuses that mean you hold something here, in Pink; the rest in cyan. */
const loud: ReadonlySet<CardStatus> = new Set(["Sealed", "Joined", "Claim", "Refund"]);
/** Open matches lead the grid, settled ones trail it. */
const phaseOrder = { Open: 0, Live: 1, Settled: 2 } as const;
/** Competitions read as categories: "UEFA Nations League 2026-27" is "Nations League". */
/** Matchday 5 is Pink, Matchday 6 cyan and the warm-up Note, exactly like the Framer Discipline Key. */
const chipTone = (day: string) => {
  if (day === "Warm-up") return "bg-note";
  return Number(day.replace(/\D/g, "")) % 2 === 1 ? "bg-pink" : "bg-cyan";
};

type Row = { view: MatchView; card: BinderCard | undefined; status: CardStatus };

/** One settled match as the archive reads it: who won, and where the pot went. */
function settledLine(view: MatchView): { head: string; tail: string } {
  if (view.state === "Void") return { head: "Void", tail: "Every card refunded" };
  if (view.state === "RolledOver")
    return {
      head: "Nobody called it",
      // with no next match the contract burns the uncalled pot
      tail: `${formatWif(view.info.payPool)} $WIF ${view.info.nextMatch ? "rolled on" : "burned"}`,
    };
  const names = view.winners.map((id) => surname(playerOf(view.fixture, id)?.name ?? `#${id}`));
  return { head: names.join(", ") || "Final", tail: `${formatWif(view.info.burned)} $WIF burned` };
}

/**
 * The Matches page, copied from the Framer /matches page (Work page zXqSEnnGz): the Board zone with the
 * heading, intro, Discipline Key and the Settled archive; the Fixtures zone with the match cards; and the
 * Next Kickoff Summon Card. No filters and no flipping deck: the board is the read-only key Framer draws.
 */
export function MatchesPage() {
  const board = useBoard();
  const account = useAccount();
  const cards = useMyCards(account.data);
  const opened = useOpenedSet();
  const now = useNow();
  const ink = palette();
  useCoverArtReady();

  const all = useMemo<Row[]>(
    () =>
      (board.data ?? []).map((view) => {
        const card = cards.data?.find((item) => item.matchId === view.fixture.id);
        const isOpen = Boolean(card && (card.opened || opened.has(String(card.tokenId))));
        return { view, card, status: cardStatus(view, card, isOpen) };
      }),
    [board.data, cards.data, opened],
  );

  const rows = useMemo(
    () => [...all].sort((a, b) => phaseOrder[matchPhase(a.view)] - phaseOrder[matchPhase(b.view)]),
    [all],
  );

  // Matchdays in order, the played warm-up last.
  const days = useMemo(() => {
    const labels = [...new Set(all.map(({ view }) => matchdayLabel(view.fixture)))].sort((a, b) =>
      a === "Warm-up" ? 1 : b === "Warm-up" ? -1 : a.localeCompare(b),
    );
    return labels.map((day) => ({
      day,
      count: all.filter(({ view }) => matchdayLabel(view.fixture) === day).length,
    }));
  }, [all]);

  const settled = useMemo(
    () =>
      all
        .filter(({ view }) => matchPhase(view) === "Settled")
        .map(({ view }) => view)
        .sort((a, b) => shownKickoff(b.fixture, b.info.kickoff) - shownKickoff(a.fixture, a.info.kickoff)),
    [all],
  );

  const next = all.find(({ view }) => view.state === "Open")?.view;
  const kickoff = next ? Math.floor(Date.parse(next.fixture.kickoff) / 1000) : 0;

  return (
    <div className="playmat">
      <div className="playmat-col col-side">
        <Zone label="Board" className="gap-3.5 px-4.5 pt-7.5 pb-4.5">
          <h1 className="t-heading">The board</h1>
          <p className="t-small">Tap a match to pick.</p>
          <ul className="flex flex-col pt-2" aria-label="Matchdays">
            {days.map(({ day, count }) => (
              <li key={day} className="flex items-center gap-3 py-2.5">
                <span className={`swatch ${chipTone(day)}`} aria-hidden />
                <span className="flex flex-1 items-baseline justify-between gap-2">
                  <span className="t-body-strong">{day}</span>
                  <span className="t-small num whitespace-nowrap">
                    {count} {count === 1 ? "match" : "matches"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Zone>
        <Zone label="Settled" size="auto" className="items-start gap-3 px-4.5 pt-5 pb-4 max-tab:hidden">
          {settled.length === 0 ? (
            <>
              <CardBackStack />
              <p className="t-small">Results land here after full time.</p>
            </>
          ) : (
            <ul className="flex w-full flex-col" aria-label="Settled matches">
              {settled.map((view) => {
                const line = settledLine(view);
                return (
                  <li key={view.fixture.slug} className="border-line-soft border-b py-2.5 last:border-b-0">
                    <Link
                      to={`/m/${view.fixture.slug}`}
                      className="flex flex-col gap-0.5 rounded-input transition-opacity hover:opacity-70"
                    >
                      <span className="t-small">
                        {view.fixture.home.code} v {view.fixture.away.code} · {matchdayLabel(view.fixture)}
                      </span>
                      <span className="t-body-strong">{line.head}</span>
                      <span className="t-small num">{line.tail}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            to="/rules"
            className="t-body-strong inline-flex items-center gap-1.5 whitespace-nowrap rounded-input transition-opacity hover:opacity-70"
          >
            <span>How settling works</span>
            <ArrowRight size={14} strokeWidth={2} aria-hidden />
          </Link>
        </Zone>
      </div>

      <div className="playmat-col col-fill">
        <Zone label="Fixtures">
          <div className="zone-scroll page-end px-6 pt-7 max-tab:px-3">
            {board.isPending ? (
              <PackLoader />
            ) : board.isError ? (
              <Notice tone="danger">
                The matches did not load.{" "}
                <TextButton icon={RotateCw} onClick={() => board.refetch()}>
                  Try Again
                </TextButton>
              </Notice>
            ) : rows.length === 0 ? (
              <div className="py-6">
                <p className="t-title">No matches on the board yet</p>
              </div>
            ) : (
              <ul className="grid-fixtures" aria-label={`${rows.length} matches`}>
                {rows.map(({ view, card, status }) => (
                  <li key={view.fixture.slug}>
                    <MatchCard
                      to={`/m/${view.fixture.slug}`}
                      testId={`match-${view.fixture.slug}`}
                      label={`${matchName(view.fixture)}, ${formatKickoff(shownKickoff(view.fixture, view.info.kickoff))}, ${status}`}
                      image={matchArtUrl(view.fixture.slug)}
                      status={
                        <Badge tone={loud.has(status) ? "pink" : "quiet"} testId="match-status">
                          {status}
                        </Badge>
                      }
                      kicker={`${matchdayLabel(view.fixture)} · ${formatKickoffShort(shownKickoff(view.fixture, view.info.kickoff))}`}
                      title={matchName(view.fixture)}
                      headline={`Pot ${formatWif(view.info.pot)} $WIF`}
                      rows={[
                        {
                          label: "Kickoff",
                          value: formatKickoff(shownKickoff(view.fixture, view.info.kickoff)),
                        },
                        ...(view.state === "Open"
                          ? [{ label: "Picks close in", value: formatCountdown(view.info.kickoff - now) }]
                          : []),
                        { label: "Pot", value: `${formatWif(view.info.pot)} $WIF` },
                        { label: "Cards", value: String(view.info.cards) },
                        ...(card ? [{ label: "Your card", value: `#${card.serial}` }] : []),
                      ]}
                      cta={view.state === "Open" && !card ? "Pick a Player" : "Open Match"}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Zone>
      </div>

      <div className="playmat-col col-side hide-tablet">
        <Zone label="Next Kickoff" className="items-center px-4.5 pt-7.5 pb-4.5">
          {next ? (
            <div className="aspect-sleeve max-h-full w-full max-w-70 max-tab:h-110">
              <SummonCard
                title={matchName(next.fixture)}
                cost={`${formatWif(facts.price)} $WIF`}
                prompt={`Picks close in ${formatCountdown(next.info.kickoff - now)}`}
                heading={matchName(next.fixture)}
                rows={`Kickoff:${formatKickoff(kickoff)}\nCloses in:${formatCountdown(next.info.kickoff - now)}\nPot:${formatWif(next.info.pot)} $WIF\nCards:${next.info.cards}`}
                cta="Pick a Player"
                link={`/m/${next.fixture.slug}`}
                back={ink.card}
                edge="color-mix(in srgb, var(--color-ink) 18%, var(--color-mat))"
                card={ink.card}
                ink={ink.ink}
                muted={ink.graphite}
                dark={ink.ink}
                accent={ink.pink}
                onAccent={ink.mat}
                rule={ink.lineSoft}
              />
            </div>
          ) : (
            <p className="t-small">No match is open for picks right now.</p>
          )}
        </Zone>
      </div>
    </div>
  );
}
