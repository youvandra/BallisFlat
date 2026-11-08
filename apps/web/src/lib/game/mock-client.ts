// A simulated Ball is Flat contract that runs in the browser, so every screen is demoable without a
// wallet or a chain. Rules follow IBallIsFlat; the money math is the shared @app/core/payout.
import { burnAmount, claimShare, payPool, saleSplit } from "@app/core/payout";
import { keccak256, toHex } from "viem";
import {
  createSeed,
  crowdLedger,
  type MockHunt,
  type MockMatch,
  type MockState,
  type MockToken,
  type SeedConfig,
} from "./mock-seed";
import {
  type Account,
  type Address,
  type CardInfo,
  type ClaimReceipt,
  type GameClient,
  GameError,
  type Hash,
  type HuntBuyReceipt,
  type HuntOpenReceipt,
  type HuntPack,
  type HuntStep,
  type HuntTier,
  type HuntView,
  type LedgerCard,
  type Listing,
  type MatchInfo,
  type MatchState,
  type MintReceipt,
  type MintStep,
  type OwnedCard,
  type TxReceipt,
} from "./types";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface MockHuntOptions {
  tiers: readonly HuntTier[];
  burnBps: number;
  winnerBps: number;
  /** Wanted player of round 1. */
  target: number;
  /** Strictly ascending player ids round 1 draws from. */
  pool: readonly number[];
  /** Packs the simulated crowd already bought, and the pot they built. */
  seedPacks: number;
  seedPot: bigint;
}

export interface MockOptions extends Omit<SeedConfig, "now"> {
  /** Hunt simulation; without it the Hunt reads as not deployed. */
  hunt?: MockHuntOptions;
  storage: KeyValueStore | null;
  storageKey?: string;
  /** Simulated confirmation time per transaction step. */
  latencyMs: number;
  clock?: () => number; // unix seconds
}

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockGameClient implements GameClient {
  readonly mode = "mock" as const;
  private state: MockState;
  private readonly listeners = new Set<() => void>();
  private readonly storageKey: string;
  private readonly clock: () => number;

  constructor(private readonly options: MockOptions) {
    this.storageKey = options.storageKey ?? "ball-is-flat.mock.v1";
    this.clock = options.clock ?? (() => Math.floor(Date.now() / 1000));
    this.state = this.load() ?? createSeed({ ...options, now: this.clock() });
    this.save();
  }

  private load(): MockState | null {
    const raw = this.options.storage?.getItem(this.storageKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as MockState;
      // Older saves predate the cap, opened packs and the market: they are replaced by a fresh seed.
      return parsed.version === 3 ? parsed : null;
    } catch {
      // A corrupt save is replaced by a fresh seed.
      return null;
    }
  }

  private save(): void {
    this.options.storage?.setItem(this.storageKey, JSON.stringify(this.state));
  }

  private commit(): void {
    this.save();
    for (const listener of this.listeners) listener();
  }

  /** Starts over from the seed (used by the ops page and tests). */
  reset(): void {
    this.state = createSeed({ ...this.options, now: this.clock() });
    this.commit();
  }

  /** Moves the simulated clock forward, e.g. past kickoff or the dispute window. */
  advance(seconds: number): void {
    this.state.clockOffset += seconds;
    this.commit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  now(): number {
    return this.clock() + this.state.clockOffset;
  }

  // ---------- internals ----------

  private match(matchId: number): MockMatch {
    const match = this.state.matches.find((candidate) => candidate.id === matchId);
    if (!match) throw new GameError("NotListed");
    return match;
  }

  private token(tokenId: bigint): MockToken {
    const token = this.state.tokens.find((candidate) => candidate.tokenId === tokenId.toString());
    if (!token || token.burned) throw new GameError("NotCardOwner");
    return token;
  }

  private tokensIn(matchId: number): MockToken[] {
    return this.state.tokens.filter((token) => token.matchId === matchId);
  }

  private countOn(match: MockMatch, playerId: number): number {
    const seeded = match.seedPicks[playerId] ?? 0;
    return seeded + this.tokensIn(match.id).filter((token) => token.playerId === playerId).length;
  }

  private countAll(match: MockMatch): number {
    return sum(Object.values(match.seedPicks)) + this.tokensIn(match.id).length;
  }

  private pot(match: MockMatch): bigint {
    return BigInt(match.price) * BigInt(this.countAll(match)) + BigInt(match.rolledIn);
  }

  private derive(match: MockMatch): MatchState {
    if (match.status === "Listed") return this.now() < match.kickoff ? "Open" : "Locked";
    if (match.status === "Proposed") return "Proposed";
    if (match.status === "Finalized") return match.winningCards === 0 ? "RolledOver" : "Final";
    if (match.status === "Voided") return "Void";
    return "None";
  }

  private requireWallet(): Address {
    if (!this.state.wallet.connected) throw new GameError("NotConnected");
    return this.options.demoWallet;
  }

  private async send(): Promise<Hash> {
    await wait(this.options.latencyMs);
    this.state.txCount += 1;
    return keccak256(toHex(`ball-is-flat-mock-${this.state.txCount}-${this.now()}`));
  }

  // ---------- reads ----------

  async burnBps(): Promise<number> {
    return this.options.burnBps;
  }

  async disputeWindow(): Promise<number> {
    return this.options.disputeWindow;
  }

  async matchCount(): Promise<number> {
    return this.state.matches.length;
  }

  async matchInfo(matchId: number): Promise<MatchInfo> {
    const match = this.match(matchId);
    return {
      kickoff: match.kickoff,
      proposedAt: match.proposedAt,
      cards: this.countAll(match),
      winningCards: match.winningCards,
      maxPerPlayer: match.maxPerPlayer,
      status: match.status,
      price: BigInt(match.price),
      pot: this.pot(match),
      rolledIn: BigInt(match.rolledIn),
      burned: BigInt(match.burned),
      payPool: BigInt(match.payPool),
      nextMatch: match.nextMatch,
      sourceUrl: match.sourceUrl,
    };
  }

  async stateOf(matchId: number): Promise<MatchState> {
    return this.derive(this.match(matchId));
  }

  async playersOf(matchId: number): Promise<number[]> {
    return [...this.match(matchId).players];
  }

  async winnersOf(matchId: number): Promise<number[]> {
    return [...this.match(matchId).winners];
  }

  async cardsOn(matchId: number, playerId: number): Promise<number> {
    return this.countOn(this.match(matchId), playerId);
  }

  async cardOf(matchId: number, wallet: Address): Promise<bigint> {
    // Mirrors the contract: tied to the original minter and never cleared, even after claim or refund.
    const minted = this.tokensIn(matchId).find(
      (token) => token.minter.toLowerCase() === wallet.toLowerCase(),
    );
    return minted ? BigInt(minted.tokenId) : 0n;
  }

  async cardInfo(tokenId: bigint): Promise<CardInfo> {
    const token = this.token(tokenId);
    return { matchId: token.matchId, playerId: token.playerId, serial: token.serial };
  }

  async claimable(tokenId: bigint): Promise<bigint> {
    const token = this.state.tokens.find((candidate) => candidate.tokenId === tokenId.toString());
    if (!token || token.burned) return 0n;
    const match = this.match(token.matchId);
    if (match.status !== "Finalized" || !match.winners.includes(token.playerId)) return 0n;
    return claimShare(BigInt(match.payPool), match.winningCards);
  }

  async cardsOf(wallet: Address): Promise<OwnedCard[]> {
    return this.state.tokens
      .filter((token) => token.owner.toLowerCase() === wallet.toLowerCase())
      .map((token) => ({
        tokenId: BigInt(token.tokenId),
        matchId: token.matchId,
        playerId: token.playerId,
        serial: token.serial,
        mintedAt: token.mintedAt,
        mintHash: token.mintHash,
        opened: token.opened,
        listing: token.listing ? { price: BigInt(token.listing.price) } : null,
        burned: token.burned ? { ...token.burned, amount: BigInt(token.burned.amount) } : null,
      }));
  }

  async ledger(): Promise<LedgerCard[]> {
    const own = this.state.tokens.map(
      (token): LedgerCard => ({
        tokenId: BigInt(token.tokenId),
        matchId: token.matchId,
        playerId: token.playerId,
        owner: token.minter,
        claimed: token.burned?.kind === "claimed" ? BigInt(token.burned.amount) : null,
        refunded: token.burned?.kind === "refunded",
      }),
    );
    return [...crowdLedger(this.state.matches, this.state.tokens), ...own];
  }

  // ---------- hunt ----------

  private huntOrNull(): MockHunt | null {
    const options = this.options.hunt;
    if (!options) return null;
    if (!this.state.hunt) {
      this.state.hunt = {
        round: 1,
        target: options.target,
        status: "Open",
        winner: null,
        pot: options.seedPot.toString(),
        packs: options.seedPacks,
        pool: [...options.pool],
        carry: "0",
        claimable: "0",
        allowance: "0",
        nextPack: options.seedPacks + 1,
        nextCard: 1,
        mine: [],
      };
      this.save();
    }
    return this.state.hunt;
  }

  private huntState_(): MockHunt {
    const hunt = this.huntOrNull();
    if (!hunt) throw new GameError("HuntUnavailable");
    return hunt;
  }

  async huntState(): Promise<HuntView> {
    const options = this.options.hunt;
    const hunt = this.huntOrNull();
    if (!options || !hunt) {
      return { available: false, round: null, carry: 0n, burnBps: 0, winnerBps: 0, tiers: [] };
    }
    return {
      available: true,
      round: {
        id: hunt.round,
        target: hunt.target,
        status: hunt.status,
        winner: hunt.winner,
        pot: BigInt(hunt.pot),
        packs: hunt.packs,
        poolSize: hunt.pool.length,
      },
      carry: BigInt(hunt.carry),
      burnBps: options.burnBps,
      winnerBps: options.winnerBps,
      tiers: [...options.tiers],
    };
  }

  async huntPacks(wallet: Address): Promise<HuntPack[]> {
    const hunt = this.huntOrNull();
    if (!hunt || wallet.toLowerCase() !== this.options.demoWallet.toLowerCase()) return [];
    return hunt.mine.map((pack) => ({
      packId: BigInt(pack.packId),
      tier: pack.tier,
      round: pack.round,
      opened: pack.opened,
      players: [...pack.players],
      firstCardId: pack.firstCardId === null ? null : BigInt(pack.firstCardId),
      found: pack.found,
      expired: false,
      boughtAt: pack.boughtAt,
    }));
  }

  async huntClaimable(wallet: Address): Promise<bigint> {
    const hunt = this.huntOrNull();
    if (!hunt || wallet.toLowerCase() !== this.options.demoWallet.toLowerCase()) return 0n;
    return BigInt(hunt.claimable);
  }

  async buyHuntPack(tier: number, onStep: (step: HuntStep) => void): Promise<HuntBuyReceipt> {
    this.requireWallet();
    const options = this.options.hunt;
    const hunt = this.huntState_();
    const spec = options?.tiers.find((candidate) => candidate.id === tier);
    if (!options || !spec) throw new GameError("BadTier");
    if (hunt.status !== "Open") throw new GameError("NoOpenRound");
    if (BigInt(this.state.wallet.wif) < spec.price) throw new GameError("InsufficientBalance");
    if (BigInt(hunt.allowance) < spec.price) {
      onStep("approve");
      await this.send();
      hunt.allowance = spec.price.toString();
      this.commit();
    }
    onStep("buy");
    const hash = await this.send();
    const burned = (spec.price * BigInt(options.burnBps)) / 10_000n;
    this.state.wallet.wif = (BigInt(this.state.wallet.wif) - spec.price).toString();
    hunt.allowance = (BigInt(hunt.allowance) - spec.price).toString();
    hunt.pot = (BigInt(hunt.pot) + spec.price - burned).toString();
    hunt.packs += 1;
    const packId = hunt.nextPack;
    hunt.nextPack += 1;
    hunt.mine.push({
      packId: packId.toString(),
      tier,
      round: hunt.round,
      opened: false,
      players: [],
      firstCardId: null,
      found: false,
      boughtAt: this.now(),
    });
    this.commit();
    return { hash, packId: BigInt(packId) };
  }

  async openHuntPack(packId: bigint, onStep: (step: HuntStep) => void): Promise<HuntOpenReceipt> {
    this.requireWallet();
    const options = this.options.hunt;
    const hunt = this.huntState_();
    const pack = hunt.mine.find((candidate) => candidate.packId === packId.toString());
    if (!options || !pack) throw new GameError("UnknownPack");
    if (pack.opened) throw new GameError("AlreadyOpened");
    const spec = options.tiers.find((candidate) => candidate.id === pack.tier);
    if (!spec) throw new GameError("BadTier");
    onStep("seal");
    await wait(this.options.latencyMs);
    onStep("open");
    const hash = await this.send();
    const seed = keccak256(toHex(`${hash}-${pack.packId}`));
    const players: number[] = [];
    for (let i = 0; i < spec.cards; i += 1) {
      const roll = BigInt(keccak256(toHex(`${seed}-${i}`)));
      players.push(hunt.pool[Number(roll % BigInt(hunt.pool.length))] as number);
    }
    pack.opened = true;
    pack.players = players;
    pack.firstCardId = hunt.nextCard.toString();
    hunt.nextCard += players.length;
    const found = players.includes(hunt.target) && hunt.status === "Open" && pack.round === hunt.round;
    if (found) {
      const pot = BigInt(hunt.pot);
      const prize = (pot * BigInt(options.winnerBps)) / 10_000n;
      hunt.status = "Won";
      hunt.winner = this.options.demoWallet;
      hunt.claimable = (BigInt(hunt.claimable) + prize).toString();
      hunt.carry = (BigInt(hunt.carry) + pot - prize).toString();
      pack.found = true;
    }
    this.commit();
    return { hash, players, found };
  }

  async claimHunt(): Promise<ClaimReceipt> {
    this.requireWallet();
    const hunt = this.huntState_();
    const amount = BigInt(hunt.claimable);
    if (amount === 0n) throw new GameError("NothingToClaim");
    const hash = await this.send();
    hunt.claimable = "0";
    this.state.wallet.wif = (BigInt(this.state.wallet.wif) + amount).toString();
    this.commit();
    return { hash, amount };
  }

  async startHuntRound(target: number, pool: number[]): Promise<TxReceipt> {
    this.requireWallet();
    const hunt = this.huntState_();
    if (hunt.status === "Open") throw new GameError("RoundStillOpen");
    if (
      pool.length < 2 ||
      !pool.includes(target) ||
      pool.some((id, i) => i > 0 && id <= (pool[i - 1] ?? 0))
    ) {
      throw new GameError("BadPool");
    }
    const hash = await this.send();
    hunt.round += 1;
    hunt.target = target;
    hunt.status = "Open";
    hunt.winner = null;
    hunt.pot = hunt.carry;
    hunt.carry = "0";
    hunt.packs = 0;
    hunt.pool = [...pool];
    this.commit();
    return { hash };
  }

  async closeHuntRound(): Promise<TxReceipt> {
    this.requireWallet();
    const hunt = this.huntState_();
    if (hunt.status !== "Open") throw new GameError("NoOpenRound");
    const hash = await this.send();
    hunt.status = "Closed";
    hunt.carry = (BigInt(hunt.carry) + BigInt(hunt.pot)).toString();
    this.commit();
    return { hash };
  }

  // ---------- wallet ----------

  async account(): Promise<Account | null> {
    if (!this.state.wallet.connected) return null;
    return {
      address: this.options.demoWallet,
      wif: BigInt(this.state.wallet.wif),
      allowance: BigInt(this.state.wallet.allowance),
      gas: BigInt(this.state.wallet.gas),
      isRightChain: true,
      isSettler: true,
    };
  }

  async connect(): Promise<Account> {
    this.state.wallet.connected = true;
    this.commit();
    const account = await this.account();
    if (!account) throw new GameError("NotConnected");
    return account;
  }

  async disconnect(): Promise<void> {
    this.state.wallet.connected = false;
    this.commit();
  }

  async switchChain(): Promise<void> {
    // The simulated chain is always the right one.
  }

  // ---------- fan ----------

  async mint(matchId: number, playerId: number, onStep: (step: MintStep) => void): Promise<MintReceipt> {
    const owner = this.requireWallet();
    const match = this.match(matchId);
    if (this.derive(match) !== "Open") throw new GameError("MintClosed");
    if (!match.players.includes(playerId)) throw new GameError("UnknownPlayer");
    if (match.maxPerPlayer > 0 && this.countOn(match, playerId) >= match.maxPerPlayer) {
      throw new GameError("PlayerSoldOut");
    }
    if ((await this.cardOf(matchId, owner)) !== 0n) throw new GameError("AlreadyHasCard");
    const price = BigInt(match.price);
    if (BigInt(this.state.wallet.wif) < price) throw new GameError("InsufficientBalance");

    if (BigInt(this.state.wallet.allowance) < price) {
      onStep("approve");
      await this.send();
      this.state.wallet.allowance = price.toString();
      this.commit();
    }
    onStep("mint");
    const hash = await this.send();
    // Re-check after the wait: the clock or another tab may have moved on.
    if ((await this.cardOf(matchId, owner)) !== 0n) throw new GameError("AlreadyHasCard");
    const tokenId = BigInt(this.state.nextTokenId);
    this.state.nextTokenId = (tokenId + 1n).toString();
    this.state.wallet.wif = (BigInt(this.state.wallet.wif) - price).toString();
    this.state.wallet.allowance = (BigInt(this.state.wallet.allowance) - price).toString();
    this.state.tokens.push({
      tokenId: tokenId.toString(),
      matchId,
      playerId,
      serial: this.countAll(match) + 1,
      owner,
      minter: owner,
      mintedAt: this.now(),
      mintHash: hash,
      opened: false,
      burned: null,
    });
    this.commit();
    return { hash, tokenId };
  }

  private async burnToken(tokenId: bigint, kind: "claimed" | "refunded"): Promise<ClaimReceipt> {
    const owner = this.requireWallet();
    const token = this.token(tokenId);
    if (token.owner !== owner) throw new GameError("NotCardOwner");
    const match = this.match(token.matchId);
    const amount = kind === "claimed" ? await this.claimable(tokenId) : BigInt(match.price);
    if (kind === "claimed" && amount === 0n) throw new GameError("NotAWinner");
    if (kind === "refunded" && match.status !== "Voided") throw new GameError("WrongStatus");
    const hash = await this.send();
    token.burned = { kind, amount: amount.toString(), hash };
    token.listing = null;
    this.state.wallet.wif = (BigInt(this.state.wallet.wif) + amount).toString();
    this.commit();
    return { hash, amount };
  }

  async open(tokenId: bigint): Promise<TxReceipt> {
    const owner = this.requireWallet();
    const token = this.token(tokenId);
    if (token.owner !== owner) throw new GameError("NotCardOwner");
    if (token.opened) throw new GameError("AlreadyOpened");
    const hash = await this.send();
    token.opened = true;
    token.listing = null;
    this.commit();
    return { hash };
  }

  // ---------- market ----------

  async saleBurnBps(): Promise<number> {
    return this.options.saleBurnBps ?? 500;
  }

  /** Listed and before kickoff, like the contract's `_tradingOpen`. */
  private tradingOpen(match: MockMatch): boolean {
    return match.status === "Listed" && this.now() < match.kickoff;
  }

  /** A listing counts only while its seller still owns the sealed card and the match still trades. */
  private liveListing(token: MockToken): { seller: Address; price: bigint } | null {
    if (!token.listing || token.burned || token.opened) return null;
    if (token.owner.toLowerCase() !== token.listing.seller.toLowerCase()) return null;
    if (!this.tradingOpen(this.match(token.matchId))) return null;
    return { seller: token.listing.seller, price: BigInt(token.listing.price) };
  }

  async listings(matchId: number): Promise<Listing[]> {
    return this.tokensIn(matchId).flatMap((token) => {
      const live = this.liveListing(token);
      return live
        ? [
            {
              tokenId: BigInt(token.tokenId),
              matchId: token.matchId,
              playerId: token.playerId,
              serial: token.serial,
              seller: live.seller,
              price: live.price,
            },
          ]
        : [];
    });
  }

  async listForSale(tokenId: bigint, price: bigint): Promise<TxReceipt> {
    const owner = this.requireWallet();
    const token = this.token(tokenId);
    if (token.owner.toLowerCase() !== owner.toLowerCase()) throw new GameError("NotCardOwner");
    if (price <= 0n) throw new GameError("ZeroPrice");
    if (token.opened) throw new GameError("AlreadyOpened");
    if (!this.tradingOpen(this.match(token.matchId))) throw new GameError("TradingClosed");
    const hash = await this.send();
    token.listing = { seller: owner, price: price.toString() };
    this.commit();
    return { hash };
  }

  async cancelListing(tokenId: bigint): Promise<TxReceipt> {
    const owner = this.requireWallet();
    const token = this.state.tokens.find((candidate) => candidate.tokenId === tokenId.toString());
    if (!token?.listing) throw new GameError("NotForSale");
    if (token.listing.seller.toLowerCase() !== owner.toLowerCase()) throw new GameError("NotCardOwner");
    const hash = await this.send();
    token.listing = null;
    this.commit();
    return { hash };
  }

  async buy(tokenId: bigint, maxPrice: bigint, onStep: (step: MintStep) => void): Promise<TxReceipt> {
    const buyer = this.requireWallet();
    const token = this.state.tokens.find((candidate) => candidate.tokenId === tokenId.toString());
    const check = () => {
      if (
        !token?.listing ||
        token.burned ||
        token.owner.toLowerCase() !== token.listing.seller.toLowerCase()
      ) {
        throw new GameError("NotForSale");
      }
      if (token.opened) throw new GameError("AlreadyOpened");
      if (!this.tradingOpen(this.match(token.matchId))) throw new GameError("TradingClosed");
      const price = BigInt(token.listing.price);
      if (price > maxPrice) throw new GameError("PriceAboveMax");
      if (token.listing.seller.toLowerCase() === buyer.toLowerCase()) throw new GameError("CannotBuyOwnCard");
      if (BigInt(this.state.wallet.wif) < price) throw new GameError("InsufficientBalance");
      return { token, price };
    };
    const { price } = check();
    if (BigInt(this.state.wallet.allowance) < price) {
      onStep("approve");
      await this.send();
      this.state.wallet.allowance = price.toString();
      this.commit();
    }
    onStep("buy");
    const hash = await this.send();
    // Re-check after the wait: the seller may have re-listed, or kickoff may have passed.
    const confirmed = check();
    const { burned } = saleSplit(confirmed.price, await this.saleBurnBps());
    this.state.wallet.wif = (BigInt(this.state.wallet.wif) - confirmed.price).toString();
    this.state.wallet.allowance = (BigInt(this.state.wallet.allowance) - confirmed.price).toString();
    this.state.saleBurned = (BigInt(this.state.saleBurned ?? "0") + burned).toString();
    // The seller is paid the rest (demo crowd balances are not tracked). `minter` stays: cardOf is unchanged.
    confirmed.token.owner = buyer;
    confirmed.token.listing = null;
    this.commit();
    return { hash };
  }

  claim(tokenId: bigint): Promise<ClaimReceipt> {
    return this.burnToken(tokenId, "claimed");
  }

  refund(tokenId: bigint): Promise<ClaimReceipt> {
    return this.burnToken(tokenId, "refunded");
  }

  // ---------- anyone ----------

  async finalize(matchId: number): Promise<TxReceipt> {
    const match = this.match(matchId);
    if (match.status !== "Proposed") throw new GameError("WrongStatus");
    if (this.now() < match.proposedAt + this.options.disputeWindow) throw new GameError("TooEarly");
    const hash = await this.send();
    const pot = this.pot(match);
    match.status = "Finalized";
    match.burned = burnAmount(pot, this.options.burnBps).toString();
    match.payPool = payPool(pot, this.options.burnBps).toString();
    match.winningCards = sum(match.winners.map((playerId) => this.countOn(match, playerId)));
    if (match.winningCards === 0) this.rollTo(match.nextMatch, BigInt(match.payPool));
    this.commit();
    return { hash };
  }

  private rollTo(nextMatchId: number, amount: bigint): void {
    const next = this.state.matches.find((candidate) => candidate.id === nextMatchId);
    // Mirrors the contract: no next match, or one already settled, burns the pot.
    if (!next || next.status === "Finalized" || next.status === "Voided") return;
    next.rolledIn = (BigInt(next.rolledIn) + amount).toString();
  }

  // ---------- settler ----------

  async propose(matchId: number, winners: number[], sourceUrl: string): Promise<TxReceipt> {
    this.requireWallet();
    const match = this.match(matchId);
    if (match.status !== "Listed" && match.status !== "Proposed") throw new GameError("WrongStatus");
    if (match.status === "Proposed" && this.now() >= match.proposedAt + this.options.disputeWindow) {
      throw new GameError("WindowClosed");
    }
    if (this.now() < match.kickoff) throw new GameError("TooEarly");
    if (winners.some((playerId) => !match.players.includes(playerId))) throw new GameError("UnknownPlayer");
    const hash = await this.send();
    // A second propose during the window acts as `correct`: the window does not restart.
    if (match.status === "Listed") match.proposedAt = this.now();
    match.status = "Proposed";
    match.winners = [...winners];
    match.sourceUrl = sourceUrl;
    this.commit();
    return { hash };
  }

  async voidMatch(matchId: number): Promise<TxReceipt> {
    this.requireWallet();
    const match = this.match(matchId);
    if (match.status !== "Listed" && match.status !== "Proposed") throw new GameError("WrongStatus");
    const hash = await this.send();
    match.status = "Voided";
    this.rollTo(match.nextMatch, BigInt(match.rolledIn));
    match.rolledIn = "0";
    this.commit();
    return { hash };
  }
}
