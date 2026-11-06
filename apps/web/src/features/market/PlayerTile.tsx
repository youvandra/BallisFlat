import { PickBadge } from "../../components/playmat/PickBadge";
import { PlayerHoloCard } from "../../components/playmat/PlayerHoloCard";
import { Badge } from "../../components/ui/Badge";
import { formatMultiple, formatPercent } from "../../lib/format";
import type { Team } from "../../lib/game/fixtures";
import type { PlayerLine } from "../../lib/game/queries";

type Props = {
  line: PlayerLine;
  team: Team;
  tone: "default" | "winner" | "dim";
  showMultiple: boolean;
  isMine: boolean;
  /** Every card the contract allows on this player is taken. */
  soldOut: boolean;
  onPick: () => void;
};

/**
 * One player in the squad grid, kept to what a pick needs: the surname, the shirt number big in the middle,
 * "×N if he wins" and the share of picks. The full name, position and team are in the confirm sheet.
 */
export function PlayerTile({ line, team, tone, showMultiple: open, isMine, soldOut, onPick }: Props) {
  const { player, cardsOn, multiple, pickShare } = line;
  // A sold-out player has no payout to offer a new card; your own card on him still opens.
  const showMultiple = open && !soldOut;
  const disabled = soldOut && open && !isMine;
  const picks = cardsOn === 1 ? "1 pick" : `${cardsOn} picks`;
  const footer = (
    <div className="flex flex-col gap-1.5 border-t border-line-soft px-1.5 pt-2">
      {tone === "winner" ? (
        <Badge className="self-start">Winner</Badge>
      ) : soldOut && open ? (
        <Badge tone="cyan" className="self-start">
          Sold Out
        </Badge>
      ) : showMultiple ? (
        <p className="flex items-baseline gap-1 whitespace-nowrap">
          <span className="t-body-strong num text-cyan">{formatMultiple(multiple)}</span>
          <span className="t-small">if he wins</span>
        </p>
      ) : (
        <p className="t-body-strong num whitespace-nowrap">{picks}</p>
      )}
      <div className="flex items-center gap-2">
        <span className="t-small num whitespace-nowrap">
          {showMultiple || tone === "winner" || (soldOut && open) ? `${picks} · ` : ""}
          {formatPercent(pickShare)}
        </span>
        <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-pill bg-line-soft" aria-hidden>
          <span
            className="block h-full rounded-pill bg-pink"
            style={{ width: `${Math.max(pickShare * 100, pickShare > 0 ? 3 : 0)}%` }}
          />
        </span>
      </div>
    </div>
  );
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={`relative block w-full rounded-sleeve text-left ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${
        isMine ? "card-mine" : ""
      } ${tone === "dim" && !isMine ? "opacity-50" : ""}`}
      aria-label={`${isMine ? "Your pick, " : ""}${player.name}, number ${player.number}, ${
        disabled ? "sold out, " : ""
      }${
        showMultiple ? `${formatMultiple(multiple)} if he wins, ` : ""
      }${picks}, ${formatPercent(pickShare)} of picks`}
    >
      <PlayerHoloCard
        player={player}
        team={team}
        rarity={tone === "winner" ? "legendary" : isMine ? "epic" : tone === "dim" ? "common" : "rare"}
        label=""
        footer={footer}
        compact
      />
      {isMine ? <PickBadge className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2" /> : null}
    </button>
  );
}
