import { describe, expect, it } from "vitest";
import { fanFavourite, type LeaderMatch, rankLedger } from "./leaderboard";
import type { Address, LedgerCard } from "./types";

const WIF = 10n ** 18n;
const price = 1_000n * WIF;
const a = "0x000000000000000000000000000000000000000a" as Address;
const b = "0x000000000000000000000000000000000000000b" as Address;
const c = "0x000000000000000000000000000000000000000c" as Address;

const card = (
  owner: Address,
  matchId: number,
  playerId: number,
  claimed: bigint | null = null,
): LedgerCard => ({
  tokenId: BigInt(matchId * 100 + playerId),
  matchId,
  playerId,
  owner,
  claimed,
  refunded: false,
});

const matches = new Map<number, LeaderMatch>([
  [1, { state: "Final", winners: [9], info: { price, payPool: 9_000n * WIF, winningCards: 2 } }],
  [2, { state: "Open", winners: [], info: { price, payPool: 0n, winningCards: 0 } }],
]);

describe("rankLedger", () => {
  it("ranks by $WIF won, then calls right, and counts the hit rate over settled cards", () => {
    const rows = rankLedger(
      [card(a, 1, 9, 4_500n * WIF), card(a, 2, 3), card(b, 1, 9), card(c, 1, 4), card(c, 2, 1)],
      matches,
    );
    expect(rows.map((row) => row.wallet)).toEqual([a, b, c]);
    expect(rows[0]).toMatchObject({
      rank: 1,
      cards: 2,
      settled: 1,
      callsRight: 1,
      hitRate: 1,
      won: 4_500n * WIF,
    });
    expect(rows[0]?.best).toEqual({ matchId: 1, playerId: 9, multiple: 4.5 });
    // An unclaimed winner counts as a call right but has won nothing yet.
    expect(rows[1]).toMatchObject({ rank: 2, callsRight: 1, won: 0n });
    expect(rows[2]).toMatchObject({ rank: 3, callsRight: 0, hitRate: 0, best: null });
  });

  it("filters to a set of matches and gives equal records the same rank", () => {
    const rows = rankLedger([card(a, 1, 9), card(b, 2, 3), card(c, 2, 4)], matches, (id) => id === 2);
    expect(rows.map((row) => row.rank)).toEqual([1, 1]);
    expect(rows.every((row) => row.hitRate === null)).toBe(true);
  });
});

describe("fanFavourite", () => {
  it("picks the most-carded player and breaks ties by shirt number", () => {
    const line = (number: number, cardsOn: number) => ({ cardsOn, player: { number } });
    expect(fanFavourite([line(9, 3), line(7, 5), line(4, 5)])?.player.number).toBe(4);
    expect(fanFavourite([line(9, 0)])).toBeNull();
  });
});
