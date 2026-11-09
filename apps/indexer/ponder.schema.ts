// On-chain state, rebuilt from BallIsFlat events. Money fields are re-read from the contract after each
// event that moves them, so the tables always agree with matchInfo(), including rollovers and voids.
import { index, onchainTable, primaryKey } from "ponder";

export const match = onchainTable("match", (t) => ({
  id: t.bigint().primaryKey(),
  kickoff: t.bigint().notNull(),
  price: t.bigint().notNull(),
  nextMatch: t.bigint().notNull(),
  maxPerPlayer: t.integer().notNull(),
  playersRoot: t.hex().notNull(),
  playerIds: t.integer().array().notNull(),
  status: t.text().notNull(), // Listed | Proposed | Finalized | Voided
  cards: t.integer().notNull(),
  pot: t.bigint().notNull(),
  rolledIn: t.bigint().notNull(),
  burned: t.bigint().notNull(),
  payPool: t.bigint().notNull(),
  winningCards: t.integer().notNull(),
  winners: t.integer().array().notNull(),
  sourceUrl: t.text().notNull(),
  proposedAt: t.bigint().notNull(),
  listedAt: t.bigint().notNull(),
  listedTx: t.hex().notNull(),
}));

export const card = onchainTable(
  "card",
  (t) => ({
    tokenId: t.bigint().primaryKey(),
    matchId: t.bigint().notNull(),
    playerId: t.integer().notNull(),
    serial: t.integer().notNull(),
    minter: t.hex().notNull(),
    owner: t.hex().notNull(),
    opened: t.boolean().notNull(),
    state: t.text().notNull(), // live | claimed | kept | refunded
    payout: t.bigint().notNull(), // claim or refund amount once burned
    mintedAt: t.bigint().notNull(),
    mintTx: t.hex().notNull(),
    burnTx: t.hex(),
  }),
  (table) => ({
    ownerIdx: index().on(table.owner),
    matchIdx: index().on(table.matchId),
    minterIdx: index().on(table.minter),
  }),
);

export const pick = onchainTable(
  "pick",
  (t) => ({
    matchId: t.bigint().notNull(),
    playerId: t.integer().notNull(),
    cards: t.integer().notNull(),
  }),
  (table) => ({ pk: primaryKey({ columns: [table.matchId, table.playerId] }) }),
);

export const listing = onchainTable(
  "listing",
  (t) => ({
    tokenId: t.bigint().primaryKey(),
    matchId: t.bigint().notNull(),
    seller: t.hex().notNull(),
    price: t.bigint().notNull(),
    listedAt: t.bigint().notNull(),
  }),
  (table) => ({ matchIdx: index().on(table.matchId) }),
);

export const sale = onchainTable(
  "sale",
  (t) => ({
    id: t.text().primaryKey(), // tx hash + log index
    tokenId: t.bigint().notNull(),
    matchId: t.bigint().notNull(),
    seller: t.hex().notNull(),
    buyer: t.hex().notNull(),
    price: t.bigint().notNull(),
    burned: t.bigint().notNull(),
    at: t.bigint().notNull(),
    tx: t.hex().notNull(),
  }),
  (table) => ({ matchIdx: index().on(table.matchId) }),
);

/** Per-wallet record for the leaderboard: cards minted, cards that named the winner, $WIF paid out. */
export const wallet = onchainTable("wallet", (t) => ({
  address: t.hex().primaryKey(),
  minted: t.integer().notNull(),
  wins: t.integer().notNull(),
  claimed: t.bigint().notNull(),
  spent: t.bigint().notNull(),
}));

/** Contract-level settings that change by event (metadata host, settler, pause). */
export const settings = onchainTable("settings", (t) => ({
  id: t.text().primaryKey(),
  value: t.text().notNull(),
}));

/**
 * Every wallet action on either contract, one row per event: the traction log behind /api/stats.
 * `amount` is $WIF the wallet paid in (mint, pack, sale price) or was paid (claim, keep, refund, prize);
 * `burned` is $WIF sent to the dead address by that same action. Pot burns at settlement live on `match.burned`.
 */
export const activity = onchainTable(
  "activity",
  (t) => ({
    id: t.text().primaryKey(), // tx hash + log index
    kind: t.text().notNull(), // mint | open | sale | claim | keep | refund | pack | reveal | hunt_mint | find | prize_paid
    wallet: t.hex(), // null for a pack reveal run by the keeper
    amount: t.bigint().notNull(),
    burned: t.bigint().notNull(),
    at: t.bigint().notNull(),
    tx: t.hex().notNull(),
  }),
  (table) => ({
    kindIdx: index().on(table.kind),
    walletIdx: index().on(table.wallet),
    atIdx: index().on(table.at),
  }),
);
