// The Ball is Flat API: fixtures and squads (off-chain, Postgres `app` schema) joined with indexed on-chain
// state (Ponder tables), squad proofs, binder, leaderboard, listings, NFT metadata, and the admin endpoints the
// ops panel uses. Writes to the contract always come from a wallet; this service never holds a key.

import { db } from "ponder:api";
import schema from "ponder:schema";
import { squadProof } from "@app/core/squad";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, desc, eq, graphql, inArray, replaceBigInts } from "ponder";
import type { Hex } from "viem";
import { getAddress, isAddress } from "viem";
import { type CardView, cardSvg, metadataJson } from "./metadata";
import {
  AdminError,
  type FixtureInput,
  type FixtureRow,
  fixtureByMatchId,
  getFixture,
  linkFixture,
  listFixtures,
  playerById,
  squadOf,
  teams,
  upsertFixture,
} from "./offchain";

const publicUrl = (process.env.PUBLIC_API_URL ?? "http://localhost:42069").replace(/\/$/, "");
const appUrl = (process.env.PUBLIC_APP_URL ?? "http://localhost:5310").replace(/\/$/, "");
const adminToken = process.env.ADMIN_TOKEN;
const allowedOrigins = (process.env.CORS_ORIGINS ?? appUrl).split(",").map((origin: string) => origin.trim());

const app = new Hono();

app.use("/api/*", cors({ origin: allowedOrigins, allowHeaders: ["authorization", "content-type"] }));
app.use("/graphql", graphql({ db, schema }));

/** JSON with bigints as decimal strings: amounts are 18-decimal $WIF and ids are uint256. */
function json(body: unknown, status: 200 | 201 = 200, cacheSeconds = 2) {
  return new Response(JSON.stringify(replaceBigInts(body, (value) => value.toString())), {
    status,
    headers: { "content-type": "application/json", "cache-control": `public, max-age=${cacheSeconds}` },
  });
}

function fail(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseBigint(text: string): bigint | null {
  return /^\d{1,78}$/.test(text) ? BigInt(text) : null;
}

async function matchRow(matchId: string | null) {
  if (!matchId) return null;
  const [row] = await db
    .select()
    .from(schema.match)
    .where(eq(schema.match.id, BigInt(matchId)));
  return row ?? null;
}

async function fixtureView(fixture: FixtureRow) {
  const onchain = await matchRow(fixture.matchId);
  return { ...fixture, onchain };
}

// ---------- public reads ----------

app.get("/api/fixtures", async () => {
  const fixtures = await listFixtures();
  const ids = fixtures.flatMap((f) => (f.matchId ? [BigInt(f.matchId)] : []));
  const rows = ids.length ? await db.select().from(schema.match).where(inArray(schema.match.id, ids)) : [];
  const byId = new Map(rows.map((row) => [row.id.toString(), row]));
  return json(fixtures.map((f) => ({ ...f, onchain: f.matchId ? (byId.get(f.matchId) ?? null) : null })));
});

app.get("/api/fixtures/:slug", async (c) => {
  const fixture = await getFixture(c.req.param("slug"));
  if (!fixture) return fail(404, "no such fixture");
  const [view, squad] = await Promise.all([fixtureView(fixture), squadOf(fixture.slug)]);
  const picks = fixture.matchId
    ? await db
        .select()
        .from(schema.pick)
        .where(eq(schema.pick.matchId, BigInt(fixture.matchId)))
    : [];
  const cardsOn = new Map(picks.map((p) => [p.playerId, p.cards]));
  // The squad that counts is the one on chain; off-chain rows only add names and numbers.
  const onchainIds = view.onchain ? new Set(view.onchain.playerIds) : null;
  return json({
    ...view,
    squad: squad
      .filter((p) => !onchainIds || onchainIds.has(p.playerId))
      .map((p) => ({ ...p, cards: cardsOn.get(p.playerId) ?? 0 })),
  });
});

app.get("/api/teams", async () => json(await teams(), 200, 60));

/**
 * Everything the board needs in one request: listed fixtures with team details and the squad as listed on
 * chain (names and numbers from the off-chain rows). The app loads this once at start.
 */
app.get("/api/board", async () => {
  const [fixtures, teamList] = await Promise.all([listFixtures(), teams()]);
  const listed = fixtures.filter((f) => f.matchId !== null);
  const rows = listed.length
    ? await db
        .select()
        .from(schema.match)
        .where(
          inArray(
            schema.match.id,
            listed.map((f) => BigInt(f.matchId as string)),
          ),
        )
    : [];
  const onchain = new Map(rows.map((row) => [row.id.toString(), row]));
  const teamBy = new Map(teamList.map((t) => [t.code, t]));
  const board = await Promise.all(
    listed.map(async (f) => {
      const row = onchain.get(f.matchId as string);
      const ids = new Set(row?.playerIds ?? []);
      const squad = (await squadOf(f.slug)).filter((p) => ids.has(p.playerId));
      return {
        ...f,
        home: teamBy.get(f.homeCode),
        away: teamBy.get(f.awayCode),
        squad,
      };
    }),
  );
  return json(board, 200, 15);
});

/** Proof for mint/propose, built from the squad as listed on chain. */
app.get("/api/matches/:id/proof/:playerId", async (c) => {
  const id = parseBigint(c.req.param("id"));
  const playerId = Number(c.req.param("playerId"));
  if (id === null || !Number.isInteger(playerId)) return fail(400, "bad match or player id");
  const [row] = await db.select().from(schema.match).where(eq(schema.match.id, id));
  if (!row) return fail(404, "match not indexed");
  const proof = squadProof(row.playerIds, playerId);
  if (!proof) return fail(404, "player not in this squad");
  return json({ matchId: id, playerId, root: row.playersRoot, proof }, 200, 30);
});

app.get("/api/wallets/:address/cards", async (c) => {
  const address = c.req.param("address");
  if (!isAddress(address)) return fail(400, "bad address");
  const owner = getAddress(address).toLowerCase() as Hex;
  const rows = await db
    .select({ card: schema.card, listing: schema.listing })
    .from(schema.card)
    .leftJoin(schema.listing, eq(schema.listing.tokenId, schema.card.tokenId))
    .where(eq(schema.card.owner, owner))
    .orderBy(desc(schema.card.tokenId));
  return json(
    rows.map(({ card, listing }) => ({
      ...card,
      // a stored listing only counts while this wallet still sells the sealed card
      listingPrice: listing && listing.seller === card.owner && !card.opened ? listing.price : null,
    })),
  );
});

/** Every card ever minted, credited to its minter: the leaderboard's public record. */
app.get("/api/ledger", async () => {
  const rows = await db
    .select({
      tokenId: schema.card.tokenId,
      matchId: schema.card.matchId,
      playerId: schema.card.playerId,
      minter: schema.card.minter,
      state: schema.card.state,
      payout: schema.card.payout,
    })
    .from(schema.card)
    .orderBy(schema.card.tokenId);
  return json(rows, 200, 5);
});

app.get("/api/wallets/:address", async (c) => {
  const address = c.req.param("address");
  if (!isAddress(address)) return fail(400, "bad address");
  const [row] = await db
    .select()
    .from(schema.wallet)
    .where(eq(schema.wallet.address, getAddress(address).toLowerCase() as Hex));
  return json(row ?? { address, minted: 0, wins: 0, claimed: 0n, spent: 0n });
});

app.get("/api/leaderboard", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
  const rows = await db
    .select()
    .from(schema.wallet)
    .orderBy(desc(schema.wallet.claimed), desc(schema.wallet.wins), desc(schema.wallet.minted))
    .limit(limit);
  return json(rows, 200, 10);
});

app.get("/api/matches/:id/listings", async (c) => {
  const id = parseBigint(c.req.param("id"));
  if (id === null) return fail(400, "bad match id");
  const rows = await db
    .select({ listing: schema.listing, card: schema.card })
    .from(schema.listing)
    .innerJoin(schema.card, eq(schema.card.tokenId, schema.listing.tokenId))
    // a listing only counts while the seller still owns the sealed card
    .where(
      and(
        eq(schema.listing.matchId, id),
        eq(schema.card.owner, schema.listing.seller),
        eq(schema.card.opened, false),
      ),
    )
    .orderBy(schema.listing.price);
  return json(
    rows.map(({ listing, card }) => ({ ...listing, playerId: card.playerId, serial: card.serial })),
  );
});

app.get("/api/matches/:id/cards", async (c) => {
  const id = parseBigint(c.req.param("id"));
  if (id === null) return fail(400, "bad match id");
  const rows = await db.select().from(schema.card).where(eq(schema.card.matchId, id));
  return json(rows, 200, 5);
});

// ---------- NFT metadata ----------

async function cardView(tokenId: bigint): Promise<CardView | null> {
  const [card] = await db.select().from(schema.card).where(eq(schema.card.tokenId, tokenId));
  if (!card) return null;
  const [match] = await db.select().from(schema.match).where(eq(schema.match.id, card.matchId));
  const fixture = await fixtureByMatchId(card.matchId);
  const person = await playerById(card.playerId);
  if (!match || !fixture || !person) return null;
  const squad = await squadOf(fixture.slug);
  const entry = squad.find((p) => p.playerId === card.playerId);
  const teamList = await teams();
  const team = teamList.find((t) => t.code === person.teamCode);
  const home = teamList.find((t) => t.code === fixture.homeCode)?.name ?? fixture.homeCode;
  const away = teamList.find((t) => t.code === fixture.awayCode)?.name ?? fixture.awayCode;
  return {
    tokenId,
    serial: card.serial,
    cardsInMatch: match.cards,
    opened: card.opened,
    state: card.state as CardView["state"],
    matchStatus: match.status,
    won: match.status === "Finalized" ? match.winners.includes(card.playerId) : null,
    playerName: person.name,
    playerPosition: person.position,
    playerNumber: entry?.number ?? 0,
    teamCode: person.teamCode,
    teamColour: team?.colour ?? "#ff4fa3",
    home,
    away,
    competition: fixture.competition,
    matchday: fixture.matchday,
    kickoff: fixture.kickoff,
    slug: fixture.slug,
  };
}

app.get("/cards/:id/image.svg", async (c) => {
  const id = parseBigint(c.req.param("id"));
  const view = id === null ? null : await cardView(id);
  if (!view) return fail(404, "no such card");
  return new Response(cardSvg(view), {
    headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=60" },
  });
});

app.get("/cards/:id", async (c) => {
  const id = parseBigint(c.req.param("id"));
  const view = id === null ? null : await cardView(id);
  if (!view) return fail(404, "no such card");
  return json(metadataJson(view, publicUrl, appUrl), 200, 60);
});

app.get("/collection", () =>
  json(
    {
      name: "Ball is Flat",
      description:
        "Man-of-the-match pick cards paid in $WIF on Robinhood Chain. One card per wallet per match; burn a winning card to take its share of the pot.",
      image: `${appUrl}/favicon.svg`,
      external_link: appUrl,
    },
    200,
    3600,
  ),
);

// ---------- admin ----------

function requireAdmin(header: string | undefined) {
  if (!adminToken) throw new AdminError(401, "admin is disabled: set ADMIN_TOKEN");
  if (header !== `Bearer ${adminToken}`) throw new AdminError(401, "bad admin token");
}

app.onError((error) => {
  if (error instanceof AdminError) return fail(error.status, error.message);
  console.error(error);
  return fail(500, "internal error");
});

app.get("/api/admin/check", (c) => {
  requireAdmin(c.req.header("authorization"));
  return json({ ok: true });
});

app.put("/api/admin/fixtures/:slug", async (c) => {
  requireAdmin(c.req.header("authorization"));
  const body = (await c.req.json()) as FixtureInput;
  if (body.slug !== c.req.param("slug")) throw new AdminError(400, "slug in path and body differ");
  if (!/^[a-z0-9-]{3,80}$/.test(body.slug))
    throw new AdminError(400, "slug: lowercase letters, digits, dashes");
  if (Number.isNaN(Date.parse(body.kickoff))) throw new AdminError(400, "kickoff must be ISO 8601");
  if (!Array.isArray(body.players) || body.players.length < 2) throw new AdminError(400, "squad is empty");
  return json(await upsertFixture(body), 201);
});

/** The exact arguments for listMatches: the admin panel sends them from the owner's wallet. */
app.get("/api/admin/fixtures/:slug/listing", async (c) => {
  requireAdmin(c.req.header("authorization"));
  const fixture = await getFixture(c.req.param("slug"));
  if (!fixture) throw new AdminError(404, "no such fixture");
  const squad = await squadOf(fixture.slug);
  return json({
    slug: fixture.slug,
    kickoff: Math.floor(fixture.kickoff.getTime() / 1000),
    playerIds: [...new Set(squad.map((p) => p.playerId))].sort((a, b) => a - b),
  });
});

/** Links a fixture to the match the owner just listed, once the indexer has it and the squads agree. */
app.post("/api/admin/fixtures/:slug/link", async (c) => {
  requireAdmin(c.req.header("authorization"));
  const fixture = await getFixture(c.req.param("slug"));
  if (!fixture) throw new AdminError(404, "no such fixture");
  const { matchId } = (await c.req.json()) as { matchId: string };
  const id = parseBigint(String(matchId));
  if (id === null) throw new AdminError(400, "bad match id");
  const [row] = await db.select().from(schema.match).where(eq(schema.match.id, id));
  if (!row) throw new AdminError(404, "match not indexed yet, retry in a few seconds");
  const squad = [...new Set((await squadOf(fixture.slug)).map((p) => p.playerId))].sort((a, b) => a - b);
  const listed = [...row.playerIds].sort((a, b) => a - b);
  if (squad.join(",") !== listed.join(","))
    throw new AdminError(409, "on-chain squad differs from this fixture");
  if (Number(row.kickoff) !== Math.floor(fixture.kickoff.getTime() / 1000) && !fixture.warmUp) {
    throw new AdminError(409, "on-chain kickoff differs from this fixture");
  }
  await linkFixture(fixture.slug, id);
  return json({ slug: fixture.slug, matchId: id });
});

export default app;
