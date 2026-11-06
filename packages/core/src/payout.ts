// Pari-mutuel payout math. Every division is bigint floor division, the same as Solidity's `/` on uint256,
// so the numbers the app shows are the numbers the contract pays.

const BPS = 10_000n;

/** $WIF burned at finalize: pot * burnBps / 10000, floored. */
export function burnAmount(pot: bigint, burnBps: bigint | number): bigint {
  return (pot * BigInt(burnBps)) / BPS;
}

/** What is left for winning cards after the burn. */
export function payPool(pot: bigint, burnBps: bigint | number): bigint {
  return pot - burnAmount(pot, burnBps);
}

/** What one winning card receives on claim: payPool / winningCards, floored. 0 when nobody won. */
export function claimShare(pool: bigint, winningCards: bigint | number): bigint {
  const n = BigInt(winningCards);
  return n === 0n ? 0n : pool / n;
}

export type MultipleInput = {
  /** Current pot, including any rolled-in amount. */
  pot: bigint;
  /** Price of one card. */
  price: bigint;
  /** Cards already minted on this player. */
  cardsOnPlayer: bigint | number;
  burnBps: bigint | number;
};

/**
 * The payout for one NEW card on this player if he wins, assuming no further mints:
 * share = payPool(pot + price) / (cardsOnPlayer + 1).
 * `multiple` is share / price with one decimal, floored in bigint (share * 10 / price, then / 10).
 */
export function multipleIfWins({ pot, price, cardsOnPlayer, burnBps }: MultipleInput): {
  multiple: number;
  share: bigint;
} {
  const share = claimShare(payPool(pot + price, burnBps), BigInt(cardsOnPlayer) + 1n);
  const multiple = price === 0n ? 0 : Number((share * 10n) / price) / 10;
  return { multiple, share };
}

/** Fraction 0..1 of all cards in the match that sit on this player. 0 when no cards exist. */
export function shareOfPicks(cardsOnPlayer: bigint | number, totalCards: bigint | number): number {
  const total = Number(totalCards);
  return total === 0 ? 0 : Number(cardsOnPlayer) / total;
}

/**
 * Market sale split, as `buy` pays it: burned = price * saleBurnBps / 10000 (floored) goes to the burn
 * address, the seller gets the rest. burned + toSeller === price always.
 */
export function saleSplit(price: bigint, saleBurnBps: bigint | number): { burned: bigint; toSeller: bigint } {
  const burned = (price * BigInt(saleBurnBps)) / BPS;
  return { burned, toSeller: price - burned };
}

/**
 * Cards still mintable on one player of a match.
 * Returns `null` when the match is unlimited (`maxPerPlayer` 0), otherwise `maxPerPlayer - cardsOn`,
 * never below 0. The contract's `remaining(matchId, playerId)` view reports unlimited as 2^32 - 1
 * (type(uint32).max) instead; use this helper for display so "unlimited" is never shown as a number.
 */
export function remainingForPlayer(maxPerPlayer: bigint | number, cardsOn: bigint | number): number | null {
  const max = Number(maxPerPlayer);
  if (max === 0) return null;
  return Math.max(0, max - Number(cardsOn));
}
