// Ranks wallets from the public card record. Pure, so the mock and the chain rank the same way.
import { claimShare } from "@app/core/payout";
import type { Address, LedgerCard, MatchInfo, MatchState } from "./types";

export interface LeaderMatch {
  state: MatchState;
  winners: readonly number[];
  info: Pick<MatchInfo, "price" | "payPool" | "winningCards">;
}

export interface LeaderRow {
  rank: number;
  wallet: Address;
  cards: number;
  /** Cards on a match that has a final answer (Final or Rolled Over). */
  settled: number;
  callsRight: number;
  /** callsRight / settled, null before any of the wallet's matches settled. */
  hitRate: number | null;
  /** $WIF won: paid out by claims, plus the share a final winning card can still claim. */
  won: bigint;
  /** The winning card that paid the most per $WIF staked. */
  best: { matchId: number; playerId: number; multiple: number } | null;
  /** Wanted cards pulled in the Hunt; each one's prize counts in `won`. */
  huntFinds: number;
}

/** One wanted card pulled in the Hunt and the prize the team posted for it. */
export interface LeaderFind {
  winner: Address;
  prize: bigint;
}

/** A Hunt-only wallet sorts after every wallet that picked, on an otherwise equal record. */
const noPick = 2n ** 255n;

const settledStates: ReadonlySet<MatchState> = new Set(["Final", "RolledOver"]);

/**
 * One row per wallet, ranked by $WIF won (match payouts plus Hunt prizes), then calls right, hit rate and cards. A result is final once the
 * match is, so an unclaimed winning card already counts as won. Anything still level goes to the wallet
 * that picked first (lowest token id), so every rank is unique and the podium never shows two firsts.
 */
export function rankLedger(
  ledger: readonly LedgerCard[],
  matches: ReadonlyMap<number, LeaderMatch>,
  include: (matchId: number) => boolean = () => true,
  huntFinds: readonly LeaderFind[] = [],
): LeaderRow[] {
  const rows = new Map<string, Omit<LeaderRow, "rank" | "hitRate"> & { firstPick: bigint }>();
  for (const card of ledger) {
    const match = matches.get(card.matchId);
    if (!match || !include(card.matchId)) continue;
    const key = card.owner.toLowerCase();
    const row = rows.get(key) ?? {
      wallet: card.owner,
      cards: 0,
      settled: 0,
      callsRight: 0,
      won: 0n,
      best: null,
      huntFinds: 0,
      firstPick: card.tokenId,
    };
    row.cards += 1;
    if (card.tokenId < row.firstPick) row.firstPick = card.tokenId;
    if (settledStates.has(match.state)) row.settled += 1;
    if (match.state === "Final" && match.winners.includes(card.playerId)) {
      row.callsRight += 1;
      const paid = card.claimed ?? claimShare(match.info.payPool, match.info.winningCards);
      row.won += paid;
      const multiple = match.info.price > 0n ? Number((paid * 1000n) / match.info.price) / 1000 : 0;
      if (!row.best || multiple > row.best.multiple) {
        row.best = { matchId: card.matchId, playerId: card.playerId, multiple };
      }
    }
    rows.set(key, row);
  }
  // A find is final the moment its pack opens, like a final winning card, so its prize counts at once.
  for (const find of huntFinds) {
    const key = find.winner.toLowerCase();
    const row = rows.get(key) ?? {
      wallet: find.winner,
      cards: 0,
      settled: 0,
      callsRight: 0,
      won: 0n,
      best: null,
      huntFinds: 0,
      firstPick: noPick,
    };
    row.huntFinds += 1;
    row.won += find.prize;
    rows.set(key, row);
  }
  const ranked = [...rows.values()]
    .map((row) => ({ ...row, hitRate: row.settled > 0 ? row.callsRight / row.settled : null }))
    .sort(
      (a, b) =>
        (b.won > a.won ? 1 : b.won < a.won ? -1 : 0) ||
        b.callsRight - a.callsRight ||
        (b.hitRate ?? -1) - (a.hitRate ?? -1) ||
        b.cards - a.cards ||
        (a.firstPick < b.firstPick ? -1 : a.firstPick > b.firstPick ? 1 : 0),
    );
  return ranked.map(({ firstPick: _firstPick, ...row }, index) => ({ ...row, rank: index + 1 }));
}

/** The crowd's choice: the player with the most cards on him, first by shirt number on a tie. */
export function fanFavourite<T extends { cardsOn: number; player: { number: number } }>(
  lines: readonly T[],
): T | null {
  let top: T | null = null;
  for (const line of lines) {
    if (line.cardsOn === 0) continue;
    if (
      !top ||
      line.cardsOn > top.cardsOn ||
      (line.cardsOn === top.cardsOn && line.player.number < top.player.number)
    ) {
      top = line;
    }
  }
  return top;
}
