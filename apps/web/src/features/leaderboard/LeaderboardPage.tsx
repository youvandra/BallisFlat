import { RotateCw } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { PackLoader } from "../../components/playmat/PackLoader";
import { Zone } from "../../components/playmat/Zone";
import { Chips } from "../../components/ui/Chips";
import { Notice } from "../../components/ui/Notice";
import { TextButton } from "../../components/ui/TextButton";
import { formatMultiple, formatPercent, formatWif, shortHash, surname } from "../../lib/format";
import { fixtureById, matchdayLabel, playerOf } from "../../lib/game/fixtures";
import { useHunt } from "../../lib/game/hunt";
import { fanFavourite, type LeaderMatch, type LeaderRow, rankLedger } from "../../lib/game/leaderboard";
import { type MatchView, useAccount, useBoard, useGame, useLedger, useMarkets } from "../../lib/game/queries";
import { sleeveCodes } from "../../lib/game/sleeve";

const tabs = [
  { key: "all", label: "All Time" },
  { key: "matchday", label: "This Matchday" },
] as const;
type TabKey = (typeof tabs)[number]["key"];

/** The matchday being played: the one with the next open match, else the latest on the board. */
function currentMatchday(views: readonly MatchView[]): number | null {
  const open = views.find((view) => view.state === "Open" && !view.fixture.warmUp);
  if (open) return open.fixture.matchday;
  const days = views.filter((view) => !view.fixture.warmUp).map((view) => view.fixture.matchday);
  return days.length ? Math.max(...days) : null;
}

function bestCall(row: LeaderRow): string {
  if (!row.best) return "–";
  const fixture = fixtureById(row.best.matchId);
  const player = fixture ? playerOf(fixture, row.best.playerId) : undefined;
  return `${player ? surname(player.name) : `#${row.best.playerId}`} ${formatMultiple(row.best.multiple)}`;
}

const places = [
  { label: "1st", badge: "badge", shadow: "shadow-result-pink", place: "podium-1st" },
  { label: "2nd", badge: "badge badge-cyan", shadow: "", place: "podium-2nd" },
  { label: "3rd", badge: "badge badge-note", shadow: "", place: "podium-3rd" },
] as const;

function calls(row: LeaderRow): string {
  const hunt = row.huntFinds > 0 ? `${row.huntFinds} Hunt find${row.huntFinds === 1 ? "" : "s"}` : "";
  if (row.cards === 0) return hunt;
  const rate = row.hitRate === null ? "" : ` · ${formatPercent(row.hitRate)}`;
  return `${row.callsRight}/${row.cards} called${rate}${hunt ? ` · ${hunt}` : ""}`;
}

/** The top three as cards on the mat, first place raised in the middle (stacked in order when narrow). */
function Podium({ rows, me }: { rows: LeaderRow[]; me: string | undefined }) {
  return (
    <div className="podium-wrap">
      <ol className="podium" aria-label="Top three">
        {rows.slice(0, 3).map((row, index) => {
          // The spot on the podium follows the order; the badge and print follow the rank, so wallets on equal
          // records share it (1st, 1st, 3rd) exactly as the table below numbers them.
          const place = places[index] ?? places[2];
          const medal = places[Math.min(row.rank, 3) - 1] ?? places[2];
          const isMe = row.wallet.toLowerCase() === me;
          return (
            <li
              key={row.wallet}
              data-me={isMe}
              data-testid={isMe ? "leader-me" : undefined}
              className={`result ${medal.shadow} ${place.place}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={medal.badge}>{medal.label}</span>
                {isMe ? <span className="t-zone">You</span> : null}
              </div>
              <div className="podium-body">
                <div className="podium-total">
                  <p className="t-stat num">{formatWif(row.won)}</p>
                  <p className="t-small">$WIF won</p>
                </div>
                <div className="podium-meta">
                  <p className="t-body-strong num">{shortHash(row.wallet)}</p>
                  <p className="t-small num">{calls(row)}</p>
                  <p className="t-small">Best: {bestCall(row)}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Fourth place down, one line each on the same Line Soft rules as the Fan MVP list. */
function Chasers({ rows, me }: { rows: LeaderRow[]; me: string | undefined }) {
  if (rows.length === 0) return null;
  return (
    <ol className="result gap-0 py-1.5" aria-label="The rest">
      {rows.map((row) => {
        const isMe = row.wallet.toLowerCase() === me;
        return (
          <li
            key={row.wallet}
            data-me={isMe}
            data-testid={isMe ? "leader-me" : undefined}
            className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-b border-line-soft py-3 last:border-0"
          >
            <span className="t-small num">{row.rank}</span>
            <span className="flex min-w-0 flex-col">
              <span className="t-body-strong num truncate">
                {shortHash(row.wallet)}
                {isMe ? <span className="badge ml-2">You</span> : null}
              </span>
              <span className="t-small num truncate">
                {calls(row)} · Best: {bestCall(row)}
              </span>
            </span>
            <span className="t-body-strong num">{formatWif(row.won)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Wallets ranked by $WIF won from claimed cards, and the crowd's pick next to the real winner per match. */
export function LeaderboardPage() {
  const client = useGame();
  const board = useBoard();
  const ledger = useLedger();
  const account = useAccount();
  const markets = useMarkets();
  const hunt = useHunt();
  const [params, setParams] = useSearchParams();
  const tab: TabKey = params.get("view") === "matchday" ? "matchday" : "all";
  const me = account.data?.address.toLowerCase();

  const views = board.data ?? [];
  const matchday = currentMatchday(views);
  const rows = useMemo(() => {
    const matches = new Map<number, LeaderMatch>((board.data ?? []).map((view) => [view.fixture.id, view]));
    const inMatchday = (matchId: number) => {
      const fixture = fixtureById(matchId);
      return Boolean(fixture && !fixture.warmUp && fixture.matchday === matchday);
    };
    // Hunt rounds run across matchdays, so their prizes count in All Time only.
    const finds =
      tab === "all"
        ? (hunt.data?.history ?? []).flatMap((round) =>
            round.finds.map((find) => ({ winner: find.winner, prize: round.prizeEach })),
          )
        : [];
    return rankLedger(ledger.data ?? [], matches, tab === "matchday" ? inMatchday : undefined, finds);
  }, [board.data, ledger.data, hunt.data, tab, matchday]);
  const mine = rows.find((row) => row.wallet.toLowerCase() === me);

  const loading = board.isPending || ledger.isPending;
  const failed = board.isError || ledger.isError;

  return (
    <div className="playmat">
      <div className="playmat-col col-side hide-tablet max-tab:order-1">
        <Zone label="Your Standing" size="auto" className="gap-1 px-4.5 pt-7.5 pb-4.5">
          {!account.data ? (
            <p className="t-small">Connect to see your rank.</p>
          ) : mine ? (
            <>
              <p className="t-stat num">#{mine.rank}</p>
              {/* Your won, calls and best call are in your table row; the standing card keeps only the rank. */}
              <p className="t-small">of {rows.length} wallets</p>
            </>
          ) : (
            <p className="t-small">No cards yet.</p>
          )}
        </Zone>
      </div>

      <div className="playmat-col col-fill">
        <Zone label="Leaderboard">
          <div className="zone-scroll page-end flex flex-col gap-5 px-7 pt-7.5 max-tab:px-4 max-tab:pt-6">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <h1 className="t-heading">The table</h1>
                <p className="t-small">
                  Ranked by $WIF won, Hunt prizes included. A tie goes to the earlier pick.{" "}
                  <Link to="/stats" className="text-ink underline underline-offset-4 hover:opacity-70">
                    See All Stats
                  </Link>
                </p>
              </div>
              <Chips
                label="Period"
                options={tabs}
                value={tab}
                onChange={(key) => setParams(key === "all" ? {} : { view: key }, { replace: true })}
              />
            </header>
            {client.mode === "mock" ? <Notice>Demo data: 0xdeed… wallets are simulated.</Notice> : null}
            {loading ? (
              <PackLoader />
            ) : failed ? (
              <Notice tone="danger">
                The table did not load.{" "}
                <TextButton
                  icon={RotateCw}
                  onClick={() => {
                    board.refetch();
                    ledger.refetch();
                  }}
                >
                  Try Again
                </TextButton>
              </Notice>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-start gap-2 py-6">
                <p className="t-title">No cards on the table yet</p>
              </div>
            ) : (
              <div className="flex flex-col gap-6 pt-2">
                <Podium rows={rows} me={me} />
                <Chasers rows={rows.slice(3)} me={me} />
              </div>
            )}
          </div>
        </Zone>
      </div>

      <div className="playmat-col col-side">
        <Zone label="Fan MVP" className="gap-1 px-4.5 pt-7.5 pb-4.5">
          <p className="t-small pb-2">Most-picked player vs the winner.</p>
          <ul className="zone-scroll flex flex-col">
            {views.map((view, index) => {
              const lines = markets[index]?.data?.lines ?? [];
              const fan = fanFavourite(lines);
              const winners = view.winners
                .map((id) => playerOf(view.fixture, id))
                .filter((p) => p !== undefined);
              const settled = ["Proposed", "Final", "RolledOver"].includes(view.state);
              const called = fan !== null && view.winners.includes(fan.player.id);
              return (
                <li
                  key={view.fixture.slug}
                  className="flex flex-col gap-1 border-b border-line-soft py-2.5 last:border-0"
                >
                  <Link
                    to={`/m/${view.fixture.slug}`}
                    className="flex items-baseline justify-between gap-2 transition-opacity hover:opacity-70"
                  >
                    <span className="t-body-strong">{sleeveCodes(view.fixture)}</span>
                    <span className="t-small">{matchdayLabel(view.fixture)}</span>
                  </Link>
                  <p className="t-small flex justify-between gap-2">
                    <span>Fans</span>
                    <span className="text-right text-ink">
                      {fan ? `${surname(fan.player.name)}, ${formatPercent(fan.pickShare)}` : "No picks yet"}
                    </span>
                  </p>
                  <p className="t-small flex justify-between gap-2">
                    <span>Winner</span>
                    <span className={`text-right ${settled ? "text-cyan" : ""}`}>
                      {settled && winners.length
                        ? winners.map((p) => surname(p.name)).join(", ")
                        : view.state === "Void"
                          ? "Called off"
                          : "After full time"}
                    </span>
                  </p>
                  {settled && fan ? (
                    <span className={`self-start ${called ? "badge" : "t-small"}`}>
                      {called ? "Fans Called It" : "Fans Missed"}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Zone>
      </div>
    </div>
  );
}
