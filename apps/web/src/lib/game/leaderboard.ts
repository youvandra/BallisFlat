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
  /** $WIF paid out by claims. */
  won: bigint;
  /** The winning card that paid the most per $WIF staked. */
  best: { matchId: number; playerId: number; multiple: number } | null;
}

const settledStates: ReadonlySet<MatchState> = new Set(["Final", "RolledOver"]);

/** One row per wallet, ranked by $WIF won, then calls right, hit rate and cards. */
export function rankLedger(
  ledger: readonly LedgerCard[],
  matches: ReadonlyMap<number, LeaderMatch>,
  include: (matchId: number) => boolean = () => true,
): LeaderRow[] {
  const rows = new Map<string, Omit<LeaderRow, "rank" | "hitRate">>();
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
    };
    row.cards += 1;
    if (settledStates.has(match.state)) row.settled += 1;
    if (match.state === "Final" && match.winners.includes(card.playerId)) {
      row.callsRight += 1;
      const paid = card.claimed ?? claimShare(match.info.payPool, match.info.winningCards);
      const multiple = match.info.price > 0n ? Number((paid * 1000n) / match.info.price) / 1000 : 0;
      if (!row.best || multiple > row.best.multiple) {
        row.best = { matchId: card.matchId, playerId: card.playerId, multiple };
      }
    }
    if (card.claimed !== null) row.won += card.claimed;
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
        a.wallet.localeCompare(b.wallet),
    );
  // Equal records share a rank (1, 2, 2, 4).
  let rank = 0;
  return ranked.map((row, index) => {
    const prev = ranked[index - 1];
    const tied =
      prev !== undefined &&
      prev.won === row.won &&
      prev.callsRight === row.callsRight &&
      prev.hitRate === row.hitRate &&
      prev.cards === row.cards;
    if (!tied) rank = index + 1;
    return { ...row, rank };
  });
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
