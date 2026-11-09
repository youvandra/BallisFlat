import { remainingForPlayer } from "@app/core/payout";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { PickBadge } from "../../components/playmat/PickBadge";
import { PlayerHoloCard, positionNames } from "../../components/playmat/PlayerHoloCard";
import { Button } from "../../components/ui/Button";
import { ButtonLink } from "../../components/ui/ButtonLink";
import { Notice } from "../../components/ui/Notice";
import { Sheet } from "../../components/ui/Sheet";
import { StepLine } from "../../components/ui/StepLine";
import { useWallet } from "../../hooks/use-wallet";
import { formatMultiple, formatPercent, formatWif, formatWifCeil } from "../../lib/format";
import { errorSentence } from "../../lib/game/errors";
import { facts } from "../../lib/game/facts";
import { matchName, playerOf } from "../../lib/game/fixtures";
import { useOpened } from "../../lib/game/opened";
import { type MarketView, type PlayerLine, useGame } from "../../lib/game/queries";
import { sleeveCodes } from "../../lib/game/sleeve";
import { GameError, type MintStep } from "../../lib/game/types";
import { useHeldCard } from "./use-held-card";

type Props = { view: MarketView; line: PlayerLine | null; onClose: () => void };

export function ConfirmSheet({ view, line, onClose }: Props) {
  const client = useGame();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { account } = useWallet();
  const held = useHeldCard(view.fixture.id, account.data);
  const [step, setStep] = useState<MintStep | null>(null);
  const [steps, setSteps] = useState<MintStep[]>([]);

  const mint = useMutation({
    mutationFn: async (playerId: number) => {
      const needsApproval = (account.data?.allowance ?? 0n) < view.info.price;
      setSteps(needsApproval ? ["approve", "mint"] : ["mint"]);
      return client.mint(view.fixture.id, playerId, setStep);
    },
    onSuccess: async (receipt) => {
      await queryClient.invalidateQueries();
      navigate(`/m/${view.fixture.slug}/open/${receipt.tokenId}`);
    },
    onSettled: () => setStep(null),
  });

  const open = line !== null;
  const team = line
    ? line.player.side === "home"
      ? view.fixture.home
      : view.fixture.away
    : view.fixture.home;
  const current = account.data;
  const shortfall = current ? view.info.price - current.wif : 0n;

  const close = () => {
    if (!mint.isPending) {
      mint.reset();
      onClose();
    }
  };

  const heldPlayer = held.data?.playerId != null ? playerOf(view.fixture, held.data.playerId) : undefined;
  const isMine = line !== null && held.data?.playerId === line.player.id;
  const heldOpened = useOpened(held.data?.tokenId);

  function action() {
    if (!line) return null;
    if (view.state !== "Open") return <Notice tone="warn">Picks for this match closed at kickoff.</Notice>;
    // No wallet yet, or on another network: connect right here, and the mint button takes its place.
    if (!current?.isRightChain) {
      return (
        <div className="flex flex-col gap-3" data-testid="connect-inline">
          <p className="t-body-strong">Connect a wallet to mint this card.</p>
        </div>
      );
    }
    if (held.isPending) return <div className="skeleton h-12.5 w-full rounded-pill" aria-hidden />;
    if (held.data) {
      return (
        <div className="flex flex-col gap-3">
          <Notice>
            {isMine
              ? "Your pick for this match."
              : `You already picked ${heldPlayer ? heldPlayer.name : "a player"} here.`}
          </Notice>
          <ButtonLink to={`/m/${view.fixture.slug}/open/${held.data.tokenId}`} className="w-full">
            {heldOpened ? "See Your Card" : "Open Your Pack"}
          </ButtonLink>
        </div>
      );
    }
    if (remainingForPlayer(view.info.maxPerPlayer, line.cardsOn) === 0) {
      return <Notice tone="warn">{errorSentence(new GameError("PlayerSoldOut"))}</Notice>;
    }
    if (shortfall > 0n) {
      return (
        <div className="flex flex-col gap-3">
          <Notice tone="warn">
            You need <span className="num">{formatWifCeil(shortfall)} more $WIF</span> for this card. Your
            balance is <span className="num">{formatWif(current.wif)} $WIF</span>.
          </Notice>
          <ButtonLink to={facts.poolUrl} className="w-full">
            Get $WIF <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
          </ButtonLink>
        </div>
      );
    }
    if (current.gas === 0n) {
      return <Notice tone="warn">You need a little ETH on Robinhood Chain to pay gas for the mint.</Notice>;
    }
    return (
      <div className="flex flex-col gap-3">
        {mint.isPending ? <StepLine steps={steps} current={step} /> : null}
        {mint.isError ? <Notice tone="danger">{errorSentence(mint.error)}</Notice> : null}
        <Button
          className="submit-tall w-full"
          onClick={() => mint.mutate(line.player.id)}
          disabled={mint.isPending}
        >
          {mint.isPending ? "Confirm in Your Wallet…" : `Mint for ${formatWif(view.info.price)} $WIF`}
        </Button>
        {!mint.isPending && current.allowance < view.info.price ? (
          <p className="t-small text-center">Two steps: approve $WIF, then mint the card.</p>
        ) : null}
      </div>
    );
  }

  return (
    <Sheet open={open} onClose={close} title={line ? `Pick ${line.player.name}` : "Pick"}>
      {line ? (
        <div className="flex flex-col gap-3">
          <h2 className="t-heading pr-10">{isMine ? line.player.name : `Pick ${line.player.name}`}</h2>
          <p className="t-small">
            {matchName(view.fixture)}, {formatWif(view.info.price)} $WIF per card.
          </p>
          {/* Half and half on a phone: at two fifths of a phone sheet the card's name row breaks mid-word. */}
          <div className="grid grid-cols-2 items-center gap-4 py-2 tab:grid-cols-5">
            <div className="relative tab:col-span-2">
              <PlayerHoloCard
                player={line.player}
                team={team}
                rarity="epic"
                label={isMine ? "Your Pick" : "MVP"}
                setLabel={sleeveCodes(view.fixture)}
              />
              {isMine ? <PickBadge className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2" /> : null}
            </div>
            <div className="flex min-w-0 flex-col gap-3 tab:col-span-3">
              <dl className="t-small grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt>Number</dt>
                <dd className="num text-ink">{line.player.number}</dd>
                <dt>Position</dt>
                <dd className="text-ink">{positionNames[line.player.position]}</dd>
                <dt>Team</dt>
                <dd className="text-ink">{team.name}</dd>
                {view.info.maxPerPlayer > 0 ? (
                  <>
                    <dt>Left</dt>
                    <dd className="num text-ink">
                      {remainingForPlayer(view.info.maxPerPlayer, line.cardsOn)} of {view.info.maxPerPlayer}{" "}
                      cards
                    </dd>
                  </>
                ) : null}
                <dt>Picks</dt>
                <dd className="num text-ink">
                  {line.cardsOn === 1 ? "1 card" : `${line.cardsOn} cards`}, {formatPercent(line.pickShare)}{" "}
                  of the match
                </dd>
              </dl>
              {view.state === "Open" && remainingForPlayer(view.info.maxPerPlayer, line.cardsOn) !== 0 ? (
                <div className="flex flex-col gap-1">
                  <p className="t-zone">If he wins</p>
                  <p className="t-stat text-cyan">
                    <span className="num">{formatMultiple(line.multiple)}</span>
                  </p>
                  <p className="t-small">
                    About <span className="num text-ink">{formatWif(line.share)} $WIF</span> back
                  </p>
                </div>
              ) : null}
            </div>
          </div>
          {action()}
        </div>
      ) : null}
    </Sheet>
  );
}
