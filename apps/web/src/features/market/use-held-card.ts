import { useQuery } from "@tanstack/react-query";
import { useGame } from "../../lib/game/queries";
import type { Account } from "../../lib/game/types";

/** The card this wallet minted for the match, if any. `cardOf` keys on the minter and is never cleared. */
export function useHeldCard(matchId: number, account: Account | null | undefined) {
  const client = useGame();
  return useQuery({
    queryKey: ["cardOf", matchId, account?.address ?? "none"],
    enabled: Boolean(account),
    queryFn: async () => {
      if (!account) return null;
      const tokenId = await client.cardOf(matchId, account.address);
      if (tokenId === 0n) return null;
      const info = await client.cardInfo(tokenId).catch(() => null);
      return { tokenId, playerId: info?.playerId ?? null, serial: info?.serial ?? null };
    },
  });
}
