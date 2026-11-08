// Event handlers. Money and status are re-read from matchInfo() at the event's block (refreshMatch), so a
// rollover into another match or a void that moves rolledIn is never computed twice in two places.

import type { Context } from "ponder:registry";
import { ponder } from "ponder:registry";
import { card, listing, match, pick, sale, settings, wallet } from "ponder:schema";

const statuses = ["None", "Listed", "Proposed", "Finalized", "Voided"] as const;
const ZERO = "0x0000000000000000000000000000000000000000";

/** Addresses are stored lowercase so API lookups never miss on checksum casing. */
const lower = (address: `0x${string}`) => address.toLowerCase() as `0x${string}`;

async function refreshMatch(context: Context, matchId: bigint) {
  if (matchId === 0n) return;
  const info = await context.client.readContract({
    abi: context.contracts.BallIsFlat.abi,
    address: context.contracts.BallIsFlat.address as `0x${string}`,
    functionName: "matchInfo",
    args: [matchId],
  });
  const existing = await context.db.find(match, { id: matchId });
  if (!existing) return;
  await context.db.update(match, { id: matchId }).set({
    status: statuses[info.status] ?? "None",
    cards: info.cards,
    pot: info.pot,
    rolledIn: info.rolledIn,
    burned: info.burned,
    payPool: info.payPool,
    winningCards: info.winningCards,
    sourceUrl: info.sourceUrl,
    proposedAt: info.proposedAt,
    nextMatch: info.nextMatch,
  });
}

async function touchWallet(context: Context, address: `0x${string}`) {
  await context.db
    .insert(wallet)
    .values({ address, minted: 0, wins: 0, claimed: 0n, spent: 0n })
    .onConflictDoNothing();
}

ponder.on("BallIsFlat:MatchListed", async ({ event, context }) => {
  const { matchId, kickoff, price, nextMatch, playersRoot, playerIds } = event.args;
  const info = await context.client.readContract({
    abi: context.contracts.BallIsFlat.abi,
    address: context.contracts.BallIsFlat.address as `0x${string}`,
    functionName: "matchInfo",
    args: [matchId],
  });
  await context.db.insert(match).values({
    id: matchId,
    kickoff,
    price,
    nextMatch,
    maxPerPlayer: info.maxPerPlayer,
    playersRoot,
    playerIds: playerIds.map(Number),
    status: "Listed",
    cards: 0,
    pot: info.pot,
    rolledIn: info.rolledIn,
    burned: 0n,
    payPool: 0n,
    winningCards: 0,
    winners: [],
    sourceUrl: "",
    proposedAt: 0n,
    listedAt: event.block.timestamp,
    listedTx: event.transaction.hash,
  });
});

ponder.on("BallIsFlat:PlayersUpdated", async ({ event, context }) => {
  await context.db.update(match, { id: event.args.matchId }).set({
    playersRoot: event.args.playersRoot,
    playerIds: event.args.playerIds.map(Number),
  });
});

ponder.on("BallIsFlat:CardMinted", async ({ event, context }) => {
  const { matchId, playerId, tokenId, owner, serial } = event.args;
  const m = await context.db.find(match, { id: matchId });
  await context.db.insert(card).values({
    tokenId,
    matchId,
    playerId: Number(playerId),
    serial: Number(serial),
    minter: lower(owner),
    owner: lower(owner),
    opened: false,
    state: "live",
    payout: 0n,
    mintedAt: event.block.timestamp,
    mintTx: event.transaction.hash,
  });
  await context.db
    .insert(pick)
    .values({ matchId, playerId: Number(playerId), cards: 1 })
    .onConflictDoUpdate((row) => ({ cards: row.cards + 1 }));
  await touchWallet(context, lower(owner));
  await context.db
    .update(wallet, { address: lower(owner) })
    .set((row) => ({ minted: row.minted + 1, spent: row.spent + (m?.price ?? 0n) }));
  await refreshMatch(context, matchId);
});

ponder.on("BallIsFlat:Transfer", async ({ event, context }) => {
  const { from, to, tokenId } = event.args;
  // mints are recorded by CardMinted (which follows in the same tx), burns by CardClaimed / CardRefunded
  if (from === ZERO || to === ZERO) return;
  await context.db.update(card, { tokenId }).set({ owner: lower(to) });
});

ponder.on("BallIsFlat:CardOpened", async ({ event, context }) => {
  await context.db.update(card, { tokenId: event.args.tokenId }).set({ opened: true });
});

ponder.on("BallIsFlat:CardListed", async ({ event, context }) => {
  const { tokenId, matchId, seller, price } = event.args;
  await context.db
    .insert(listing)
    .values({ tokenId, matchId, seller: lower(seller), price, listedAt: event.block.timestamp })
    .onConflictDoUpdate({ seller: lower(seller), price, listedAt: event.block.timestamp });
});

ponder.on("BallIsFlat:ListingCancelled", async ({ event, context }) => {
  await context.db.delete(listing, { tokenId: event.args.tokenId });
});

ponder.on("BallIsFlat:CardSold", async ({ event, context }) => {
  const { tokenId, matchId, seller, buyer, price, burned } = event.args;
  await context.db.insert(sale).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    tokenId,
    matchId,
    seller: lower(seller),
    buyer: lower(buyer),
    price,
    burned,
    at: event.block.timestamp,
    tx: event.transaction.hash,
  });
  await context.db.delete(listing, { tokenId });
});

async function setWinners(context: Context, matchId: bigint, winners: readonly number[]) {
  await context.db.update(match, { id: matchId }).set({ winners: winners.map(Number) });
  await refreshMatch(context, matchId);
}

ponder.on("BallIsFlat:ResultProposed", async ({ event, context }) => {
  await setWinners(context, event.args.matchId, event.args.winners);
});

ponder.on("BallIsFlat:ResultCorrected", async ({ event, context }) => {
  await setWinners(context, event.args.matchId, event.args.winners);
});

ponder.on("BallIsFlat:MatchFinalized", async ({ event, context }) => {
  const { matchId, rolledTo } = event.args;
  await refreshMatch(context, matchId);
  await refreshMatch(context, rolledTo);
  const m = await context.db.find(match, { id: matchId });
  if (!m || m.winningCards === 0) return;
  // credit a win to every wallet whose minted card named a winner
  const rows = await context.db.sql.query.card.findMany({
    where: (c, { and, eq, inArray }) => and(eq(c.matchId, matchId), inArray(c.playerId, m.winners)),
  });
  for (const row of rows) {
    await touchWallet(context, row.minter);
    await context.db.update(wallet, { address: row.minter }).set((w) => ({ wins: w.wins + 1 }));
  }
});

ponder.on("BallIsFlat:MatchVoided", async ({ event, context }) => {
  const m = await context.db.find(match, { id: event.args.matchId });
  await refreshMatch(context, event.args.matchId);
  if (m) await refreshMatch(context, m.nextMatch);
});

ponder.on("BallIsFlat:CardClaimed", async ({ event, context }) => {
  const { tokenId, owner, amount } = event.args;
  await context.db
    .update(card, { tokenId })
    .set({ state: "claimed", payout: amount, owner: lower(owner), burnTx: event.transaction.hash });
  await touchWallet(context, lower(owner));
  await context.db.update(wallet, { address: lower(owner) }).set((w) => ({ claimed: w.claimed + amount }));
});

// Claim and keep: the share minus the burned keep fee is paid and the card stays with its owner.
ponder.on("BallIsFlat:CardKept", async ({ event, context }) => {
  const { tokenId, owner, amount } = event.args;
  await context.db
    .update(card, { tokenId })
    .set({ state: "kept", payout: amount, owner: lower(owner), burnTx: event.transaction.hash });
  await touchWallet(context, lower(owner));
  await context.db.update(wallet, { address: lower(owner) }).set((w) => ({ claimed: w.claimed + amount }));
});

ponder.on("BallIsFlat:CardRefunded", async ({ event, context }) => {
  const { tokenId, owner, amount } = event.args;
  await context.db
    .update(card, { tokenId })
    .set({ state: "refunded", payout: amount, owner: lower(owner), burnTx: event.transaction.hash });
});

ponder.on("BallIsFlat:BatchMetadataUpdate", async ({ event, context }) => {
  await context.db
    .insert(settings)
    .values({ id: "metadataRefreshedAt", value: String(event.block.timestamp) })
    .onConflictDoUpdate({ value: String(event.block.timestamp) });
});
