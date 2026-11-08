// Seed for the in-browser simulated chain: real fixtures, invented pick counts, one settled warm-up.
// The shapes mirror contract storage so the mock client derives everything the way the contract does.
import type { Fixture } from "@app/config/fixtures.types";
import { burnAmount, claimShare, payPool } from "@app/core/payout";
import type { Address, Hash, LedgerCard, Status } from "./types";

export interface MockMatch {
  id: number;
  slug: string;
  kickoff: number;
  proposedAt: number;
  status: Status;
  price: string; // bigint as decimal string, localStorage keeps JSON
  rolledIn: string;
  burned: string;
  payPool: string;
  nextMatch: number;
  sourceUrl: string;
  winners: number[];
  winningCards: number;
  /** Cards allowed on one player, 0 = unlimited. */
  maxPerPlayer: number;
  players: number[];
  /** Cards other wallets hold, per player id. Only the demo wallet's cards exist as tokens. */
  seedPicks: Record<string, number>;
}

export interface MockToken {
  tokenId: string;
  matchId: number;
  playerId: number;
  serial: number;
  owner: Address;
  /** Who minted it; `cardOf` keys on this and never clears it. */
  minter: Address;
  mintedAt: number;
  mintHash: Hash | null;
  opened: boolean;
  /** A live sale listing (sealed cards only, before kickoff). No escrow: the card stays with the seller. */
  listing?: { seller: Address; price: string } | null;
  burned: { kind: "claimed" | "refunded"; amount: string; hash: Hash } | null;
}

export interface MockState {
  version: 3;
  clockOffset: number;
  txCount: number;
  nextTokenId: string;
  matches: MockMatch[];
  tokens: MockToken[];
  wallet: { connected: boolean; wif: string; allowance: string; gas: string };
  /** $WIF burned by sales (5% of each), for the record. */
  saleBurned: string;
  /** Hunt state; created on first use so saves from before Hunt keep working. */
  hunt?: MockHunt;
}

export interface MockHuntPack {
  packId: string;
  tier: number;
  round: number;
  opened: boolean;
  players: number[];
  firstCardId: string | null;
  found: boolean;
  boughtAt: number;
}

export interface MockHuntRound {
  id: number;
  target: number;
  status: "Open" | "Won" | "Closed";
  winner: Address | null;
  prize: string;
  packs: number;
  pool: number[];
  winningPack: string | null;
  claimed?: boolean;
  paid: boolean;
  payment: Hash | null;
}

export interface MockHunt {
  version: 2;
  /** Newest last. */
  rounds: MockHuntRound[];
  allowance: string;
  nextPack: number;
  nextCard: number;
  mine: MockHuntPack[];
  /** Demo only: the next opened pack holds the wanted player. */
  rigged?: boolean;
}

export interface SeedConfig {
  fixtures: readonly Fixture[];
  price: bigint;
  burnBps: number;
  disputeWindow: number;
  /** Cards allowed on one player, 0 = unlimited (game.maxPerPlayer). */
  maxPerPlayer: number;
  /** Share of each sale burned, in bps (game.saleBurnBps). */
  saleBurnBps?: number;
  demoWallet: Address;
  startingWif: bigint;
  now: number;
}

/** Deterministic 0..1 generator so the seed looks the same on every machine. */
function seededRandom(seed: string): () => number {
  let state = 0;
  for (const char of seed) state = (Math.imul(state, 31) + char.charCodeAt(0)) | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const positionWeight = { GK: 0.35, DF: 0.8, MF: 1.6, FW: 2.4 } as const;

function spreadPicks(fixture: Fixture, total: number, maxPerPlayer: number): Record<string, number> {
  const random = seededRandom(fixture.slug);
  // Squared noise gives a few crowd favourites and a long tail of underdogs.
  const weights = fixture.players.map(
    (player) => positionWeight[player.position] * (0.2 + random() ** 2 * 3),
  );
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const picks: Record<string, number> = {};
  fixture.players.forEach((player, index) => {
    const share = Math.floor((total * (weights[index] ?? 0)) / sum);
    // The contract caps each player; a favourite at the cap shows as sold out.
    picks[player.id] = maxPerPlayer > 0 ? Math.min(share, maxPerPlayer) : share;
  });
  return picks;
}

function seedTotal(fixture: Fixture): number {
  return 24 + Math.floor(seededRandom(`${fixture.slug}:total`)() * 120);
}

export function fixtureMatchIds(fixtures: readonly Fixture[]): Map<string, number> {
  const ids = new Map<string, number>();
  fixtures.forEach((fixture, index) => {
    ids.set(fixture.slug, index + 1);
  });
  return ids;
}

function settle(match: MockMatch, winners: number[], config: SeedConfig, demoCards: number): void {
  const cards = Object.values(match.seedPicks).reduce((acc, count) => acc + count, 0) + demoCards;
  const pot = BigInt(match.price) * BigInt(cards) + BigInt(match.rolledIn);
  match.status = "Finalized";
  match.winners = winners;
  match.proposedAt = match.kickoff + 2 * 3600;
  match.burned = burnAmount(pot, config.burnBps).toString();
  match.payPool = payPool(pot, config.burnBps).toString();
}

/** Builds the starting state. Warm-up fixtures are settled; the demo wallet holds a win and a miss. */
export function createSeed(config: SeedConfig): MockState {
  const ids = fixtureMatchIds(config.fixtures);
  const ordered = [...config.fixtures].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  const matches: MockMatch[] = ordered.map((fixture, index) => {
    const next = ordered.slice(index + 1).find((later) => !later.warmUp);
    return {
      id: ids.get(fixture.slug) ?? index + 1,
      slug: fixture.slug,
      kickoff: Math.floor(Date.parse(fixture.kickoff) / 1000),
      proposedAt: 0,
      status: "Listed",
      price: config.price.toString(),
      rolledIn: "0",
      burned: "0",
      payPool: "0",
      nextMatch: next ? (ids.get(next.slug) ?? 0) : 0,
      sourceUrl: "",
      winners: [],
      winningCards: 0,
      maxPerPlayer: config.maxPerPlayer,
      players: fixture.players.map((player) => player.id),
      seedPicks: spreadPicks(fixture, seedTotal(fixture), config.maxPerPlayer),
    };
  });

  const tokens: MockToken[] = [];
  let nextTokenId = matches.reduce(
    (acc, match) => acc + Object.values(match.seedPicks).reduce((sum, count) => sum + count, 0),
    0,
  );
  const settled = matches.filter((match) => config.fixtures.find((f) => f.slug === match.slug)?.warmUp);

  // Demo wallet: a winning card in the first warm-up, a missed card in the second when one is listed
  // (one card per wallet per match, so a miss needs a second settled match).
  settled.forEach((match, index) => {
    const fixture = config.fixtures.find((f) => f.slug === match.slug);
    const picks = (id: number) => match.seedPicks[id] ?? 0;
    // Mock result: the crowd's favourite forward. The real result comes from the settler on chain.
    const forwards = (fixture?.players ?? []).filter((player) => player.position === "FW").map((p) => p.id);
    const winner = [...forwards].sort((a, b) => picks(b) - picks(a))[0] ?? match.players[0] ?? 0;
    const missPick =
      [...match.players].filter((id) => id !== winner).sort((a, b) => picks(b) - picks(a))[0] ?? winner;
    const pick = index === 0 ? winner : missPick;
    // Leave room under the cap for the demo wallet's own card.
    const seeded = match.seedPicks[pick] ?? 0;
    if (config.maxPerPlayer > 0 && seeded >= config.maxPerPlayer)
      match.seedPicks[pick] = config.maxPerPlayer - 1;
    const serial = Object.values(match.seedPicks).reduce((acc, count) => acc + count, 0) + 1;
    nextTokenId += 1;
    tokens.push({
      tokenId: String(nextTokenId),
      matchId: match.id,
      playerId: pick,
      serial,
      owner: config.demoWallet,
      minter: config.demoWallet,
      mintedAt: match.kickoff - 3 * 3600,
      mintHash: null,
      // Minted before the demo began, so the pack is already open.
      opened: true,
      burned: null,
    });
    settle(match, [winner], config, 1);
    match.winningCards = (match.seedPicks[winner] ?? 0) + (pick === winner ? 1 : 0);
    match.sourceUrl = config.fixtures.find((f) => f.slug === match.slug)?.squadSource.url ?? "";
  });

  // A few sealed cards for sale from the demo crowd on open matches, so the market has listings. Each one
  // is a seeded pick turned into a real token, so the pick counts stay the same.
  const listingPrices = [900n, 1_200n, 1_500n, 2_000n, 2_600n];
  let listed = 0;
  for (const match of matches) {
    if (config.fixtures.find((f) => f.slug === match.slug)?.warmUp || listed >= listingPrices.length)
      continue;
    const ranked = [...match.players].sort((a, b) => (match.seedPicks[b] ?? 0) - (match.seedPicks[a] ?? 0));
    for (const playerId of ranked.slice(listed % 2, (listed % 2) + 2)) {
      if (listed >= listingPrices.length || (match.seedPicks[playerId] ?? 0) === 0) continue;
      const seller = demoCrowd[listed] ?? demoCrowd[0];
      if (!seller) continue;
      match.seedPicks[playerId] = (match.seedPicks[playerId] ?? 1) - 1;
      nextTokenId += 1;
      tokens.push({
        tokenId: String(nextTokenId),
        matchId: match.id,
        playerId,
        serial: 3 + listed * 4,
        owner: seller,
        minter: seller,
        mintedAt: config.now - 86_400,
        mintHash: null,
        opened: false,
        listing: { seller, price: ((listingPrices[listed] ?? 1_000n) * 10n ** 18n).toString() },
        burned: null,
      });
      listed += 1;
    }
  }
  return {
    version: 3,
    clockOffset: 0,
    txCount: 0,
    nextTokenId: String(nextTokenId + 1),
    matches,
    tokens,
    wallet: { connected: false, wif: config.startingWif.toString(), allowance: "0", gas: "4000000000000000" },
    saleBurned: "0",
  };
}

/**
 * Clearly fake wallets ("0xdeed…") that stand for the crowd in the mock: the seeded pick counts are handed
 * out to them, one card per wallet per match, so the leaderboard has a history to rank. Derived from the
 * match data alone, so it is the same on every machine and needs no extra storage.
 */
export const demoCrowd: Address[] = Array.from(
  { length: 16 },
  (_, index) => `0xdeed${"0".repeat(31)}${String(index + 1).padStart(5, "0")}` as Address,
);

export function crowdLedger(matches: readonly MockMatch[], tokens: readonly MockToken[] = []): LedgerCard[] {
  const ledger: LedgerCard[] = [];
  const holds = new Set(tokens.map((token) => `${token.minter.toLowerCase()}:${token.matchId}`));
  for (const match of matches) {
    const random = seededRandom(`${match.slug}:crowd`);
    const left = new Map(match.players.map((id) => [id, match.seedPicks[id] ?? 0]));
    demoCrowd.forEach((owner, index) => {
      if (random() > 0.72) return;
      // A crowd wallet that holds a real token here (a seeded listing) already has its card for this match.
      if (holds.has(`${owner.toLowerCase()}:${match.id}`)) return;
      const total = [...left.values()].reduce((acc, count) => acc + count, 0);
      if (total === 0) return;
      // Weighted by what is left, so the crowd's cards never exceed the seeded counts.
      let roll = random() * total;
      let playerId = match.players[0] ?? 0;
      for (const [id, count] of left) {
        roll -= count;
        if (roll < 0) {
          playerId = id;
          break;
        }
      }
      left.set(playerId, (left.get(playerId) ?? 1) - 1);
      const won = match.status === "Finalized" && match.winners.includes(playerId);
      const claimedNow = won && random() < 0.85;
      ledger.push({
        tokenId: BigInt(match.id * 1_000_000 + index + 1),
        matchId: match.id,
        playerId,
        owner,
        claimed: claimedNow ? claimShare(BigInt(match.payPool), match.winningCards) : null,
        refunded: false,
      });
    });
  }
  return ledger;
}
