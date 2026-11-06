import { claimShare, payPool } from "@app/core/payout";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ButtonLink } from "../../components/ui/ButtonLink";
import { Notice } from "../../components/ui/Notice";
import { Sheet } from "../../components/ui/Sheet";
import { StepLine } from "../../components/ui/StepLine";
import { useWallet } from "../../hooks/use-wallet";
import { formatMultiple, formatWif, formatWifCeil, shortHash, surname } from "../../lib/format";
import { errorSentence } from "../../lib/game/errors";
import { facts } from "../../lib/game/facts";
import { matchName, playerOf } from "../../lib/game/fixtures";
import { type MarketView, useGame } from "../../lib/game/queries";
import type { Listing, MintStep } from "../../lib/game/types";
import { ConnectWallet } from "../connect/ConnectWallet";

type Props = {
  view: MarketView;
  listings: Listing[];
  open: boolean;
  onClose: () => void;
  onBought: (listing: Listing) => void;
};

/** What this card pays if its player wins, at today's pot: the pot after the burn, shared by his cards. */
function payoutIf(view: MarketView, playerId: number): bigint {
  const cardsOn = view.lines.find((line) => line.player.id === playerId)?.cardsOn ?? 0;
  return cardsOn > 0 ? claimShare(payPool(view.info.pot, view.burnBps), cardsOn) : 0n;
}

/**
 * Sealed cards for sale on this match, cheapest first, and the buy confirm: the price is also the most you
 * can be charged (a seller who raises it in the meantime makes the buy revert instead).
 */
export function ForSaleSheet({ view, listings, open, onClose, onBought }: Props) {
  const client = useGame();
  const queryClient = useQueryClient();
  const { account } = useWallet();
  const [chosen, setChosen] = useState<Listing | null>(null);
  const [step, setStep] = useState<MintStep | null>(null);
  const [steps, setSteps] = useState<MintStep[]>([]);
  const me = account.data?.address.toLowerCase();

  const buy = useMutation({
    mutationFn: async (listing: Listing) => {
      setSteps((account.data?.allowance ?? 0n) < listing.price ? ["approve", "buy"] : ["buy"]);
      return client.buy(listing.tokenId, listing.price, setStep);
    },
    onSuccess: async (_receipt, listing) => {
      await queryClient.invalidateQueries();
      setChosen(null);
      onBought(listing);
    },
    onSettled: () => setStep(null),
  });

  const close = () => {
    if (buy.isPending) return;
    buy.reset();
    setChosen(null);
    onClose();
  };

  const player = chosen ? playerOf(view.fixture, chosen.playerId) : undefined;
  const shortfall = chosen && account.data ? chosen.price - account.data.wif : 0n;

  return (
    <Sheet open={open} onClose={close} title={chosen ? "Buy Sealed Card" : "Cards For Sale"}>
      {chosen && player ? (
        <div className="flex flex-col gap-4">
          <h2 className="t-heading pr-10">Buy {player.name}</h2>
          <p className="t-small">
            {matchName(view.fixture)}, card #{chosen.serial}, sold by{" "}
            <span className="num">{shortHash(chosen.seller)}</span>. It arrives sealed in your binder.
          </p>
          <dl className="t-small flex flex-col gap-1.5 border-y border-line-soft py-3">
            <div className="flex justify-between gap-3">
              <dt>Price</dt>
              <dd className="t-body-strong num">{formatWif(chosen.price)} $WIF</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>If he wins</dt>
              <dd className="num text-ink">
                about {formatWif(payoutIf(view, chosen.playerId))} $WIF (
                {formatMultiple(Number((payoutIf(view, chosen.playerId) * 100n) / chosen.price) / 100)})
              </dd>
            </div>
          </dl>
          <p className="t-small">{facts.saleBurnBps / 100}% of the price is burned.</p>
          {!account.data?.isRightChain ? (
            <div className="flex flex-col gap-3" data-testid="connect-inline">
              <p className="t-body-strong">Connect to buy.</p>
              <ConnectWallet />
            </div>
          ) : shortfall > 0n ? (
            <div className="flex flex-col gap-3">
              <Notice tone="warn">
                You need <span className="num">{formatWifCeil(shortfall)} more $WIF</span> for this card. Your
                balance is <span className="num">{formatWif(account.data.wif)} $WIF</span>.
              </Notice>
              <ButtonLink to={facts.poolUrl} className="w-full">
                Get $WIF <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
              </ButtonLink>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {buy.isPending ? <StepLine steps={steps} current={step} /> : null}
              {buy.isError ? <Notice tone="danger">{errorSentence(buy.error)}</Notice> : null}
              <Button
                className="submit-tall w-full"
                onClick={() => buy.mutate(chosen)}
                disabled={buy.isPending}
              >
                {buy.isPending ? "Confirm in Your Wallet…" : `Buy for ${formatWif(chosen.price)} $WIF`}
              </Button>
            </div>
          )}
          <Button
            variant="quiet"
            className="self-center"
            onClick={() => setChosen(null)}
            disabled={buy.isPending}
          >
            <ArrowLeft size={14} strokeWidth={2} aria-hidden />
            Back to the List
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <h2 className="t-heading pr-10">Cards for sale</h2>
          <p className="t-small">Cheapest first. Sales close at kickoff.</p>
          {listings.length === 0 ? (
            <p className="t-small py-4">None for sale yet.</p>
          ) : (
            <ul className="flex flex-col" aria-label="Listings">
              {listings.map((listing) => {
                const forSale = playerOf(view.fixture, listing.playerId);
                const payout = payoutIf(view, listing.playerId);
                const mine = listing.seller.toLowerCase() === me;
                return (
                  <li
                    key={String(listing.tokenId)}
                    className="flex items-center gap-3 border-b border-line-soft py-3 last:border-0"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="t-body-strong">
                        {forSale ? surname(forSale.name) : `#${listing.playerId}`}{" "}
                        <span className="t-small num">No. {forSale?.number}</span>
                      </p>
                      {/* Two short lines, so a narrow sheet never breaks "if he wins" across lines. */}
                      <p className="t-small num">
                        Card #{listing.serial} · {shortHash(listing.seller)}
                      </p>
                      <p className="t-small num">
                        {formatMultiple(Number((payout * 100n) / listing.price) / 100)} if he wins
                      </p>
                    </div>
                    <p className="t-body-strong num whitespace-nowrap">{formatWif(listing.price)} $WIF</p>
                    {mine ? (
                      <Badge tone="cyan">Your Listing</Badge>
                    ) : (
                      <Button
                        onClick={() => {
                          buy.reset();
                          setChosen(listing);
                        }}
                        aria-label={`Buy ${forSale?.name ?? "card"} for ${formatWif(listing.price)} $WIF`}
                      >
                        Buy
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}
