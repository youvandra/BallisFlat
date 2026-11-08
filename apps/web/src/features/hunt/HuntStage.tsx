import { product } from "@app/config/constants";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { PackRip } from "../../components/playmat/framer";
import { PlayerHoloCard, positionNames } from "../../components/playmat/PlayerHoloCard";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Logo } from "../../components/ui/Logo";
import { Notice } from "../../components/ui/Notice";
import { StepLine } from "../../components/ui/StepLine";
import { type PackFinish, packFoil } from "../../framer/PackRip";
import { playerArtUrl } from "../../lib/art";
import { surname } from "../../lib/format";
import { huntPlayer, tierKeys } from "../../lib/game/hunt";
import type { HuntStep, HuntTier } from "../../lib/game/types";
import { palette } from "../../lib/palette";

/** What the stage shows: the wallet steps, the drawn pack, or its cards one at a time. */
export type Stage =
  | { kind: "working"; tier: HuntTier; steps: HuntStep[]; step: HuntStep | null; error: string | null }
  | { kind: "pack"; tier: HuntTier; packId: bigint; players: number[]; found: boolean }
  | { kind: "cards"; tier: HuntTier; packId: bigint; players: number[]; found: boolean };

type Props = {
  stage: Stage | null;
  target: number;
  onTorn: () => void;
  onClose: () => void;
  /** Shown under the cards when this pack found the wanted player. */
  claim?: ReactNode;
};

const swapMs = 380;

/**
 * The Hunt's focus stage: the page blurs behind a full-screen dialog, and the pack, then each card, sits
 * large in the middle. Built on <dialog> so focus is trapped and the dock is covered; it only closes when
 * nothing is waiting on the wallet.
 */
export function HuntStage({ stage, target, onTorn, onClose, claim }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = stage !== null;
  const busy = stage?.kind === "working" && stage.error === null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label="Your pack"
      className="hunt-stage"
      onCancel={(event) => {
        // Escape never interrupts a wallet step.
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      {stage ? (
        <div className="hunt-stage-body">
          {busy ? null : (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              title="Close"
              className="icon-button absolute top-5 right-5 z-10"
            >
              <X size={18} aria-hidden />
            </button>
          )}
          {stage.kind === "working" ? <Working stage={stage} onClose={onClose} /> : null}
          {stage.kind === "pack" ? <Pack stage={stage} target={target} onTorn={onTorn} /> : null}
          {stage.kind === "cards" ? (
            <Deck stage={stage} target={target} onClose={onClose} claim={claim} />
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

function Working({ stage, onClose }: { stage: Extract<Stage, { kind: "working" }>; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-7 text-center">
      <span
        className={`pack-tile hunt-stage-wait w-48 ${stage.error ? "" : "is-waiting"}`}
        data-tier={tierKeys[stage.tier.id]}
        style={{ background: packFoil(stage.tier.name as PackFinish) }}
        role="img"
        aria-label={`${stage.tier.name} pack`}
      >
        <Logo className="pack-logo text-on-ink" title={product.name} />
        <span className="t-title text-on-ink">{stage.tier.name}</span>
        <span className="t-small text-on-ink">{stage.tier.cards} cards</span>
      </span>
      <div className="flex flex-col items-center gap-3">
        <h2 className="t-heading">
          {stage.error ? "The pack did not come through" : `Getting your ${stage.tier.name} pack`}
        </h2>
        {stage.error ? (
          <>
            <Notice tone="danger">{stage.error}</Notice>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </>
        ) : (
          <>
            <StepLine steps={stage.steps} current={stage.step} labels={{ buy: "Buy Pack" }} />
            <p className="t-small max-w-80">
              {stage.step === "seal"
                ? "The draw uses the next block, so nobody sees it before you pay."
                : "Confirm in your wallet."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Pack({
  stage,
  target,
  onTorn,
}: {
  stage: Extract<Stage, { kind: "pack" }>;
  target: number;
  onTorn: () => void;
}) {
  const ink = palette();
  const hit = stage.players.find((id) => id === target);
  const lead = huntPlayer(hit ?? stage.players[0] ?? target);
  const wanted = huntPlayer(target);
  const tierInk = [ink.ink, ink.note, ink.cyan][stage.tier.id] ?? ink.pink;
  if (!lead) return null;
  return (
    <div className="flex h-full w-full flex-col items-center gap-2" data-testid="hunt-pack">
      <p className="t-body-strong pt-6 text-center">Your {stage.tier.name} pack. Tear it open.</p>
      <div className="relative w-full max-w-120 flex-1">
        <PackRip
          key={stage.packId.toString()}
          finish={stage.tier.name as PackFinish}
          packTitle={stage.tier.name}
          packLogo
          packSubtitle={`${stage.tier.cards} cards, pack #${stage.packId.toString()}`}
          badge={`Find ${wanted ? surname(wanted.player.name) : "him"}`}
          hint="Drag across the top to open"
          showReset={false}
          cardRarityLabel={hit ? "Wanted" : lead.team.code}
          onReveal={() => window.setTimeout(onTorn, 900)}
          soundToggle={false}
          cardImage={{ src: playerArtUrl(lead.player, lead.team), alt: lead.player.name }}
          cardName={surname(lead.player.name)}
          cardSubName={lead.player.name}
          cardNumber={`1/${stage.players.length}`}
          cardType={positionNames[lead.player.position]}
          cardYear={stage.tier.name}
          canvasState="sealed"
          ink={ink.mat}
          hintColor={ink.graphite}
          shadow="rgba(0, 0, 0, 0)"
          titleScale={1}
          printShadow={tierInk}
          printOffset={14}
          sound
          handCount={0}
        />
      </div>
    </div>
  );
}

/**
 * The cards one at a time, wanted card first when the pack found him. A tap sends the front card to the
 * back of the stack and brings the next one forward.
 */
function Deck({
  stage,
  target,
  onClose,
  claim,
}: {
  stage: Extract<Stage, { kind: "cards" }>;
  target: number;
  onClose: () => void;
  claim?: ReactNode;
}) {
  // The wanted card leads, as it did out of the pack; the rest keep their draw order.
  const order = [...stage.players.keys()].sort(
    (a, b) => Number(stage.players[b] === target) - Number(stage.players[a] === target),
  );
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const total = order.length;
  const wanted = huntPlayer(target);

  const next = () => {
    if (leaving !== null || total < 2) return;
    setLeaving(index);
    window.setTimeout(() => {
      setIndex((current) => (current + 1) % total);
      setLeaving(null);
    }, swapMs);
  };

  const cardAt = (position: number) => {
    const slot = order[position % total] ?? 0;
    const playerId = stage.players[slot] ?? 0;
    return { slot, playerId, entry: huntPlayer(playerId), isHit: playerId === target };
  };
  const front = cardAt(leaving ?? index);

  return (
    <div className="flex flex-col items-center gap-5" data-testid="hunt-reveal">
      {stage.found ? (
        <Badge>You found {wanted ? surname(wanted.player.name) : "him"}</Badge>
      ) : (
        <p className="t-small">
          No {wanted ? surname(wanted.player.name) : "wanted card"} in this one. Every card goes to your
          binder.
        </p>
      )}
      <div className="hunt-deck">
        {total > 2 ? <span className="hunt-deck-back is-far" aria-hidden /> : null}
        {total > 1 ? <span className="hunt-deck-back" aria-hidden /> : null}
        {front.entry ? (
          <button
            key={`${front.slot}-${leaving === null ? "in" : "out"}`}
            type="button"
            className={`hunt-deck-card ${leaving === null ? "is-entering" : "is-leaving"}`}
            onClick={next}
            aria-label={
              total > 1 ? `${front.entry.player.name}. Show the next card` : front.entry.player.name
            }
          >
            <PlayerHoloCard
              player={front.entry.player}
              team={front.entry.team}
              rarity={front.isHit ? "legendary" : "rare"}
              label={front.isHit ? "Wanted" : front.entry.team.code}
              setLabel={stage.tier.name}
              number={`${(leaving ?? index) + 1}/${total}`}
            />
          </button>
        ) : null}
      </div>
      <p className="t-small num" data-testid="hunt-deck-count">
        {(leaving ?? index) + 1} / {total}
        {total > 1 ? ". Tap the card for the next one." : ""}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {stage.found ? claim : null}
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
