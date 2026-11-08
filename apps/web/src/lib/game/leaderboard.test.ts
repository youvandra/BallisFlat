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
  it("adds Hunt prizes to $WIF won and ranks a Hunt-only wallet too", () => {
    const d = "0x000000000000000000000000000000000000000d" as Address;
    const rows = rankLedger([card(a, 1, 9, 4_500n * WIF), card(b, 1, 9)], matches, undefined, [
      { winner: d, prize: 10_000n * WIF },
      { winner: b, prize: 10_000n * WIF },
    ]);
    expect(rows.map((row) => row.wallet)).toEqual([b, d, a]);
    expect(rows[0]).toMatchObject({ won: 14_500n * WIF, huntFinds: 1, callsRight: 1 });
    expect(rows[1]).toMatchObject({ won: 10_000n * WIF, huntFinds: 1, cards: 0, hitRate: null });
  });

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
    // A final but unclaimed winning card already counts as won.
    expect(rows[1]).toMatchObject({ rank: 2, callsRight: 1, won: 4_500n * WIF });
    expect(rows[2]).toMatchObject({ rank: 3, callsRight: 0, hitRate: 0, best: null });
  });

  it("filters to a set of matches and breaks a level record by who picked first", () => {
    const rows = rankLedger([card(a, 1, 9), card(c, 2, 4), card(b, 2, 3)], matches, (id) => id === 2);
    // b's card (token 203) was minted before c's (204): b ranks first, and every rank is unique.
    expect(rows.map((row) => [row.wallet, row.rank])).toEqual([
      [b, 1],
      [c, 2],
    ]);
    expect(rows.every((row) => row.hitRate === null)).toBe(true);
  });

  it("never gives two wallets the same rank, even with identical records", () => {
    const rows = rankLedger([card(b, 1, 9), card(a, 1, 9)], matches);
    expect(rows.map((row) => row.rank)).toEqual([1, 2]);
    expect(rows[0]?.won).toBe(rows[1]?.won);
  });
});

describe("fanFavourite", () => {
  it("picks the most-carded player and breaks ties by shirt number", () => {
    const line = (number: number, cardsOn: number) => ({ cardsOn, player: { number } });
    expect(fanFavourite([line(9, 3), line(7, 5), line(4, 5)])?.player.number).toBe(4);
    expect(fanFavourite([line(9, 0)])).toBeNull();
  });
});
