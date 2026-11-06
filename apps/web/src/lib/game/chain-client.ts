// The real client: viem reads and wagmi's injected connector (MetaMask, Rabby, Robinhood Wallet) against
// the BallIsFlat deployment on Robinhood Chain. Loaded only when VITE_DATA_MODE=chain.
import { ballIsFlatAbi } from "@app/config/abi/BallIsFlat";
import { squadProof } from "@app/core/squad";
import type { Hex } from "viem";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  erc20Abi,
  http,
  parseEventLogs,
  UserRejectedRequestError,
} from "viem";
import { createConfig } from "wagmi";
import {
  connect,
  disconnect,
  getAccount,
  getBalance,
  readContract,
  reconnect,
  switchChain,
  waitForTransactionReceipt,
  watchAccount,
  watchBlockNumber,
  writeContract,
} from "wagmi/actions";
import { injected, mock } from "wagmi/connectors";
import { type ApiCard, api, apiUrl, big } from "../api";
import { env } from "../env";
import { chain, contractAddress, deployBlock, wifAddress } from "./chain";
import { fixtureById } from "./fixtures";
import {
  type Account,
  type Address,
  type CardInfo,
  type ClaimReceipt,
  type GameClient,
  GameError,
  type Hash,
  type LedgerCard,
  type Listing,
  type MatchInfo,
  type MatchState,
  type MintReceipt,
  type MintStep,
  matchStates,
  type OwnedCard,
  statuses,
  type TxReceipt,
} from "./types";

const config = createConfig({
  chains: [chain],
  // On a local anvil node the app can sign as an unlocked account; everywhere else it is the browser wallet.
  connectors: env.VITE_DEV_ACCOUNT
    ? [mock({ accounts: [env.VITE_DEV_ACCOUNT as Address], features: { reconnect: true } })]
    : [injected()],
  transports: { [chain.id]: http() },
});

// Event scans go through a plain public client so large ranges batch over JSON-RPC.
const publicClient = createPublicClient({ chain, transport: http(undefined, { batch: true }) });

const contract = { address: contractAddress, abi: ballIsFlatAbi } as const;

/** Turns a viem failure into a named GameError the UI has a sentence for. */
function toGameError(error: unknown): GameError {
  if (error instanceof BaseError) {
    const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName) {
      return new GameError(reverted.data.errorName, error.shortMessage);
    }
    if (error.walk((cause) => cause instanceof UserRejectedRequestError))
      return new GameError("UserRejected");
    return new GameError("Unknown", error.shortMessage);
  }
  return new GameError("Unknown", error instanceof Error ? error.message : String(error));
}

async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw error instanceof GameError ? error : toGameError(error);
  }
}

export class ChainGameClient implements GameClient {
  readonly mode = "chain" as const;
  private clockSkew = 0;
  // Restores a wallet the visitor already connected, so a reload keeps them signed in.
  private readonly restored = reconnect(config).catch(() => []);

  now(): number {
    return Math.floor(Date.now() / 1000) + this.clockSkew;
  }

  subscribe(listener: () => void): () => void {
    const stopBlocks = watchBlockNumber(config, {
      emitOnBegin: false,
      pollingInterval: 4_000,
      onBlockNumber: () => listener(),
    });
    const stopAccount = watchAccount(config, { onChange: () => listener() });
    return () => {
      stopBlocks();
      stopAccount();
    };
  }

  // ---------- reads ----------

  async burnBps(): Promise<number> {
    return Number(await readContract(config, { ...contract, functionName: "burnBps" }));
  }

  async disputeWindow(): Promise<number> {
    return Number(await readContract(config, { ...contract, functionName: "disputeWindow" }));
  }

  async matchCount(): Promise<number> {
    const block = await publicClient.getBlock();
    // Kickoff checks use the chain's clock, so skew the local one to it.
    this.clockSkew = Number(block.timestamp) - Math.floor(Date.now() / 1000);
    return Number(await readContract(config, { ...contract, functionName: "matchCount" }));
  }

  async matchInfo(matchId: number): Promise<MatchInfo> {
    const info = await readContract(config, {
      ...contract,
      functionName: "matchInfo",
      args: [BigInt(matchId)],
    });
    return {
      kickoff: Number(info.kickoff),
      proposedAt: Number(info.proposedAt),
      cards: Number(info.cards),
      winningCards: Number(info.winningCards),
      maxPerPlayer: Number(info.maxPerPlayer),
      status: statuses[Number(info.status)] ?? "None",
      price: info.price,
      pot: info.pot,
      rolledIn: info.rolledIn,
      burned: info.burned,
      payPool: info.payPool,
      nextMatch: Number(info.nextMatch),
      sourceUrl: info.sourceUrl,
    };
  }

  async stateOf(matchId: number): Promise<MatchState> {
    const state = await readContract(config, {
      ...contract,
      functionName: "stateOf",
      args: [BigInt(matchId)],
    });
    return matchStates[Number(state)] ?? "None";
  }

  /** The squad as listed on chain: from the API's board, else from the listing and update events. */
  async playersOf(matchId: number): Promise<number[]> {
    const fromBoard = apiUrl ? fixtureById(matchId) : undefined;
    if (fromBoard) return fromBoard.players.map((player) => player.id).sort((a, b) => a - b);
    const range = { address: contractAddress, fromBlock: deployBlock, toBlock: "latest" } as const;
    const args = { matchId: BigInt(matchId) };
    const [listed, updated] = await Promise.all([
      publicClient.getContractEvents({ ...range, abi: ballIsFlatAbi, eventName: "MatchListed", args }),
      publicClient.getContractEvents({ ...range, abi: ballIsFlatAbi, eventName: "PlayersUpdated", args }),
    ]);
    const latest = updated.at(-1)?.args.playerIds ?? listed.at(-1)?.args.playerIds ?? [];
    return latest.map(Number);
  }

  private async proofFor(matchId: number, playerId: number): Promise<Hex[]> {
    if (apiUrl) {
      const body = await api<{ proof: Hex[] }>(`/api/matches/${matchId}/proof/${playerId}`).catch(() => null);
      if (body) return body.proof;
    }
    const proof = squadProof(await this.playersOf(matchId), playerId);
    if (!proof) throw new GameError("UnknownPlayer");
    return proof;
  }

  async winnersOf(matchId: number): Promise<number[]> {
    const ids = await readContract(config, {
      ...contract,
      functionName: "winnersOf",
      args: [BigInt(matchId)],
    });
    return ids.map(Number);
  }

  async cardsOn(matchId: number, playerId: number): Promise<number> {
    return Number(
      await readContract(config, { ...contract, functionName: "cardsOn", args: [BigInt(matchId), playerId] }),
    );
  }

  async cardOf(matchId: number, wallet: Address): Promise<bigint> {
    return readContract(config, { ...contract, functionName: "cardOf", args: [BigInt(matchId), wallet] });
  }

  async cardInfo(tokenId: bigint): Promise<CardInfo> {
    const info = await readContract(config, { ...contract, functionName: "cardInfo", args: [tokenId] });
    return { matchId: Number(info.matchId), playerId: Number(info.playerId), serial: Number(info.serial) };
  }

  async claimable(tokenId: bigint): Promise<bigint> {
    return readContract(config, { ...contract, functionName: "claimable", args: [tokenId] });
  }

  /**
   * Cards the wallet holds now (ERC721Enumerable) plus the ones it burned by claim or refund
   * (CardClaimed / CardRefunded events). `cardOf` is not used here: it keys on the original minter.
   */
  async cardsOf(wallet: Address): Promise<OwnedCard[]> {
    if (apiUrl) {
      const cards = await api<ApiCard[]>(`/api/wallets/${wallet}/cards`);
      return cards.map((card) => ({
        tokenId: big(card.tokenId),
        matchId: Number(card.matchId),
        playerId: card.playerId,
        serial: card.serial,
        mintedAt: Number(card.mintedAt),
        mintHash: card.mintTx,
        opened: card.opened || card.state !== "live",
        listing: card.listingPrice ? { price: big(card.listingPrice) } : null,
        burned:
          card.state === "live" || !card.burnTx
            ? null
            : { kind: card.state, amount: big(card.payout), hash: card.burnTx },
      }));
    }
    const count = await readContract(config, { ...contract, functionName: "balanceOf", args: [wallet] });
    const heldIds = await Promise.all(
      Array.from({ length: Number(count) }, (_, index) =>
        readContract(config, {
          ...contract,
          functionName: "tokenOfOwnerByIndex",
          args: [wallet, BigInt(index)],
        }),
      ),
    );
    const range = { address: contractAddress, fromBlock: deployBlock, toBlock: "latest" } as const;
    const [mintedLogs, claimedLogs, refundedLogs] = await Promise.all([
      publicClient.getContractEvents({ ...range, abi: ballIsFlatAbi, eventName: "CardMinted" }),
      publicClient.getContractEvents({ ...range, abi: ballIsFlatAbi, eventName: "CardClaimed" }),
      publicClient.getContractEvents({ ...range, abi: ballIsFlatAbi, eventName: "CardRefunded" }),
    ]);
    const isMine = (owner: string | undefined) => owner?.toLowerCase() === wallet.toLowerCase();
    const burnedBy = new Map<bigint, NonNullable<OwnedCard["burned"]>>();
    for (const log of claimedLogs) {
      if (log.args.tokenId === undefined || !isMine(log.args.owner)) continue;
      burnedBy.set(log.args.tokenId, {
        kind: "claimed",
        amount: log.args.amount ?? 0n,
        hash: log.transactionHash,
      });
    }
    for (const log of refundedLogs) {
      if (log.args.tokenId === undefined || !isMine(log.args.owner)) continue;
      burnedBy.set(log.args.tokenId, {
        kind: "refunded",
        amount: log.args.amount ?? 0n,
        hash: log.transactionHash,
      });
    }
    const wanted = new Set<bigint>([...heldIds, ...burnedBy.keys()]);
    const mintLogs = mintedLogs.filter(
      (log) => log.args.tokenId !== undefined && wanted.has(log.args.tokenId),
    );
    const blocks = new Map<bigint, number>();
    const openedIds = new Set<bigint>();
    const listedAt = new Map<bigint, bigint>();
    await Promise.all(
      heldIds.map(async (tokenId) => {
        const [opened, listing] = await Promise.all([
          readContract(config, { ...contract, functionName: "isOpened", args: [tokenId] }),
          readContract(config, { ...contract, functionName: "listingOf", args: [tokenId] }),
        ]);
        if (opened) openedIds.add(tokenId);
        const [seller, price] = listing;
        if (seller.toLowerCase() === wallet.toLowerCase() && price > 0n) listedAt.set(tokenId, price);
      }),
    );
    await Promise.all(
      [...new Set(mintLogs.map((log) => log.blockNumber))].map(async (blockNumber) => {
        const block = await publicClient.getBlock({ blockNumber });
        blocks.set(blockNumber, Number(block.timestamp));
      }),
    );
    return mintLogs.map((log) => {
      const tokenId = log.args.tokenId ?? 0n;
      return {
        tokenId,
        matchId: Number(log.args.matchId ?? 0n),
        playerId: Number(log.args.playerId ?? 0),
        serial: Number(log.args.serial ?? 0),
        mintedAt: blocks.get(log.blockNumber) ?? 0,
        mintHash: log.transactionHash,
        // A burned card no longer exists to ask; it was seen when it was claimed or refunded.
        opened: openedIds.has(tokenId) || burnedBy.has(tokenId),
        listing: listedAt.has(tokenId) ? { price: listedAt.get(tokenId) ?? 0n } : null,
        burned: burnedBy.get(tokenId) ?? null,
      };
    });
  }

  /**
   * The leaderboard's record from events: every CardMinted credited to its minter, with the CardClaimed
   * amount or CardRefunded once the card is burned. Not yet run against the deployment.
   */
  async ledger(): Promise<LedgerCard[]> {
    if (apiUrl) {
      type Row = {
        tokenId: string;
        matchId: string;
        playerId: number;
        minter: Address;
        state: string;
        payout: string;
      };
      const rows = await api<Row[]>("/api/ledger");
      return rows.map((row) => ({
        tokenId: big(row.tokenId),
        matchId: Number(row.matchId),
        playerId: row.playerId,
        owner: row.minter,
        claimed: row.state === "claimed" ? big(row.payout) : null,
        refunded: row.state === "refunded",
      }));
    }
    const range = { address: contractAddress, fromBlock: deployBlock, toBlock: "latest" } as const;
    const [mintedLogs, claimedLogs, refundedLogs] = await Promise.all([
      publicClient.getContractEvents({ ...range, abi: ballIsFlatAbi, eventName: "CardMinted" }),
      publicClient.getContractEvents({ ...range, abi: ballIsFlatAbi, eventName: "CardClaimed" }),
      publicClient.getContractEvents({ ...range, abi: ballIsFlatAbi, eventName: "CardRefunded" }),
    ]);
    const claimed = new Map<bigint, bigint>();
    for (const log of claimedLogs) {
      if (log.args.tokenId !== undefined) claimed.set(log.args.tokenId, log.args.amount ?? 0n);
    }
    const refunded = new Set(
      refundedLogs.flatMap((log) => (log.args.tokenId === undefined ? [] : [log.args.tokenId])),
    );
    return mintedLogs.flatMap((log) => {
      const tokenId = log.args.tokenId;
      if (tokenId === undefined || !log.args.owner) return [];
      return [
        {
          tokenId,
          matchId: Number(log.args.matchId ?? 0n),
          playerId: Number(log.args.playerId ?? 0),
          owner: log.args.owner,
          claimed: claimed.get(tokenId) ?? null,
          refunded: refunded.has(tokenId),
        },
      ];
    });
  }

  // ---------- wallet ----------

  async account(): Promise<Account | null> {
    await this.restored;
    const current = getAccount(config);
    if (!current.address) return null;
    const address = current.address;
    const [wif, allowance, gas, settler] = await Promise.all([
      readContract(config, {
        address: wifAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      }),
      readContract(config, {
        address: wifAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, contractAddress],
      }),
      getBalance(config, { address }).then((balance) => balance.value),
      readContract(config, { ...contract, functionName: "settler" }),
    ]);
    return {
      address,
      wif,
      allowance,
      gas,
      isRightChain: current.chainId === chain.id,
      isSettler: settler.toLowerCase() === address.toLowerCase(),
    };
  }

  connect(walletId?: string): Promise<Account> {
    return guard(async () => {
      // wagmi lists every EIP-6963 wallet it discovered under its rdns, next to the default injected one.
      const connector =
        (walletId ? config.connectors.find((item) => item.id === walletId) : undefined) ??
        config.connectors[0];
      if (!connector) throw new GameError("NoWallet");
      await connect(config, { connector, chainId: chain.id });
      const account = await this.account();
      if (!account) throw new GameError("NotConnected");
      return account;
    });
  }

  async disconnect(): Promise<void> {
    await disconnect(config);
  }

  switchChain(): Promise<void> {
    // wagmi's injected connector adds the chain with wallet_addEthereumChain when the wallet lacks it.
    return guard(async () => {
      await switchChain(config, { chainId: chain.id });
    });
  }

  // ---------- writes ----------

  private async confirm(hash: Hash) {
    const receipt = await waitForTransactionReceipt(config, { hash, chainId: chain.id });
    if (receipt.status !== "success") throw new GameError("Reverted");
    return receipt;
  }

  mint(matchId: number, playerId: number, onStep: (step: MintStep) => void): Promise<MintReceipt> {
    return guard(async () => {
      const account = await this.account();
      if (!account) throw new GameError("NotConnected");
      const info = await this.matchInfo(matchId);
      if (account.allowance < info.price) {
        onStep("approve");
        const approveHash = await writeContract(config, {
          address: wifAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [contractAddress, info.price],
          chainId: chain.id,
        });
        await this.confirm(approveHash);
      }
      const proof = await this.proofFor(matchId, playerId);
      onStep("mint");
      const hash = await writeContract(config, {
        ...contract,
        functionName: "mint",
        args: [BigInt(matchId), playerId, proof],
        chainId: chain.id,
      });
      const receipt = await this.confirm(hash);
      const [minted] = parseEventLogs({ abi: ballIsFlatAbi, eventName: "CardMinted", logs: receipt.logs });
      return { hash, tokenId: minted?.args.tokenId ?? 0n };
    });
  }

  private burnCard(tokenId: bigint, functionName: "claim" | "refund"): Promise<ClaimReceipt> {
    return guard(async () => {
      const amountBefore = functionName === "claim" ? await this.claimable(tokenId) : 0n;
      const hash = await writeContract(config, {
        ...contract,
        functionName,
        args: [tokenId],
        chainId: chain.id,
      });
      const receipt = await this.confirm(hash);
      const eventName = functionName === "claim" ? "CardClaimed" : "CardRefunded";
      const [event] = parseEventLogs({ abi: ballIsFlatAbi, eventName, logs: receipt.logs });
      return { hash, amount: event?.args.amount ?? amountBefore };
    });
  }

  open(tokenId: bigint): Promise<TxReceipt> {
    return guard(async () => {
      const hash = await writeContract(config, {
        ...contract,
        functionName: "open",
        args: [tokenId],
        chainId: chain.id,
      });
      await this.confirm(hash);
      return { hash };
    });
  }

  // ---------- market (not yet run against the deployment) ----------

  async saleBurnBps(): Promise<number> {
    return Number(await readContract(config, { ...contract, functionName: "saleBurnBps" }));
  }

  /**
   * There is no on-chain listing index: CardListed logs for the match give the candidates, deduped, and
   * `listingOf` (the only source of truth) keeps the live ones.
   */
  async listings(matchId: number): Promise<Listing[]> {
    if (apiUrl) {
      type Row = {
        tokenId: string;
        matchId: string;
        playerId: number;
        serial: number;
        seller: Address;
        price: string;
      };
      const rows = await api<Row[]>(`/api/matches/${matchId}/listings`);
      return rows.map((row) => ({
        tokenId: big(row.tokenId),
        matchId: Number(row.matchId),
        playerId: row.playerId,
        serial: row.serial,
        seller: row.seller,
        price: big(row.price),
      }));
    }
    const logs = await publicClient.getContractEvents({
      address: contractAddress,
      abi: ballIsFlatAbi,
      eventName: "CardListed",
      args: { matchId: BigInt(matchId) },
      fromBlock: deployBlock,
      toBlock: "latest",
    });
    const ids = [
      ...new Set(logs.flatMap((log) => (log.args.tokenId === undefined ? [] : [log.args.tokenId]))),
    ];
    const rows = await Promise.all(
      ids.map(async (tokenId): Promise<Listing | null> => {
        const [seller, price] = await readContract(config, {
          ...contract,
          functionName: "listingOf",
          args: [tokenId],
        });
        if (price === 0n || /^0x0{40}$/i.test(seller)) return null;
        const info = await this.cardInfo(tokenId);
        return {
          tokenId,
          matchId: info.matchId,
          playerId: info.playerId,
          serial: info.serial,
          seller,
          price,
        };
      }),
    );
    return rows.filter((row): row is Listing => row !== null);
  }

  private send(
    functionName: "listForSale" | "cancelListing",
    args: readonly [bigint] | readonly [bigint, bigint],
  ) {
    return guard(async () => {
      const hash = await writeContract(config, {
        ...contract,
        functionName,
        args: args as never,
        chainId: chain.id,
      });
      await this.confirm(hash);
      return { hash };
    });
  }

  listForSale(tokenId: bigint, price: bigint): Promise<TxReceipt> {
    return this.send("listForSale", [tokenId, price]);
  }

  cancelListing(tokenId: bigint): Promise<TxReceipt> {
    return this.send("cancelListing", [tokenId]);
  }

  buy(tokenId: bigint, maxPrice: bigint, onStep: (step: MintStep) => void): Promise<TxReceipt> {
    return guard(async () => {
      const account = await this.account();
      if (!account) throw new GameError("NotConnected");
      if (account.allowance < maxPrice) {
        onStep("approve");
        const approveHash = await writeContract(config, {
          address: wifAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [contractAddress, maxPrice],
          chainId: chain.id,
        });
        await this.confirm(approveHash);
      }
      onStep("buy");
      const hash = await writeContract(config, {
        ...contract,
        functionName: "buy",
        args: [tokenId, maxPrice],
        chainId: chain.id,
      });
      await this.confirm(hash);
      return { hash };
    });
  }

  claim(tokenId: bigint): Promise<ClaimReceipt> {
    return this.burnCard(tokenId, "claim");
  }

  refund(tokenId: bigint): Promise<ClaimReceipt> {
    return this.burnCard(tokenId, "refund");
  }

  finalize(matchId: number): Promise<TxReceipt> {
    return guard(async () => {
      const hash = await writeContract(config, {
        ...contract,
        functionName: "finalize",
        args: [BigInt(matchId)],
        chainId: chain.id,
      });
      await this.confirm(hash);
      return { hash };
    });
  }

  propose(matchId: number, winners: number[], sourceUrl: string): Promise<TxReceipt> {
    return guard(async () => {
      const hash = await writeContract(config, {
        ...contract,
        functionName: "propose",
        args: [
          BigInt(matchId),
          winners,
          await Promise.all(winners.map((id) => this.proofFor(matchId, id))),
          sourceUrl,
        ],
        chainId: chain.id,
      });
      await this.confirm(hash);
      return { hash };
    });
  }

  voidMatch(matchId: number): Promise<TxReceipt> {
    return guard(async () => {
      const hash = await writeContract(config, {
        ...contract,
        functionName: "voidMatch",
        args: [BigInt(matchId)],
        chainId: chain.id,
      });
      await this.confirm(hash);
      return { hash };
    });
  }
}
