import { type ReactNode, useState } from "react";
import { PlayerHoloCard } from "../../components/playmat/PlayerHoloCard";
import { SealedPack } from "../../components/playmat/SealedPack";
import { ArrowLink } from "../../components/ui/ArrowLink";
import { Button } from "../../components/ui/Button";
import { ButtonLink } from "../../components/ui/ButtonLink";
import { formatWif, formatWifCompact } from "../../lib/format";
import type { BinderGroup } from "../../lib/game/binder";
import { matchName, playerOf } from "../../lib/game/fixtures";
import { useOpened } from "../../lib/game/opened";
import type { BinderCard } from "../../lib/game/queries";
import { sleeveCodes } from "../../lib/game/sleeve";

type Props = {
  card: BinderCard;
  group: BinderGroup;
  justClaimed: boolean;
  busy: boolean;
  onBurn: () => void;
  onSell: () => void;
};

function resultLine(card: BinderCard, group: BinderGroup): string {
  const winners = card.match.winners.map((id) => playerOf(card.fixture, id)?.name ?? `#${id}`).join(" and ");
  if (group === "Claimed")
    return card.burned?.kind === "refunded"
      ? "Refunded after the match was called off."
      : `Won with ${winners}.`;
  if (group === "Claim") return `${winners} was the top-rated player. You called it.`;
  if (group === "Refund") return "Called off. Refund ready.";
  if (group === "Missed")
    return winners ? `${winners} took it. This card stays as your record.` : "Nobody called it.";
  if (card.match.state === "Proposed")
    return `${winners} posted as the result. Final after the dispute window.`;
  if (card.match.state === "Locked") return "Result after full time.";
  return "Open until kickoff.";
}

/** A sealed pack that flips (click, Enter or Space) to its actions, like the Holo Card flips to its result. */
function FlipPack({ label, front, back }: { label: string; front: ReactNode; back: ReactNode }) {
  const [flipped, setFlipped] = useState(false);
  const toggle = () => setFlipped((value) => !value);
  return (
    <div className="flip-pack" data-flipped={flipped}>
      <div className="flip-pack-inner">
        <button
          type="button"
          className="flip-pack-face"
          tabIndex={flipped ? -1 : 0}
          aria-label={`${label}, flip for actions`}
          aria-hidden={flipped}
          onClick={toggle}
        >
          {front}
          <span className="flip-pack-pill">↻ Flip</span>
        </button>
        <div className="flip-pack-face flip-pack-back" inert={!flipped}>
          <button type="button" className="flip-pack-pill" onClick={toggle} aria-label="Flip back">
            ↻ Back
          </button>
          {back}
        </div>
      </div>
    </div>
  );
}

const labels: Record<BinderGroup, string> = {
  Claim: "Winner",
  Sealed: "Sealed",
  Waiting: "Waiting",
  Missed: "Missed",
  Refund: "Refund",
  Claimed: "Claimed",
};

/**
 * A card in the binder: the landing's Holo Card, which flips (click or Enter) to the match result, its
 * rating source and the claim or refund. A sealed pack flips the same way to Open Pack and Sell.
 * Under every card sits only Open Match.
 */
export function BinderSlot({ card, group, justClaimed, busy, onBurn, onSell }: Props) {
  const team = card.player?.side === "away" ? card.fixture.away : card.fixture.home;
  const ghost = group === "Claimed" || justClaimed;
  // A burned card was seen when it was claimed; anything else stays sealed until its pack is torn.
  const opened = useOpened(card.tokenId) || card.opened || Boolean(card.burned);
  if (!card.player) return null;
  const { info } = card.match;
  const packUrl = `/m/${card.fixture.slug}/open/${card.tokenId}`;

  // Claim and refund live on the back of the card, next to the result they act on.
  function backAction() {
    if (justClaimed) return null;
    if (group === "Claim")
      return (
        <Button
          onClick={onBurn}
          disabled={busy}
          className="w-full whitespace-nowrap"
          aria-label={`Burn To Claim ${formatWif(card.claimable)} $WIF`}
        >
          {busy ? "Burning…" : `Claim ${formatWifCompact(card.claimable)} $WIF`}
        </Button>
      );
    if (group === "Refund")
      return (
        <Button variant="secondary" onClick={onBurn} disabled={busy} className="w-full">
          {busy ? "Refunding…" : `Refund ${formatWifCompact(info.price)} $WIF`}
        </Button>
      );
    return null;
  }

  if (!opened) {
    // Sealed cards can be opened, and sold while the match still trades (before kickoff).
    const canSell = card.match.state === "Open";
    return (
      <div className="flex flex-col gap-3" data-testid={`binder-card-${card.tokenId}`}>
        <FlipPack
          label={`Sealed pack, ${sleeveCodes(card.fixture)}`}
          front={
            <span className="relative block h-full">
              <SealedPack fixture={card.fixture} className="h-full" />
              {card.listing ? (
                <span
                  className="badge absolute -top-2.5 left-1/2 z-10 -translate-x-1/2"
                  data-testid="listed-badge"
                >
                  Listed · {formatWif(card.listing.price)} $WIF
                </span>
              ) : null}
            </span>
          }
          back={
            <>
              <p className="t-zone">{sleeveCodes(card.fixture)}</p>
              <p className="t-title">Sealed</p>
              {group === "Claim" || group === "Refund" ? (
                <p className="t-small">Open it, then {group === "Claim" ? "claim" : "refund"}.</p>
              ) : null}
              <div className="mt-auto flex flex-col gap-2.5">
                <ButtonLink to={packUrl} className="whitespace-nowrap px-3">
                  Open Pack
                </ButtonLink>
                {canSell ? (
                  <Button variant="secondary" onClick={onSell} className="whitespace-nowrap px-3">
                    {card.listing ? "Edit Listing" : "Sell"}
                  </Button>
                ) : null}
              </div>
            </>
          }
        />
        <ArrowLink to={`/m/${card.fixture.slug}`} className="t-small min-h-9 self-center">
          Open Match
        </ArrowLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid={`binder-card-${card.tokenId}`}>
      <div className={`${ghost ? "ghost" : ""} ${justClaimed ? "burn-claim" : ""}`}>
        <PlayerHoloCard
          player={card.player}
          team={team}
          rarity={group === "Claim" ? "legendary" : group === "Waiting" ? "rare" : "common"}
          label={labels[group]}
          number={`#${card.serial}/${info.cards}`}
          setLabel={sleeveCodes(card.fixture)}
          back={{
            title: matchName(card.fixture),
            summary: resultLine(card, group),
            results: [
              { value: formatWifCompact(info.pot), label: "Pot $WIF" },
              { value: String(info.cards), label: "Cards" },
              { value: String(info.winningCards), label: "Winners" },
            ],
            linkLabel: info.sourceUrl ? "Rating Source" : "No Result Yet",
            link: info.sourceUrl,
          }}
          backAction={backAction()}
        />
      </div>
      <ArrowLink to={`/m/${card.fixture.slug}`} className="t-small min-h-9 self-center">
        Open Match
      </ArrowLink>
    </div>
  );
}
