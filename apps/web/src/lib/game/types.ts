// The app's view of IBallIsFlat (packages/contracts/src/IBallIsFlat.sol). Both the mock and the chain
// client return these shapes, so every screen works the same in either mode.

export type Address = `0x${string}`;
export type Hash = `0x${string}`;

/** Stored lifecycle, same order as `IBallIsFlat.Status`. */
export const statuses = ["None", "Listed", "Proposed", "Finalized", "Voided"] as const;
export type Status = (typeof statuses)[number];

/** What the UI shows, same order as `IBallIsFlat.State`. */
export const matchStates = ["None", "Open", "Locked", "Proposed", "Final", "RolledOver", "Void"] as const;
export type MatchState = (typeof matchStates)[number];

export interface MatchInfo {
  kickoff: number; // unix seconds
  proposedAt: number;
  cards: number;
  winningCards: number;
  /** Cards allowed on one player, 0 = unlimited. */
  maxPerPlayer: number;
  status: Status;
  price: bigint;
  pot: bigint;
  rolledIn: bigint;
  burned: bigint;
  payPool: bigint;
  nextMatch: number;
  sourceUrl: string;
}

export interface CardInfo {
  matchId: number;
  playerId: number;
  serial: number;
}

/** A card the wallet holds now, or held before it was burned by claim or refund. */
export interface OwnedCard extends CardInfo {
  tokenId: bigint;
  mintedAt: number; // unix seconds
  mintHash: Hash | null;
  /** Torn open by its owner (on chain: `open`, one-way; an opened card can never be sold). */
  opened: boolean;
  /** Listed for sale by this wallet, or null. */
  listing: { price: bigint } | null;
  /** Paid out: burned for its share (claimed), refunded, or kept (share minus the burned keep fee). */
  burned: { kind: "claimed" | "refunded" | "kept"; amount: bigint; hash: Hash } | null;
}

/**
 * One card on the public record, for the leaderboard: who minted it (CardMinted) and, once it is gone,
 * what its burn paid (CardClaimed) or that it refunded (CardRefunded).
 */
export interface LedgerCard {
  tokenId: bigint;
  matchId: number;
  playerId: number;
  owner: Address;
  claimed: bigint | null;
  refunded: boolean;
}

export interface Account {
  address: Address;
  wif: bigint;
  allowance: bigint;
  gas: bigint; // native balance for gas
  isRightChain: boolean;
  isSettler: boolean;
}

export type MintStep = "approve" | "mint" | "buy";

/** A sealed card for sale. The card stays in the seller's wallet until someone buys it. */
export interface Listing {
  tokenId: bigint;
  matchId: number;
  playerId: number;
  serial: number;
  seller: Address;
  price: bigint;
}

export interface TxReceipt {
  hash: Hash;
}

export interface MintReceipt extends TxReceipt {
  tokenId: bigint;
}

export interface ClaimReceipt extends TxReceipt {
  amount: bigint;
}

// ---------- Hunt ----------

/** Done = every wanted card in the deck was found (or lost to an expired pack); Closed = ended early. */
export type HuntStatus = "None" | "Open" | "Done" | "Closed";
export const huntStatuses: readonly HuntStatus[] = ["None", "Open", "Done", "Closed"];

export interface HuntTierSpec {
  price: bigint;
  cards: number;
  /** Merkle root of wallets allowed one pack each; null = anyone. */
  allowRoot: Hash | null;
}

export interface HuntTier extends HuntTierSpec {
  id: number;
  name: string;
}

/** One wanted card pulled from the deck. The team pays its prize by transfer, then records it (markPaid). */
export interface HuntFind {
  index: number;
  winner: Address;
  packId: bigint;
  slot: number;
  /** The winner asked for the prize (it is in the team's payout queue). */
  claimed: boolean;
  paid: boolean;
  /** Transaction hash of the prize transfer, once the team recorded it. */
  payment: Hash | null;
}

export interface HuntRound {
  id: number;
  /** The wanted player's global id. */
  target: number;
  status: HuntStatus;
  /** Wanted cards in the deck. */
  winners: number;
  found: number;
  /** Wanted cards drawn by packs opened after their reveal window (nobody wins them). */
  lost: number;
  /** Cards in the deck; packs stop selling when `sold` reaches it. */
  supply: number;
  sold: number;
  drawn: number;
  packs: number;
  /** $WIF the team posts for each wanted card, paid by transfer to its finder. */
  prizeEach: bigint;
  poolSize: number;
  tiers: HuntTier[];
  finds: HuntFind[];
}

export interface HuntView {
  /** False until a Hunt contract is deployed on this network. */
  available: boolean;
  round: HuntRound | null;
  /** Every round so far, newest first (the admin payout queue reads it). */
  history: HuntRound[];
  burnBps: number;
  /** $WIF to mint one drawn card (0 = gas only). */
  mintPrice: bigint;
  treasury: Address | null;
  /** Tiers of the current round (empty without one). */
  tiers: HuntTier[];
}

export interface StartHuntRound {
  target: number;
  prizeEach: bigint;
  winners: number;
  supply: number;
  /** Strictly ascending player ids, including the target. */
  pool: number[];
  /** Silver, Gold, Diamond. */
  tiers: HuntTierSpec[];
}

export interface HuntPack {
  packId: bigint;
  tier: number;
  round: number;
  opened: boolean;
  /** Player ids drawn, in slot order; empty until opened. */
  players: number[];
  /** Per slot: the minted card id, or null while the drawn card is not minted. */
  minted: (bigint | null)[];
  /** This pack found its round's wanted player. */
  found: boolean;
  /** Opened after the reveal window: drawn without the wanted player. */
  expired: boolean;
  boughtAt: number;
}

export interface HuntBuyReceipt extends TxReceipt {
  packId: bigint;
}

export interface HuntOpenReceipt extends TxReceipt {
  players: number[];
  found: boolean;
}

export type HuntStep = "approve" | "buy" | "seal" | "open";

/**
 * Reads and writes the app needs from the contract. `mock` simulates them in the browser,
 * `chain` calls the deployment on Robinhood Chain.
 */
export interface GameClient {
  readonly mode: "mock" | "chain";
  // reads
  burnBps(): Promise<number>;
  disputeWindow(): Promise<number>;
  now(): number; // unix seconds, the clock the contract would see
  matchCount(): Promise<number>;
  matchInfo(matchId: number): Promise<MatchInfo>;
  stateOf(matchId: number): Promise<MatchState>;
  playersOf(matchId: number): Promise<number[]>;
  winnersOf(matchId: number): Promise<number[]>;
  cardsOn(matchId: number, playerId: number): Promise<number>;
  cardOf(matchId: number, wallet: Address): Promise<bigint>;
  cardInfo(tokenId: bigint): Promise<CardInfo>;
  claimable(tokenId: bigint): Promise<bigint>;
  cardsOf(wallet: Address): Promise<OwnedCard[]>;
  /** Every card ever minted, by minter, with its claim if it was burned for one. */
  ledger(): Promise<LedgerCard[]>;
  // wallet
  account(): Promise<Account | null>;
  /** walletId picks one EIP-6963 wallet by its rdns; without it, the default browser wallet. */
  connect(walletId?: string): Promise<Account>;
  disconnect(): Promise<void>;
  switchChain(): Promise<void>;
  // fan
  mint(matchId: number, playerId: number, onStep: (step: MintStep) => void): Promise<MintReceipt>;
  claim(tokenId: bigint): Promise<ClaimReceipt>;
  /** Takes the share minus the keep fee (burned) and keeps the card. */
  claimAndKeep(tokenId: bigint): Promise<ClaimReceipt>;
  /** $WIF burned from the share when a winner keeps the card. */
  keepFee(): Promise<bigint>;
  refund(tokenId: bigint): Promise<ClaimReceipt>;
  /** Tears the pack: one-way, owner only. Clears any listing. */
  open(tokenId: bigint): Promise<TxReceipt>;
  // market (sealed cards, before kickoff)
  saleBurnBps(): Promise<number>;
  /** Live listings for a match (the contract's listingOf is the source of truth). */
  listings(matchId: number): Promise<Listing[]>;
  listForSale(tokenId: bigint, price: bigint): Promise<TxReceipt>;
  cancelListing(tokenId: bigint): Promise<TxReceipt>;
  /** Approves $WIF if needed, then buys at no more than maxPrice. */
  buy(tokenId: bigint, maxPrice: bigint, onStep: (step: MintStep) => void): Promise<TxReceipt>;
  // anyone
  finalize(matchId: number): Promise<TxReceipt>;
  // settler
  propose(matchId: number, winners: number[], sourceUrl: string): Promise<TxReceipt>;
  voidMatch(matchId: number): Promise<TxReceipt>;
  // hunt (wanted-player packs)
  huntState(): Promise<HuntView>;
  huntPacks(wallet: Address): Promise<HuntPack[]>;
  /** Approves $WIF if needed, then buys one pack of `tier` (`proof` when the tier has an allowlist). */
  buyHuntPack(tier: number, onStep: (step: HuntStep) => void, proof?: Hash[]): Promise<HuntBuyReceipt>;
  /** The wallet already used its one allowlist pack of `tier` in `round`. */
  huntAllowUsed(round: number, tier: number, wallet: Address): Promise<boolean>;
  /** Waits for the pack's reveal block, then opens it (cards go to the buyer). */
  openHuntPack(packId: bigint, onStep: (step: HuntStep) => void): Promise<HuntOpenReceipt>;
  /** Approves $WIF if the mint has a price, then mints one drawn slot of an opened pack. */
  mintHuntCard(packId: bigint, slot: number, onStep: (step: MintStep) => void): Promise<MintReceipt>;
  /** The finder asks the team for one find's prize (moves no funds). */
  claimHuntPrize(round: number, findIndex: number): Promise<TxReceipt>;
  // hunt owner
  startHuntRound(input: StartHuntRound): Promise<TxReceipt>;
  /** Changes one tier of the open round (price, cards, allowlist). */
  setHuntTier(tier: number, spec: HuntTierSpec): Promise<TxReceipt>;
  closeHuntRound(): Promise<TxReceipt>;
  /** Records the prize transfer for one find. */
  markHuntPaid(round: number, findIndex: number, payment: Hash): Promise<TxReceipt>;
  /** Subscribes to state changes (mock writes, chain blocks). Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** A named contract error, so the UI can show its sentence. */
export class GameError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "GameError";
  }
}
