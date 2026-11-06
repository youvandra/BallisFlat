import { describe, expect, it } from "vitest";
import {
  burnAmount,
  claimShare,
  multipleIfWins,
  payPool,
  remainingForPlayer,
  saleSplit,
  shareOfPicks,
} from "./payout";

const WIF = 10n ** 18n;
const PRICE = 1_000n * WIF;

describe("burn and pay pool", () => {
  it("burns 10% of a 100-card pot", () => {
    const pot = 100n * PRICE;
    expect(burnAmount(pot, 1000)).toBe(10_000n * WIF);
    expect(payPool(pot, 1000)).toBe(90_000n * WIF);
  });

  it("floors the burn like Solidity and keeps the remainder in the pool", () => {
    expect(burnAmount(9999n, 1000)).toBe(999n);
    expect(payPool(9999n, 1000)).toBe(9000n);
    expect(burnAmount(9n, 1000)).toBe(0n);
    expect(payPool(9n, 1000)).toBe(9n);
  });

  it("handles zero pot, zero bps and full bps", () => {
    expect(burnAmount(0n, 1000)).toBe(0n);
    expect(payPool(0n, 1000)).toBe(0n);
    expect(payPool(123n, 0)).toBe(123n);
    expect(payPool(123n, 10_000n)).toBe(0n);
  });

  it("burn plus pay pool always equals the pot", () => {
    for (const pot of [1n, 7n, 12_345n, 99_999_999_999_999_999_999n]) {
      for (const bps of [0, 1, 333, 1000, 9999, 10_000]) {
        expect(burnAmount(pot, bps) + payPool(pot, bps)).toBe(pot);
      }
    }
  });
});

describe("claimShare", () => {
  it("PRD example: 100 cards x 1,000 WIF, 10% burn, 8 winners -> 11,250 WIF each", () => {
    const pool = payPool(100n * PRICE, 1000);
    expect(claimShare(pool, 8)).toBe(11_250n * WIF);
  });

  it("returns 0 when nobody won", () => {
    expect(claimShare(90_000n * WIF, 0)).toBe(0n);
    expect(claimShare(90_000n * WIF, 0n)).toBe(0n);
  });

  it("floors and leaves dust in the contract", () => {
    expect(claimShare(10n, 3)).toBe(3n);
    expect(claimShare(10n, 3n) * 3n).toBeLessThanOrEqual(10n);
  });

  it("tie: cards on all tied players split one pool equally", () => {
    // 3 cards on player A, 2 on player B, both top-rated: 5 winning cards.
    const pool = payPool(20n * PRICE, 1000); // 18,000 WIF
    expect(claimShare(pool, 3 + 2)).toBe(3_600n * WIF);
  });
});

describe("multipleIfWins", () => {
  it("first card on an empty match pays its own price back minus the burn", () => {
    const r = multipleIfWins({ pot: 0n, price: PRICE, cardsOnPlayer: 0, burnBps: 1000 });
    expect(r.share).toBe(900n * WIF);
    expect(r.multiple).toBe(0.9);
  });

  it("matches the PRD pot: 99 cards in, 7 already on the player -> 8th card shares 100-card pot", () => {
    const r = multipleIfWins({ pot: 99n * PRICE, price: PRICE, cardsOnPlayer: 7, burnBps: 1000 });
    expect(r.share).toBe(11_250n * WIF);
    expect(r.multiple).toBe(11.2); // 11.25 floored to one decimal
  });

  it("an unpicked player pays the whole pool", () => {
    const r = multipleIfWins({ pot: 49n * PRICE, price: PRICE, cardsOnPlayer: 0n, burnBps: 1000n });
    expect(r.share).toBe(45_000n * WIF);
    expect(r.multiple).toBe(45);
  });

  it("agrees with the ux-flow formula (pot*0.9 + price*0.9) / ((n+1) * price)", () => {
    for (const cards of [0, 1, 2, 5, 13]) {
      for (const potCards of [0n, 3n, 10n, 57n]) {
        const pot = potCards * PRICE;
        const r = multipleIfWins({ pot, price: PRICE, cardsOnPlayer: cards, burnBps: 1000 });
        const expected = Math.floor(((Number(potCards) * 0.9 + 0.9) / (cards + 1)) * 10 + 1e-9) / 10;
        expect(r.multiple).toBe(expected);
        expect(r.share).toBe(claimShare(payPool(pot + PRICE, 1000), cards + 1));
      }
    }
  });

  it("rounds in bigint with odd amounts", () => {
    const r = multipleIfWins({ pot: 2n, price: 3n, cardsOnPlayer: 1, burnBps: 1000 });
    // pot+price = 5, burn 0, pool 5, share 5/2 = 2, multiple 2*10/3 = 6 -> 0.6
    expect(r.share).toBe(2n);
    expect(r.multiple).toBe(0.6);
  });

  it("returns 0 multiple for a zero price", () => {
    expect(multipleIfWins({ pot: 0n, price: 0n, cardsOnPlayer: 0, burnBps: 1000 })).toEqual({
      multiple: 0,
      share: 0n,
    });
  });
});

describe("shareOfPicks", () => {
  it("is a fraction of all cards and 0 for an empty match", () => {
    expect(shareOfPicks(0, 0)).toBe(0);
    expect(shareOfPicks(0n, 10n)).toBe(0);
    expect(shareOfPicks(8, 100)).toBe(0.08);
    expect(shareOfPicks(5n, 5n)).toBe(1);
  });
});

describe("saleSplit", () => {
  it("5% of a 1,500 WIF sale is burned, 1,425 WIF goes to the seller", () => {
    expect(saleSplit(1_500n * WIF, 500)).toEqual({ burned: 75n * WIF, toSeller: 1_425n * WIF });
  });

  it("floors the burn like Solidity, the seller keeps the remainder", () => {
    expect(saleSplit(19n, 500)).toEqual({ burned: 0n, toSeller: 19n });
    expect(saleSplit(20n, 500)).toEqual({ burned: 1n, toSeller: 19n });
    expect(saleSplit(123n, 0n)).toEqual({ burned: 0n, toSeller: 123n });
    expect(saleSplit(123n, 10_000)).toEqual({ burned: 123n, toSeller: 0n });
  });

  it("burned plus seller share always equals the price", () => {
    for (const price of [1n, 19n, 999n, 1_500n * WIF, 10n ** 30n + 7n]) {
      for (const bps of [0, 1, 500, 3333, 9999, 10_000]) {
        const { burned, toSeller } = saleSplit(price, bps);
        expect(burned + toSeller).toBe(price);
      }
    }
  });
});

describe("remainingForPlayer", () => {
  it("returns null when the match has no cap", () => {
    expect(remainingForPlayer(0, 0)).toBeNull();
    expect(remainingForPlayer(0n, 57n)).toBeNull();
  });

  it("counts down to zero and never goes negative", () => {
    expect(remainingForPlayer(10, 0)).toBe(10);
    expect(remainingForPlayer(10, 7n)).toBe(3);
    expect(remainingForPlayer(10n, 10)).toBe(0);
    expect(remainingForPlayer(10, 11)).toBe(0);
  });
});
