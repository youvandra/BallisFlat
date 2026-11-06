// Off-chain data the contract does not hold: teams, people, fixtures and their squads, and the link from a
// fixture to its on-chain match id. Lives in its own Postgres schema (`app`), next to the tables Ponder
// manages, so `ponder db prune` and redeploys never touch it. Player ids are global (player-ids.json for the
// seeded players; new people continue the sequence) and are what the contract stores.
import { networks } from "@app/config/deployments";
import { fixtures as seedFixtures } from "@app/config/fixtures";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for the API (off-chain tables live in Postgres)");

export const sql = postgres(url, { max: 5, idle_timeout: 30, transform: { undefined: null } });

export type Position = "GK" | "DF" | "MF" | "FW";

export type FixtureRow = {
  slug: string;
  competition: string;
  matchday: number;
  kickoff: Date;
  homeCode: string;
  awayCode: string;
  warmUp: boolean;
  squadSourceUrl: string;
  squadReadOn: string;
  matchId: string | null;
};

export type SquadRow = {
  playerId: number;
  name: string;
  teamCode: string;
  number: number;
  position: Position;
  side: "home" | "away";
};

let ready: Promise<void> | null = null;

/** Creates the schema once per process and seeds it from packages/config on an empty database. */
export function ensureOffchain(): Promise<void> {
  ready ??= (async () => {
    await sql`create schema if not exists app`;
    await sql`create table if not exists app.team (
      code text primary key,
      name text not null,
      colour text not null
    )`;
    await sql`create table if not exists app.player (
      id integer primary key,
      team_code text not null references app.team(code),
      name text not null,
      position text not null check (position in ('GK','DF','MF','FW')),
      unique (team_code, name)
    )`;
    await sql`create table if not exists app.fixture (
      slug text primary key,
      competition text not null,
      matchday integer not null,
      kickoff timestamptz not null,
      home_code text not null references app.team(code),
      away_code text not null references app.team(code),
      warm_up boolean not null default false,
      squad_source_url text not null default '',
      squad_read_on text not null default '',
      match_id numeric(78,0) unique,
      created_at timestamptz not null default now()
    )`;
    await sql`create table if not exists app.fixture_player (
      fixture_slug text not null references app.fixture(slug) on delete cascade,
      player_id integer not null references app.player(id),
      number integer not null,
      side text not null check (side in ('home','away')),
      position text not null check (position in ('GK','DF','MF','FW')),
      primary key (fixture_slug, player_id)
    )`;
    await sql`create index if not exists fixture_kickoff_idx on app.fixture (kickoff)`;
    const [row] = await sql<{ count: string }[]>`select count(*)::text as count from app.fixture`;
    if (row?.count === "0") await seed();
  })();
  return ready;
}

async function seed() {
  const network = process.env.NETWORK === "local" ? "local" : "mainnet";
  const links = networks[network].matches;
  await sql.begin(async (tx) => {
    for (const f of seedFixtures) {
      for (const team of [f.home, f.away]) {
        await tx`insert into app.team ${tx({ code: team.code, name: team.name, colour: team.colour })}
          on conflict (code) do nothing`;
      }
      for (const p of f.players) {
        const team = p.side === "home" ? f.home : f.away;
        await tx`insert into app.player ${tx({ id: p.id, team_code: team.code, name: p.name, position: p.position })}
          on conflict (id) do nothing`;
      }
      await tx`insert into app.fixture ${tx({
        slug: f.slug,
        competition: f.competition,
        matchday: f.matchday,
        kickoff: new Date(f.kickoff),
        home_code: f.home.code,
        away_code: f.away.code,
        warm_up: f.warmUp === true,
        squad_source_url: f.squadSource.url,
        squad_read_on: f.squadSource.readOn,
        match_id: links[f.slug] ?? null,
      })} on conflict (slug) do nothing`;
      for (const p of f.players) {
        await tx`insert into app.fixture_player ${tx({
          fixture_slug: f.slug,
          player_id: p.id,
          number: p.number,
          side: p.side,
          position: p.position,
        })} on conflict do nothing`;
      }
    }
  });
}

export async function listFixtures(): Promise<FixtureRow[]> {
  await ensureOffchain();
  return sql<FixtureRow[]>`
    select slug, competition, matchday, kickoff, home_code as "homeCode", away_code as "awayCode",
      warm_up as "warmUp", squad_source_url as "squadSourceUrl", squad_read_on as "squadReadOn",
      match_id::text as "matchId"
    from app.fixture order by kickoff desc`;
}

export async function getFixture(slug: string): Promise<FixtureRow | undefined> {
  await ensureOffchain();
  const [row] = await sql<FixtureRow[]>`
    select slug, competition, matchday, kickoff, home_code as "homeCode", away_code as "awayCode",
      warm_up as "warmUp", squad_source_url as "squadSourceUrl", squad_read_on as "squadReadOn",
      match_id::text as "matchId"
    from app.fixture where slug = ${slug}`;
  return row;
}

export async function fixtureByMatchId(matchId: bigint): Promise<FixtureRow | undefined> {
  await ensureOffchain();
  const [row] = await sql<FixtureRow[]>`
    select slug, competition, matchday, kickoff, home_code as "homeCode", away_code as "awayCode",
      warm_up as "warmUp", squad_source_url as "squadSourceUrl", squad_read_on as "squadReadOn",
      match_id::text as "matchId"
    from app.fixture where match_id = ${matchId.toString()}`;
  return row;
}

export async function squadOf(slug: string): Promise<SquadRow[]> {
  await ensureOffchain();
  return sql<SquadRow[]>`
    select fp.player_id as "playerId", p.name, p.team_code as "teamCode", fp.number, fp.position, fp.side
    from app.fixture_player fp join app.player p on p.id = fp.player_id
    where fp.fixture_slug = ${slug}
    order by fp.side, fp.number`;
}

export async function teams(): Promise<{ code: string; name: string; colour: string }[]> {
  await ensureOffchain();
  return sql`select code, name, colour from app.team order by code`;
}

export async function playerById(id: number) {
  await ensureOffchain();
  const [row] = await sql<{ id: number; name: string; teamCode: string; position: Position }[]>`
    select id, name, team_code as "teamCode", position from app.player where id = ${id}`;
  return row;
}

// ---------- admin writes ----------

export type FixtureInput = {
  slug: string;
  competition: string;
  matchday: number;
  kickoff: string;
  home: { code: string; name: string; colour: string };
  away: { code: string; name: string; colour: string };
  squadSourceUrl: string;
  squadReadOn: string;
  warmUp?: boolean;
  players: { name: string; number: number; position: Position; side: "home" | "away" }[];
};

/**
 * Creates or replaces a fixture and its squad. People are matched by team and name, so a player keeps one
 * id across every match; a new person gets the next id. Refuses to change a fixture already listed on chain
 * (use the contract's setPlayers flow for a squad change before kickoff).
 */
export async function upsertFixture(input: FixtureInput): Promise<{ slug: string; created: number }> {
  await ensureOffchain();
  let created = 0;
  await sql.begin(async (tx) => {
    const [existing] = await tx<{ match_id: string | null }[]>`
      select match_id::text from app.fixture where slug = ${input.slug} for update`;
    if (existing?.match_id) throw new AdminError(409, "fixture is already listed on chain");
    for (const team of [input.home, input.away]) {
      await tx`insert into app.team ${tx(team)}
        on conflict (code) do update set name = excluded.name, colour = excluded.colour`;
    }
    await tx`insert into app.fixture ${tx({
      slug: input.slug,
      competition: input.competition,
      matchday: input.matchday,
      kickoff: new Date(input.kickoff),
      home_code: input.home.code,
      away_code: input.away.code,
      warm_up: input.warmUp === true,
      squad_source_url: input.squadSourceUrl,
      squad_read_on: input.squadReadOn,
    })} on conflict (slug) do update set competition = excluded.competition, matchday = excluded.matchday,
      kickoff = excluded.kickoff, home_code = excluded.home_code, away_code = excluded.away_code,
      warm_up = excluded.warm_up, squad_source_url = excluded.squad_source_url, squad_read_on = excluded.squad_read_on`;
    await tx`delete from app.fixture_player where fixture_slug = ${input.slug}`;
    for (const p of input.players) {
      const teamCode = p.side === "home" ? input.home.code : input.away.code;
      const [found] = await tx<{ id: number }[]>`
        select id from app.player where team_code = ${teamCode} and name = ${p.name}`;
      let person = found;
      if (!person) {
        [person] = await tx<{ id: number }[]>`
          insert into app.player (id, team_code, name, position)
          values ((select coalesce(max(id), 0) + 1 from app.player), ${teamCode}, ${p.name}, ${p.position})
          returning id`;
        created++;
      }
      if (!person) throw new AdminError(409, `could not create ${p.name}`);
      await tx`insert into app.fixture_player ${tx({
        fixture_slug: input.slug,
        player_id: person.id,
        number: p.number,
        side: p.side,
        position: p.position,
      })}`;
    }
  });
  return { slug: input.slug, created };
}

export async function linkFixture(slug: string, matchId: bigint) {
  await ensureOffchain();
  await sql`update app.fixture set match_id = ${matchId.toString()} where slug = ${slug}`;
}

export class AdminError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}
