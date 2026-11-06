// TanStack Query hooks over the GameClient. Screens read only through these.
import { multipleIfWins, shareOfPicks } from "@app/core/payout";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect } from "react";
import {
  fixtureById,
  fixtureBySlug,
  type ListedFixture,
  listedFixtures,
  type Player,
  playerOf,
} from "./fixtures";
import { markOpened } from "./opened";
import {
  type Account,
  type GameClient,
  GameError,
  type MatchInfo,
  type MatchState,
  type OwnedCard,
} from "./types";

export const GameContext = createContext<GameClient | null>(null);

export function useGame(): GameClient {
  const client = useContext(GameContext);
  if (!client) throw new Error("useGame needs a GameContext provider");
  return client;
}

/** Refetches every read when the client reports a change (a mock write or a new block). */
export function useGameSync(client: GameClient): void {
  const queryClient = useQueryClient();
  useEffect(() => client.subscribe(() => void queryClient.invalidateQueries()), [client, queryClient]);
}

export interface MatchView {
  fixture: ListedFixture;
  info: MatchInfo;
  state: MatchState;
  winners: number[];
}

async function loadMatch(client: GameClient, fixture: ListedFixture): Promise<MatchView> {
  const [info, state, winners] = await Promise.all([
    client.matchInfo(fixture.id),
    client.stateOf(fixture.id),
    client.winnersOf(fixture.id),
  ]);
  return { fixture, info, state, winners };
}

export function useBoard() {
  const client = useGame();
  return useQuery({
    queryKey: ["board"],
    queryFn: async () => {
      await client.matchCount();
      return Promise.all(listedFixtures.map((fixture) => loadMatch(client, fixture)));
    },
  });
}

export interface PlayerLine {
  player: Player;
  cardsOn: number;
  /** Payout multiple for a new card on this player if he wins. */
  multiple: number;
  /** $WIF a new card would receive if he wins. */
  share: bigint;
  /** Fraction of all cards in the match on this player. */
  pickShare: number;
}

export interface MarketView extends MatchView {
  lines: PlayerLine[];
  burnBps: number;
}

async function loadMarket(client: GameClient, fixture: ListedFixture): Promise<MarketView> {
  const [view, burnBps, counts] = await Promise.all([
    loadMatch(client, fixture),
    client.burnBps(),
    Promise.all(fixture.players.map((player) => client.cardsOn(fixture.id, player.id))),
  ]);
  const lines = fixture.players.map((player, index): PlayerLine => {
    const cardsOn = counts[index] ?? 0;
    const { multiple, share } = multipleIfWins({
      pot: view.info.pot,
      price: view.info.price,
      cardsOnPlayer: cardsOn,
      burnBps,
    });
    return { player, cardsOn, multiple, share, pickShare: shareOfPicks(cardsOn, view.info.cards) };
  });
  return { ...view, lines, burnBps };
}

export function useMarket(slug: string) {
  const client = useGame();
  const fixture = fixtureBySlug(slug);
  return useQuery({
    queryKey: ["match", slug],
    enabled: Boolean(fixture),
    queryFn: async (): Promise<MarketView> => {
      if (!fixture) throw new Error(`No match called ${slug}`);
      return loadMarket(client, fixture);
    },
  });
}

/** Every listed match with its squad lines, sharing the Market's cache (the leaderboard's Fan MVP). */
export function useMarkets() {
  const client = useGame();
  return useQueries({
    queries: listedFixtures.map((fixture) => ({
      queryKey: ["match", fixture.slug],
      queryFn: () => loadMarket(client, fixture),
    })),
  });
}

/** Every card on the public record, for the leaderboard. */
export function useLedger() {
  const client = useGame();
  return useQuery({ queryKey: ["ledger"], queryFn: () => client.ledger() });
}

export function useAccount() {
  const client = useGame();
  return useQuery({ queryKey: ["account"], queryFn: (): Promise<Account | null> => client.account() });
}

export interface BinderCard extends OwnedCard {
  fixture: ListedFixture;
  player: Player | undefined;
  match: MatchView;
  claimable: bigint;
}

export function useMyCards(account: Account | null | undefined) {
  const client = useGame();
  return useQuery({
    queryKey: ["cards", account?.address ?? "none"],
    enabled: Boolean(account),
    queryFn: async (): Promise<BinderCard[]> => {
      if (!account) return [];
      const owned = await client.cardsOf(account.address);
      const matchIds = [...new Set(owned.map((card) => card.matchId))];
      const matches = new Map<number, MatchView>();
      await Promise.all(
        matchIds.map(async (matchId) => {
          const fixture = fixtureById(matchId);
          if (fixture) matches.set(matchId, await loadMatch(client, fixture));
        }),
      );
      const cards = await Promise.all(
        owned.map(async (card): Promise<BinderCard | null> => {
          const match = matches.get(card.matchId);
          if (!match) return null;
          const claimable = card.burned ? 0n : await client.claimable(card.tokenId);
          return {
            ...card,
            fixture: match.fixture,
            player: playerOf(match.fixture, card.playerId),
            match,
            claimable,
          };
        }),
      );
      return cards.filter((card): card is BinderCard => card !== null);
    },
  });
}

/**
 * Tears a pack: the card shows as opened at once (remembered in this browser), and `open` records it for
 * good (a transaction on chain, the mock's state in demo mode). A failed record can be retried.
 */
export function useOpenCard() {
  const client = useGame();
  const queryClient = useQueryClient();
  const record = useMutation({
    mutationFn: (tokenId: bigint) => client.open(tokenId),
    onSettled: () => queryClient.invalidateQueries(),
  });
  const failed =
    record.error && !(record.error instanceof GameError && record.error.code === "AlreadyOpened")
      ? record.error
      : null;
  return {
    open: (tokenId: bigint) => {
      markOpened(tokenId);
      record.mutate(tokenId);
    },
    retry: () => {
      if (record.variables !== undefined) record.mutate(record.variables);
    },
    error: failed,
    isPending: record.isPending,
  };
}

/** Live sealed-card listings for a match, cheapest first. */
export function useListings(matchId: number | undefined) {
  const client = useGame();
  return useQuery({
    queryKey: ["listings", matchId ?? 0],
    enabled: matchId !== undefined,
    queryFn: async () =>
      (await client.listings(matchId ?? 0)).sort((a, b) =>
        a.price < b.price ? -1 : a.price > b.price ? 1 : 0,
      ),
  });
}
