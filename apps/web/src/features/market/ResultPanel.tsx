import { claimShare } from "@app/core/payout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { PlayerHoloCard } from "../../components/playmat/PlayerHoloCard";
import { ArrowLink } from "../../components/ui/ArrowLink";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { formatCountdown, formatWif } from "../../lib/format";
import { errorSentence } from "../../lib/game/errors";
import { fixtureById, matchName, playerOf } from "../../lib/game/fixtures";
import { type MarketView, useGame } from "../../lib/game/queries";
import { useConnectPrompt } from "../connect/ConnectPrompt";

function SourceLink({ url }: { url: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-link min-h-11">
      Rating Source <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
    </a>
  );
}

function Winners({ view }: { view: MarketView }) {
  const players = view.winners.flatMap((id) => {
    const player = playerOf(view.fixture, id);
    return player ? [player] : [];
  });
  if (players.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {players.map((player) => (
        <PlayerHoloCard
          key={player.id}
          player={player}
          team={player.side === "home" ? view.fixture.home : view.fixture.away}
          rarity="legendary"
          label="Winner"
          setLabel="MVP"
        />
      ))}
    </div>
  );
}

function Breakdown({ view }: { view: MarketView }) {
  const { info } = view;
  const perCard = claimShare(info.payPool, info.winningCards);
  const rows = [
    { label: "Pot, $WIF", value: info.pot },
    { label: `Burned (${view.burnBps / 100}%)`, value: info.burned },
    { label: "Paid to Winners", value: info.winningCards > 0 ? info.payPool : 0n },
    { label: `Per Card (${info.winningCards} winning)`, value: perCard },
  ];
  return (
    <dl className="result gap-0 p-3.5">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-3 border-b border-line-soft py-2 last:border-0"
        >
          <dt className="t-small">{row.label}</dt>
          <dd className="t-body-strong num whitespace-nowrap">{formatWif(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Settlement state inside the market: live, settling with the dispute countdown, final, rolled over, void. */
export function ResultPanel({ view, now }: { view: MarketView; now: number }) {
  const client = useGame();
  const queryClient = useQueryClient();
  const prompt = useConnectPrompt();
  const disputeWindow = useQuery({
    queryKey: ["disputeWindow"],
    queryFn: () => client.disputeWindow(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const finalize = useMutation({
    mutationFn: () => client.finalize(view.fixture.id),
    onSettled: () => queryClient.invalidateQueries(),
  });
  const { state, info } = view;

  if (state === "Open" || state === "None") return null;

  if (state === "Locked") {
    return <p className="t-small">Picks closed. Result after full time.</p>;
  }

  if (state === "Void") {
    return (
      <>
        <h2 className="t-title">This match was called off</h2>
        <p className="t-small">
          Cards refund {formatWif(info.price)} $WIF in the{" "}
          <Link to="/binder" className="text-link">
            Binder <ArrowRight size={14} strokeWidth={2} aria-hidden />
          </Link>
          .
        </p>
      </>
    );
  }

  if (state === "Proposed") {
    const finalAt = info.proposedAt + (disputeWindow.data ?? 0);
    const left = finalAt - now;
    return (
      <div className="flex flex-col gap-4">
        <Winners view={view} />
        <div className="flex flex-col gap-2">
          <h2 className="t-title">Result posted</h2>
          {disputeWindow.data !== undefined && left > 0 ? (
            <p className="t-stat text-ink">
              <span className="t-small block">Final in </span>
              <span className="num">{formatCountdown(left)}</span>
            </p>
          ) : disputeWindow.data !== undefined ? (
            <div className="flex flex-col gap-2">
              <p className="t-small text-ink">The window is over. Anyone can finalize the match now.</p>
              {finalize.isError ? <Notice tone="danger">{errorSentence(finalize.error)}</Notice> : null}
              <Button onClick={() => prompt(() => finalize.mutate())} disabled={finalize.isPending}>
                {finalize.isPending ? "Finalizing…" : "Finalize Match"}
              </Button>
            </div>
          ) : null}
          <SourceLink url={info.sourceUrl} />
        </div>
      </div>
    );
  }

  if (state === "RolledOver") {
    const next = fixtureById(info.nextMatch);
    return (
      <div className="flex flex-col gap-4">
        <Winners view={view} />
        <div className="flex flex-col gap-3">
          <h2 className="t-title">
            Nobody called it. {formatWif(info.payPool)} $WIF moved to{" "}
            {next ? (
              <Link to={`/m/${next.slug}`} className="text-link">
                {matchName(next)} <ArrowRight size={14} strokeWidth={2} aria-hidden />
              </Link>
            ) : (
              "the treasury"
            )}
            .
          </h2>
          <Breakdown view={view} />
          <SourceLink url={info.sourceUrl} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Winners view={view} />
      <div className="flex flex-col gap-3">
        <h2 className="t-title">Final. Winning cards can be burned to claim.</h2>
        <Breakdown view={view} />
        <div className="flex flex-wrap items-center gap-x-4">
          <SourceLink url={info.sourceUrl} />
          <ArrowLink to="/binder">Go to Your Binder</ArrowLink>
        </div>
      </div>
    </div>
  );
}
