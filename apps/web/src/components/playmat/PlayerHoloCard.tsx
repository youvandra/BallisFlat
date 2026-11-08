import type { ReactNode } from "react";
import { playerArtUrl, playerIllustration } from "../../lib/art";
import { surname } from "../../lib/format";
import type { Player, Team } from "../../lib/game/fixtures";
import { HoloCard } from "./framer";
import { PlayerCutout } from "./PlayerCutout";
import { ShirtNumber } from "./ShirtNumber";

export const positionNames = { GK: "Goalkeeper", DF: "Defender", MF: "Midfielder", FW: "Forward" } as const;

type Rarity = "common" | "rare" | "epic" | "legendary";

type Props = {
  player: Player;
  team: Team;
  rarity?: Rarity;
  /** Bottom-left label in the accent colour (the landing prints the rarity there). */
  label: string;
  /** Bottom-right set line. */
  setLabel?: string;
  number?: string;
  maxTilt?: number;
  /** Back of the card; without it the card does not flip. */
  back?: {
    title: string;
    summary: string;
    results: { value: string; label: string }[];
    linkLabel: string;
    link: string;
  };
  /** An action on the back (claim, refund), under the result. */
  backAction?: ReactNode;
  /** Replaces the rarity and set row at the bottom of the card. */
  footer?: ReactNode;
  /** The squad grid's tile: surname, the big number and the footer only. */
  compact?: boolean;
  /** The big name when the surname alone is ambiguous (two Bellinghams); defaults to the surname. */
  displayName?: string;
  className?: string;
};

/** The card art every player card uses: the team's halftone plus the cut-out figure and shirt number. */
export function playerCardArt(
  player: Player,
  team: Team,
): { image: { src: string; alt: string }; overlay: ReactNode } {
  const illustration = playerIllustration(player, team);
  return {
    image: {
      src: playerArtUrl(player, team, { number: false }),
      alt: `${team.code} number ${player.number}`,
    },
    overlay: illustration ? (
      <>
        <PlayerCutout src={illustration} />
        <ShirtNumber value={player.number} className="shirt-number-corner" />
      </>
    ) : (
      <ShirtNumber value={player.number} />
    ),
  };
}

/**
 * A player as the landing's Holo Card (HoloTradingCard.tsx): halftone art, rarity foil, 3D tilt, optional flip.
 * The surname is printed big and fitted to the card, the full name small under it. The shirt number is
 * printed over the art, centred on its glyphs. Surface, text and accent colours stay the component defaults,
 * so every card matches the one in the pack.
 *
 * With an illustration (a cut-out figure) the figure stands on the team's halftone with a riso offset print
 * and the number moves to the top-left corner, clear of the player; without one the number is printed big
 * over the halftone, as before.
 */
export function PlayerHoloCard({
  player,
  team,
  rarity = "rare",
  label,
  setLabel = "BIF-26 ◆ 1st ED.",
  number,
  maxTilt = 12,
  back,
  footer,
  backAction,
  compact = false,
  displayName,
  className = "",
}: Props) {
  const results = back?.results ?? [];
  const art = playerCardArt(player, team);
  return (
    <div className={`aspect-card w-full ${className}`}>
      <HoloCard
        name={displayName ?? surname(player.name)}
        subName={compact ? "" : player.name}
        footer={footer}
        number={compact ? "" : (number ?? `No. ${String(player.number).padStart(2, "0")}`)}
        image={art.image}
        artOverlay={art.overlay}
        showType={!compact}
        typeLine={positionNames[player.position]}
        year={team.code}
        rarity={rarity}
        rarityLabel={label}
        setLabel={setLabel}
        abilityCount={0}
        flippable={Boolean(back)}
        backAction={backAction}
        backTitle={back?.title ?? ""}
        backSummary={back?.summary ?? ""}
        resultCount={results.length}
        result1Value={results[0]?.value ?? ""}
        result1Label={results[0]?.label ?? ""}
        result2Value={results[1]?.value ?? ""}
        result2Label={results[1]?.label ?? ""}
        result3Value={results[2]?.value ?? ""}
        result3Label={results[2]?.label ?? ""}
        linkLabel={back?.linkLabel ?? ""}
        link={back?.link ?? ""}
        maxTilt={maxTilt}
        foilStrength={1}
      />
    </div>
  );
}
