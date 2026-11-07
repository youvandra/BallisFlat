import { remainingForPlayer } from "@app/core/payout";
import { ArrowRight, RotateCw } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { MatchSleeve } from "../../components/playmat/MatchSleeve";
import { PackLoader } from "../../components/playmat/PackLoader";
import { Zone } from "../../components/playmat/Zone";
import { ArrowLink } from "../../components/ui/ArrowLink";
import { Button } from "../../components/ui/Button";
import { ButtonLink } from "../../components/ui/ButtonLink";
import { Chips } from "../../components/ui/Chips";
import { Notice } from "../../components/ui/Notice";
import { StatePill, stateLabel, stateTone } from "../../components/ui/StatePill";
import { TextButton } from "../../components/ui/TextButton";
import { Toast } from "../../components/ui/Toast";
import { useNow } from "../../hooks/use-now";
import { matchArtUrl, useCoverArtReady } from "../../lib/art";
import { formatCountdown, formatKickoff, formatWif } from "../../lib/format";
import { fixtureBySlug, matchName, shownKickoff } from "../../lib/game/fixtures";
import { type MarketView, type PlayerLine, useAccount, useListings, useMarket } from "../../lib/game/queries";
import type { Listing, MatchState } from "../../lib/game/types";
import { ConfirmSheet } from "./ConfirmSheet";
import { ForSaleSheet } from "./ForSaleSheet";
import { PlayerTile } from "./PlayerTile";
import { ResultPanel } from "./ResultPanel";
import { useHeldCard } from "./use-held-card";

const sorts = [
  { key: "picked", label: "Most Picked" },
  { key: "underdog", label: "Underdog" },
  { key: "number", label: "Number" },
] as const;
type SortKey = (typeof sorts)[number]["key"];

const comparators: Record<SortKey, (a: PlayerLine, b: PlayerLine) => number> = {
  picked: (a, b) => b.cardsOn - a.cardsOn || a.player.number - b.player.number,
  underdog: (a, b) => b.multiple - a.multiple || a.player.number - b.player.number,
  number: (a, b) => a.player.number - b.player.number,
};

/** One short sentence on where the match stands. */
function summary(view: MarketView): string {
  if (view.state === "Open") return "Pick your man of the match before kickoff.";
  if (view.state === "Locked") return "Picks closed. Result after full time.";
  if (view.state === "Proposed") return "Result posted. Final soon.";
  if (view.state === "Final") return "Final. Winners can claim.";
  if (view.state === "RolledOver") return "Nobody called it. Pot rolled on.";
  if (view.state === "Void") return "Called off. Cards refund.";
  return "";
}

// The steps in order, named with the status pill's words (Open, Live, Settling, Claim). Shown once, over the title.
const track = ["Open", "Locked", "Proposed", "Final"] as const;
const trackIndex: Record<MatchState, number> = {
  None: -1,
  Open: 0,
  Locked: 1,
  Proposed: 2,
  Final: 3,
  RolledOver: 3,
  Void: -1,
};

/**
 * Where the match is on its way to a payout: Open > Live > Settling > Claim. A readout, not a control: the
 * current step as the header pill's badge (same word, same tone), the others Small Graphite, joined by arrows.
 */
function StateTrack({ state }: { state: MatchState }) {
  const current = trackIndex[state];
  // Void (or unlisted) is off the track: the pill alone says it.
  if (current < 0) return <StatePill state={state} />;
  const names = track.map((step) => stateLabel(step === "Final" && state === "RolledOver" ? state : step));
  return (
    <ol
      aria-label={`Match status: ${names[current]}`}
      className="flex flex-wrap items-center gap-x-2 gap-y-1"
    >
      {names.map((name, index) => (
        <li key={name} className="flex items-center gap-2">
          {index > 0 ? (
            <span className="t-small" aria-hidden>
              →
            </span>
          ) : null}
          <span
            aria-current={index === current ? "step" : undefined}
            className={
              index === current
                ? `badge ${stateTone(state) === "cyan" ? "badge-cyan" : ""}`
                : "t-small whitespace-nowrap"
            }
          >
            {name}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A match: the sleeve on the Field, the squad grid in the middle, your pick or the result on the right. */
export function MarketPage() {
  const { slug = "" } = useParams();
  const fixture = fixtureBySlug(slug);
  const market = useMarket(slug);
  const account = useAccount();
  const held = useHeldCard(fixture?.id ?? 0, account.data);
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const listings = useListings(fixture?.id);
  const saleCount = listings.data?.length ?? 0;
  useCoverArtReady();
  const [saleOpen, setSaleOpen] = useState(false);
  const [bought, setBought] = useState<Listing | null>(null);
  const dismissToast = useCallback(() => setBought(null), []);
  // Pick a Player: bring the squad into view and put the keyboard on its first open tile.
  const focusSquad = () => {
    document.getElementById("squad")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document
      .querySelector<HTMLButtonElement>("#squad .grid-squad button:not(:disabled)")
      ?.focus({ preventScroll: true });
  };

  const side = params.get("side") === "away" ? "away" : "home";
  const sort: SortKey = sorts.some((option) => option.key === params.get("sort"))
    ? (params.get("sort") as SortKey)
    : "picked";
  const pickId = Number(params.get("pick") ?? Number.NaN);

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: key !== "pick" });
  };

  const lines = useMemo(
    () => (market.data?.lines ?? []).filter((line) => line.player.side === side).sort(comparators[sort]),
    [market.data, side, sort],
  );

  if (!fixture) {
    return (
      <div className="playmat">
        <div className="playmat-col col-fill">
          <Zone label="Match Card" className="items-start gap-4 p-9">
            <h1 className="t-heading">No match at this address</h1>
            <ButtonLink to="/matches">Back to Matches</ButtonLink>
          </Zone>
        </div>
      </div>
    );
  }

  const view = market.data;
  const isOpen = view?.state === "Open";
  const settled = view ? ["Final", "Proposed", "RolledOver"].includes(view.state) : false;
  const selected =
    !view || Number.isNaN(pickId) ? null : (view.lines.find((line) => line.player.id === pickId) ?? null);
  const team = side === "home" ? fixture.home : fixture.away;
  const statusLine: ReactNode = !view
    ? "Reading the match…"
    : isOpen
      ? `Picks close in ${formatCountdown(view.info.kickoff - now)}`
      : summary(view).split(".")[0];

  return (
    <div className="playmat">
      <div className={`playmat-col col-case max-tab:hidden ${isOpen ? "" : "hide-tablet"}`}>
        <Zone label="Field" field className="items-center justify-center gap-5 px-5 pt-7.5 pb-5">
          <MatchSleeve fixture={fixture} />
          <p className="t-small num text-center">{statusLine}</p>
          <ArrowLink to="/matches" direction="back">
            All Matches
          </ArrowLink>
        </Zone>
      </div>

      <div className="playmat-col col-fill">
        <Zone label="Match Card">
          <div className="zone-scroll page-end flex flex-col gap-5 px-7 pt-7.5 max-tab:px-4 max-tab:pt-6">
            {/* Where the sleeve column is hidden (phone, tablet after kickoff) it becomes this header strip. */}
            <div className={`flex items-center gap-3.5 ${isOpen ? "tab:hidden" : "desk:hidden"}`}>
              <img
                src={matchArtUrl(fixture.slug)}
                alt=""
                className="h-18 w-12 flex-none rounded-input object-cover"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="t-title tab:hidden">{matchName(fixture)}</p>
                <p className="t-small num">{statusLine}</p>
                <ArrowLink to="/matches" direction="back" className="min-h-8 self-start">
                  Matches
                </ArrowLink>
              </div>
            </div>

            {isOpen ? (
              <div className="tab:hidden flex flex-wrap gap-2">
                <Button onClick={focusSquad} className="flex-1 whitespace-nowrap">
                  Pick a Player
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setSaleOpen(true)}
                  className="flex-1 whitespace-nowrap"
                  data-testid="buy-sealed"
                >
                  Buy Sealed{saleCount ? ` · ${saleCount}` : ""}
                </Button>
              </div>
            ) : null}

            <header className="flex flex-col gap-2.5 max-tab:sr-only">
              {/* The matchday, number, competition and date all live on the sleeve; only the state is repeated. */}
              <div>{view ? <StateTrack state={view.state} /> : null}</div>
              <div className="flex flex-wrap items-end justify-between gap-4">
                {/* The summary stays under the title it explains, also when the buttons wrap below them. */}
                <div className="flex min-w-0 flex-col gap-2.5">
                  <h1 className="t-display min-w-0 text-balance">{matchName(fixture)}</h1>
                  {view ? <p className="t-body text-pretty">{summary(view)}</p> : null}
                </div>
                {isOpen ? (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={focusSquad} className="whitespace-nowrap">
                      Pick a Player
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setSaleOpen(true)}
                      className="whitespace-nowrap"
                      data-testid="buy-sealed"
                    >
                      Buy Sealed{saleCount ? ` · ${saleCount}` : ""}
                    </Button>
                  </div>
                ) : null}
              </div>
            </header>

            {market.isPending ? (
              <PackLoader label="Reading the match…" />
            ) : market.isError || !view ? (
              <Notice tone="danger" className="w-full">
                This match did not load.{" "}
                <TextButton icon={RotateCw} onClick={() => market.refetch()}>
                  Try Again
                </TextButton>
              </Notice>
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-y border-line-soft py-4.5">
                  {/* Two by two on a narrow phone, where the fourth fact wrapped onto a line of its own. */}
                  <dl className="flex flex-wrap gap-x-7 gap-y-2 max-tab:gap-x-5 max-narrow:grid max-narrow:w-full max-narrow:grid-cols-2 max-narrow:gap-y-3">
                    {[
                      {
                        label: "Kickoff",
                        value: formatKickoff(shownKickoff(view.fixture, view.info.kickoff)),
                      },
                      { label: "Pot", value: `${formatWif(view.info.pot)} $WIF` },
                      { label: "Cards", value: String(view.info.cards) },
                      { label: "Per Card", value: `${formatWif(view.info.price)} $WIF` },
                      ...(view.info.rolledIn > 0n
                        ? [{ label: "Rolled In", value: `${formatWif(view.info.rolledIn)} $WIF` }]
                        : []),
                    ].map((item) => (
                      <div key={item.label} className="flex flex-col gap-0.5">
                        <dt className="t-small">{item.label}</dt>
                        <dd className="t-body-strong num whitespace-nowrap">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <section
                  id="squad"
                  aria-labelledby="squad-title"
                  className="flex w-full scroll-mt-6 flex-col gap-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="squad-title" className="t-heading">
                      The squads
                    </h2>
                    <div className="flex flex-wrap items-center gap-3">
                      <Chips
                        label="Squad"
                        options={[
                          { key: "home", label: fixture.home.name },
                          { key: "away", label: fixture.away.name },
                        ]}
                        value={side}
                        onChange={(key) => update("side", key)}
                      />
                      <span className="flex items-center gap-2">
                        <span className="t-small">Sort</span>
                        <Chips
                          label="Sort"
                          options={sorts}
                          value={sort}
                          onChange={(key) => update("sort", key)}
                        />
                      </span>
                    </div>
                  </div>
                  {lines.length === 0 ? (
                    <p className="t-small py-6">No squad published for this side yet.</p>
                  ) : (
                    // pt-2.5: the "Your Pick" badge sits 10px over its tile and would touch the row above.
                    <ul className="grid-squad pt-2.5">
                      {lines.map((line) => (
                        <li key={line.player.id}>
                          <PlayerTile
                            line={line}
                            team={team}
                            showMultiple={isOpen}
                            isMine={held.data?.playerId === line.player.id}
                            soldOut={remainingForPlayer(view.info.maxPerPlayer, line.cardsOn) === 0}
                            tone={
                              settled ? (view.winners.includes(line.player.id) ? "winner" : "dim") : "default"
                            }
                            onPick={() => update("pick", String(line.player.id))}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>
        </Zone>
      </div>

      {view && !isOpen ? (
        <div className="playmat-col col-side">
          <Zone label="Result" className="px-4.5 pt-7.5 pb-4.5">
            <div className="zone-scroll page-end flex flex-col gap-4">
              <ResultPanel view={view} now={now} />
            </div>
          </Zone>
        </div>
      ) : null}

      {view ? <ConfirmSheet view={view} line={selected} onClose={() => update("pick", null)} /> : null}
      {view ? (
        <ForSaleSheet
          view={view}
          listings={listings.data ?? []}
          open={saleOpen}
          onClose={() => setSaleOpen(false)}
          onBought={(listing) => {
            setSaleOpen(false);
            setBought(listing);
          }}
        />
      ) : null}
      {bought ? (
        <Toast onClose={dismissToast}>
          Card #{bought.serial} is in your binder, sealed.{" "}
          <Link to="/binder" className="text-link">
            Open Binder <ArrowRight size={14} strokeWidth={2} aria-hidden />
          </Link>
        </Toast>
      ) : null}
    </div>
  );
}
