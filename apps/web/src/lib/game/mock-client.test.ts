import { fixtures } from "@app/config/fixtures";
import { claimShare } from "@app/core/payout";
import { describe, expect, it } from "vitest";
import { binderGroupOf } from "./binder";
import { type KeyValueStore, MockGameClient } from "./mock-client";
import { fixtureMatchIds } from "./mock-seed";
import { GameError } from "./types";

const WIF = 10n ** 18n;
const PRICE = 1_000n * WIF;
const DEMO = "0xba11f1a70000000000000000000000000000fa11" as const;
// 6 Nov 2026 12:00 UTC: MD5 and MD6 are ahead, the warm-up is behind.
const START = Math.floor(Date.parse("2026-11-06T12:00:00Z") / 1000);

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function makeClient(storage: KeyValueStore = memoryStore()) {
  return new MockGameClient({
    fixtures,
    price: PRICE,
    burnBps: 1000,
    disputeWindow: 7200,
    maxPerPlayer: 10,
    saleBurnBps: 500,
    demoWallet: DEMO,
    startingWif: PRICE * 5n,
    storage,
    latencyMs: 0,
    clock: () => START,
  });
}

const ids = fixtureMatchIds(fixtures);
const idOf = (slug: string) => ids.get(slug) ?? 0;
const open = idOf("england-v-croatia");
const warmUp = idOf("croatia-v-england");

describe("mock game client: seed", () => {
  it("opens MD5 and MD6 with picks and settles the warm-up", async () => {
    const client = makeClient();
    for (const fixture of fixtures.filter((f) => !f.warmUp)) {
      expect(await client.stateOf(idOf(fixture.slug))).toBe("Open");
      expect((await client.matchInfo(idOf(fixture.slug))).cards).toBeGreaterThan(10);
    }
    expect(await client.stateOf(warmUp)).toBe("Final");
  });

  it("varies picks across players and keeps pot = price x cards", async () => {
    const client = makeClient();
    const players = await client.playersOf(open);
    const counts = await Promise.all(players.map((id) => client.cardsOn(open, id)));
    expect(new Set(counts).size).toBeGreaterThan(3);
    const info = await client.matchInfo(open);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(info.cards);
    expect(info.pot).toBe(PRICE * BigInt(info.cards));
  });

  it("gives the demo wallet a claimable winning card in the warm-up", async () => {
    const client = makeClient();
    await client.connect();
    const cards = await client.cardsOf(DEMO);
    const win = cards.find((card) => card.matchId === warmUp);
    expect(win).toBeDefined();
    const info = await client.matchInfo(warmUp);
    expect(await client.claimable(win?.tokenId ?? 0n)).toBe(claimShare(info.payPool, info.winningCards));
    expect(info.burned + info.payPool).toBe(info.pot);
  });
});

describe("mock game client: lifecycle", () => {
  it("approves then mints one card, and blocks a second", async () => {
    const client = makeClient();
    await client.connect();
    const before = await client.matchInfo(open);
    const steps: string[] = [];
    const receipt = await client.mint(open, 9, (step) => steps.push(step));
    expect(steps).toEqual(["approve", "mint"]);
    const info = await client.cardInfo(receipt.tokenId);
    expect(info).toEqual({ matchId: open, playerId: 9, serial: before.cards + 1 });
    const after = await client.matchInfo(open);
    expect(after.pot - before.pot).toBe(PRICE);
    expect((await client.account())?.wif).toBe(PRICE * 4n);
    expect(await client.cardOf(open, DEMO)).toBe(receipt.tokenId);
    await expect(client.mint(open, 10, () => undefined)).rejects.toMatchObject({ code: "AlreadyHasCard" });
  });

  it("refuses to mint without a wallet, for an unknown player, or with too little $WIF", async () => {
    const client = makeClient();
    await expect(client.mint(open, 9, () => undefined)).rejects.toBeInstanceOf(GameError);
    await client.connect();
    await expect(client.mint(open, 9999, () => undefined)).rejects.toMatchObject({ code: "UnknownPlayer" });
    for (const fixture of fixtures.filter((f) => !f.warmUp).slice(0, 5)) {
      await client.mint(idOf(fixture.slug), fixture.players[0]?.id ?? 0, () => undefined);
    }
    const last = fixtures.filter((f) => !f.warmUp)[5];
    await expect(
      client.mint(idOf(last?.slug ?? ""), last?.players[0]?.id ?? 0, () => undefined),
    ).rejects.toMatchObject({
      code: "InsufficientBalance",
    });
  });

  it("locks at kickoff, settles, finalizes after the window and pays the winner on claim", async () => {
    const client = makeClient();
    await client.connect();
    const { tokenId } = await client.mint(open, 9, () => undefined);
    const kickoff = (await client.matchInfo(open)).kickoff;
    client.advance(kickoff - START + 1);
    expect(await client.stateOf(open)).toBe("Locked");
    await expect(client.mint(open, 10, () => undefined)).rejects.toMatchObject({ code: "MintClosed" });

    await client.propose(open, [9], "https://example.com/ratings");
    expect(await client.stateOf(open)).toBe("Proposed");
    await expect(client.finalize(open)).rejects.toMatchObject({ code: "TooEarly" });
    client.advance(7200);
    await client.finalize(open);
    expect(await client.stateOf(open)).toBe("Final");

    const info = await client.matchInfo(open);
    const share = claimShare(info.payPool, info.winningCards);
    const before = (await client.account())?.wif ?? 0n;
    const receipt = await client.claim(tokenId);
    expect(receipt.amount).toBe(share);
    expect((await client.account())?.wif).toBe(before + share);
    await expect(client.claim(tokenId)).rejects.toMatchObject({ code: "NotCardOwner" });
    // cardOf stays tied to the minter after the burn, like the contract.
    expect(await client.cardOf(open, DEMO)).toBe(tokenId);
    const card = (await client.cardsOf(DEMO)).find((item) => item.tokenId === tokenId);
    expect(card?.burned?.kind).toBe("claimed");
  });

  it("rolls an uncalled pot into the next match", async () => {
    const client = makeClient();
    await client.connect();
    const info = await client.matchInfo(open);
    client.advance(info.kickoff - START + 1);
    const unpicked: number[] = [];
    for (const id of await client.playersOf(open))
      if ((await client.cardsOn(open, id)) === 0) unpicked.push(id);
    expect(unpicked.length).toBeGreaterThan(0);
    await client.propose(open, [unpicked[0] ?? 0], "https://example.com/ratings");
    client.advance(7200);
    const nextBefore = await client.matchInfo(info.nextMatch);
    await client.finalize(open);
    expect(await client.stateOf(open)).toBe("RolledOver");
    const settled = await client.matchInfo(open);
    const nextAfter = await client.matchInfo(info.nextMatch);
    expect(nextAfter.rolledIn - nextBefore.rolledIn).toBe(settled.payPool);
  });

  it("voids a match and refunds the card price", async () => {
    const client = makeClient();
    await client.connect();
    const { tokenId } = await client.mint(open, 9, () => undefined);
    await client.voidMatch(open);
    expect(await client.stateOf(open)).toBe("Void");
    const balance = (await client.account())?.wif ?? 0n;
    const receipt = await client.refund(tokenId);
    expect(receipt.amount).toBe(PRICE);
    expect((await client.account())?.wif).toBe(balance + PRICE);
  });

  it("persists across reloads through storage", async () => {
    const storage = memoryStore();
    const first = makeClient(storage);
    await first.connect();
    const { tokenId } = await first.mint(open, 9, () => undefined);
    const second = makeClient(storage);
    expect((await second.cardInfo(tokenId)).playerId).toBe(9);
    expect(await second.account()).not.toBeNull();
  });
});

describe("mock game client: cap, open and ledger", () => {
  it("keeps every seeded player at or under the cap and reverts a mint past it", async () => {
    const client = makeClient();
    await client.connect();
    const players = await client.playersOf(open);
    const counts = await Promise.all(players.map((id) => client.cardsOn(open, id)));
    expect(Math.max(...counts)).toBeLessThanOrEqual(10);
    const state = JSON.parse(JSON.stringify((client as unknown as { state: unknown }).state)) as {
      matches: { id: number; seedPicks: Record<string, number> }[];
    };
    const target = players[0] ?? 0;
    // Fill one player to the cap through the stored state, then mint on him.
    const storage = memoryStore();
    const match = state.matches.find((m) => m.id === open);
    if (match) match.seedPicks[target] = 10;
    storage.setItem("ball-is-flat.mock.v1", JSON.stringify(state));
    const capped = makeClient(storage);
    await capped.connect();
    await expect(capped.mint(open, target, () => undefined)).rejects.toMatchObject({ code: "PlayerSoldOut" });
    expect((await capped.matchInfo(open)).maxPerPlayer).toBe(10);
  });

  it("opens a pack once and records it on the card", async () => {
    const client = makeClient();
    await client.connect();
    const { tokenId } = await client.mint(open, 9, () => undefined);
    const sealed = (await client.cardsOf(DEMO)).find((card) => card.tokenId === tokenId);
    expect(sealed?.opened).toBe(false);
    await client.open(tokenId);
    const opened = (await client.cardsOf(DEMO)).find((card) => card.tokenId === tokenId);
    expect(opened?.opened).toBe(true);
    await expect(client.open(tokenId)).rejects.toMatchObject({ code: "AlreadyOpened" });
  });

  it("lists the demo crowd and the demo wallet in the ledger, one card per wallet per match", async () => {
    const client = makeClient();
    const ledger = await client.ledger();
    expect(ledger.some((card) => card.owner === DEMO)).toBe(true);
    const keys = ledger.map((card) => `${card.owner}:${card.matchId}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const matchId of new Set(ledger.map((card) => card.matchId))) {
      const players = await client.playersOf(matchId);
      for (const playerId of players) {
        const crowd = ledger.filter((c) => c.matchId === matchId && c.playerId === playerId).length;
        expect(crowd).toBeLessThanOrEqual(await client.cardsOn(matchId, playerId));
      }
    }
  });
});

describe("mock game client: sealed-card market", () => {
  it("seeds a few crowd listings on open matches and keeps the pick counts", async () => {
    const client = makeClient();
    const all = (
      await Promise.all(
        [open, idOf("northern-ireland-v-ukraine"), idOf("spain-v-england")].map((id) => client.listings(id)),
      )
    ).flat();
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(all.every((listing) => listing.seller.startsWith("0xdeed"))).toBe(true);
    const info = await client.matchInfo(open);
    const counts = await Promise.all((await client.playersOf(open)).map((id) => client.cardsOn(open, id)));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(info.cards);
  });

  it("buys a listing: price checks, 5% burn, the card moves sealed, cardOf stays with the minter", async () => {
    const client = makeClient();
    await client.connect();
    const [listing] = (await client.listings(open)).sort((a, b) => (a.price < b.price ? -1 : 1));
    if (!listing) throw new Error("no seeded listing");
    await expect(client.buy(listing.tokenId, listing.price - 1n, () => undefined)).rejects.toMatchObject({
      code: "PriceAboveMax",
    });
    const before = (await client.account())?.wif ?? 0n;
    const steps: string[] = [];
    await client.buy(listing.tokenId, listing.price, (step) => steps.push(step));
    expect(steps).toEqual(["approve", "buy"]);
    expect((await client.account())?.wif).toBe(before - listing.price);
    const bought = (await client.cardsOf(DEMO)).find((card) => card.tokenId === listing.tokenId);
    expect(bought).toMatchObject({ opened: false, listing: null });
    expect(await client.cardOf(open, DEMO)).toBe(0n);
    expect((await client.listings(open)).some((l) => l.tokenId === listing.tokenId)).toBe(false);
    await expect(client.buy(listing.tokenId, listing.price, () => undefined)).rejects.toMatchObject({
      code: "NotForSale",
    });
  });

  it("lists, re-prices and cancels a sealed card; opening clears the listing; kickoff closes trading", async () => {
    const client = makeClient();
    await client.connect();
    const { tokenId } = await client.mint(open, 9, () => undefined);
    await expect(client.listForSale(tokenId, 0n)).rejects.toMatchObject({ code: "ZeroPrice" });
    await client.listForSale(tokenId, PRICE * 2n);
    await client.listForSale(tokenId, PRICE * 3n);
    let mine = (await client.listings(open)).find((l) => l.tokenId === tokenId);
    expect(mine?.price).toBe(PRICE * 3n);
    await expect(client.buy(tokenId, PRICE * 3n, () => undefined)).rejects.toMatchObject({
      code: "CannotBuyOwnCard",
    });
    await client.cancelListing(tokenId);
    await expect(client.cancelListing(tokenId)).rejects.toMatchObject({ code: "NotForSale" });
    await client.listForSale(tokenId, PRICE);
    await client.open(tokenId);
    mine = (await client.listings(open)).find((l) => l.tokenId === tokenId);
    expect(mine).toBeUndefined();
    await expect(client.listForSale(tokenId, PRICE)).rejects.toMatchObject({ code: "AlreadyOpened" });
    const [other] = await client.listings(open);
    client.advance(30 * 86_400);
    expect(await client.listings(open)).toEqual([]);
    if (other) {
      await expect(client.buy(other.tokenId, other.price, () => undefined)).rejects.toMatchObject({
        code: "TradingClosed",
      });
    }
  });
});

describe("binder groups", () => {
  const base = { burned: null, playerId: 9, claimable: 0n };
  const match = (state: "Open" | "Final" | "RolledOver" | "Void" | "Proposed", winners: number[] = []) =>
    ({ state, winners }) as never;

  it("sorts cards onto the five shelves", () => {
    expect(binderGroupOf({ ...base, match: match("Open") })).toBe("Waiting");
    expect(binderGroupOf({ ...base, match: match("Open") }, false)).toBe("Sealed");
    expect(binderGroupOf({ ...base, claimable: 5n, match: match("Final", [9]) }, false)).toBe("Claim");
    expect(binderGroupOf({ ...base, match: match("Proposed", [9]) })).toBe("Waiting");
    expect(binderGroupOf({ ...base, claimable: 5n, match: match("Final", [9]) })).toBe("Claim");
    expect(binderGroupOf({ ...base, match: match("Final", [7]) })).toBe("Missed");
    expect(binderGroupOf({ ...base, match: match("RolledOver", [7]) })).toBe("Missed");
    expect(binderGroupOf({ ...base, match: match("Void") })).toBe("Refund");
    expect(
      binderGroupOf({
        ...base,
        burned: { kind: "claimed", amount: 1n, hash: "0x1" },
        match: match("Final", [9]),
      }),
    ).toBe("Claimed");
  });
});
