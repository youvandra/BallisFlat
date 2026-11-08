import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { PlayerHoloCard } from "../../components/playmat/PlayerHoloCard";
import { Zone } from "../../components/playmat/Zone";
import { huntPlayer, useHunt, useHuntPacks } from "../../lib/game/hunt";
import type { Account } from "../../lib/game/types";

/** Every card the wallet pulled from Hunt packs, newest pack first; the card that found a pot is marked. */
export function HuntShelf({ account }: { account: Account | null | undefined }) {
  const hunt = useHunt();
  const packs = useHuntPacks(account);
  if (!hunt.data?.available || !packs.data) return null;
  const cards = [...packs.data]
    .filter((pack) => pack.opened)
    .reverse()
    .flatMap((pack) =>
      pack.players.flatMap((playerId, index) =>
        pack.minted[index] === null
          ? []
          : [
              {
                key: `${pack.packId}-${index}`,
                playerId,
                hunt: pack.round,
                found: pack.found && pack.players.indexOf(playerId) === index,
              },
            ],
      ),
    );
  if (cards.length === 0) return null;
  return (
    <Zone
      label={`Hunt · ${cards.length}`}
      size="auto"
      className="gap-4 px-6 pt-7 pb-7 max-tab:px-3"
      labelledBy="shelf-hunt"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="shelf-hunt" className="t-small">
          Cards you minted from Hunt packs. They stay with this wallet.
        </h2>
        <Link to="/hunt" className="text-link shrink-0">
          Hunt <ArrowRight size={14} strokeWidth={2} aria-hidden />
        </Link>
      </div>
      <ul className="grid-binder" data-testid="hunt-shelf">
        {cards.map((card) => {
          const entry = huntPlayer(card.playerId);
          if (!entry) return null;
          return (
            <li key={card.key}>
              <PlayerHoloCard
                player={entry.player}
                team={entry.team}
                rarity={card.found ? "legendary" : "rare"}
                label={card.found ? "Found" : entry.team.code}
                setLabel={`Hunt ${card.hunt}`}
                compact
              />
            </li>
          );
        })}
      </ul>
    </Zone>
  );
}
