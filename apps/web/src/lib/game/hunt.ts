// Hunt reads: the wanted poster, the visitor's packs and prize. Screens read the Hunt only through these.
import { useQuery } from "@tanstack/react-query";
import { type ListedFixture, listedFixtures, type Player, type Team } from "./fixtures";
import { useGame } from "./queries";
import type { Account, HuntPack } from "./types";

export interface HuntPlayer {
  player: Player;
  team: Team;
  fixture: ListedFixture;
}

/** A player by global id, with his team, from the first listed fixture he appears in. */
export function huntPlayer(playerId: number): HuntPlayer | undefined {
  const ordered = [...listedFixtures].sort((a, b) => Number(Boolean(a.warmUp)) - Number(Boolean(b.warmUp)));
  for (const fixture of ordered) {
    const player = fixture.players.find((candidate) => candidate.id === playerId);
    if (player) return { player, team: player.side === "home" ? fixture.home : fixture.away, fixture };
  }
  return undefined;
}

/** Tier names as CSS reads them (`data-tier`). */
export const tierKeys = ["silver", "gold", "diamond"] as const;

export function useHunt() {
  const client = useGame();
  return useQuery({ queryKey: ["hunt"], queryFn: () => client.huntState() });
}

export function useHuntPacks(account: Account | null | undefined) {
  const client = useGame();
  return useQuery({
    queryKey: ["hunt-packs", account?.address],
    enabled: Boolean(account),
    queryFn: async (): Promise<HuntPack[]> => (account ? client.huntPacks(account.address) : []),
  });
}
