// Fixtures and squads, keyed the way the app looks them up. Chain mode with an API loads the board from
// it once at start (loadFixtures, awaited in main.tsx); otherwise the bundled packages/config list is used.
import { fixtures as bundled } from "@app/config/fixtures";
import type { Fixture, Player, Team } from "@app/config/fixtures.types";
import { type ApiFixture, type ApiPlayer, type ApiTeam, api, apiUrl } from "../api";
import { env } from "../env";
import { deployment } from "./facts";
import { fixtureMatchIds } from "./mock-seed";

export type { Fixture, Player, Team };

export interface ListedFixture extends Fixture {
  id: number;
}

function fromBundle(): ListedFixture[] {
  // On chain a fixture is on the board once it is listed; the mock lists them all.
  const ids =
    env.VITE_DATA_MODE === "mock" ? fixtureMatchIds(bundled) : new Map(Object.entries(deployment.matches));
  return bundled
    .filter((fixture) => ids.has(fixture.slug))
    .map((fixture) => ({ ...fixture, id: ids.get(fixture.slug) ?? 0 }));
}

type BoardRow = ApiFixture & { home?: ApiTeam; away?: ApiTeam; squad: Omit<ApiPlayer, "cards">[] };

function fromApi(row: BoardRow): ListedFixture {
  // The API always sends teams; an unknown one borrows a bundled team's kit colour (data, not a design token).
  const bundledTeams = bundled.flatMap((f) => [f.home, f.away]);
  const team = (code: string, found?: ApiTeam): Team =>
    found ?? bundledTeams.find((t) => t.code === code) ?? { ...(bundledTeams[0] as Team), code, name: code };
  return {
    id: Number(row.matchId),
    slug: row.slug,
    matchday: row.matchday,
    competition: row.competition,
    home: team(row.homeCode, row.home),
    away: team(row.awayCode, row.away),
    kickoff: new Date(row.kickoff).toISOString().replace(".000Z", "Z"),
    players: row.squad.map((p) => ({
      id: p.playerId,
      name: p.name,
      number: p.number,
      position: p.position,
      side: p.side,
    })),
    squadSource: { url: row.squadSourceUrl, readOn: row.squadReadOn },
    ...(row.warmUp ? { warmUp: true } : {}),
  };
}

const byKickoff = (a: Fixture, b: Fixture) => Date.parse(a.kickoff) - Date.parse(b.kickoff);

/** The board. Live binding: loadFixtures replaces it before the app renders. */
export let listedFixtures: ListedFixture[] = fromBundle().sort(byKickoff);

/** Loads the board from the API. Keeps the bundled list if the API is not configured or unreachable. */
export async function loadFixtures(): Promise<"api" | "bundled"> {
  if (!apiUrl) return "bundled";
  try {
    const rows = await api<BoardRow[]>("/api/board");
    listedFixtures = rows.map(fromApi).sort(byKickoff);
    return "api";
  } catch (error) {
    console.warn("board from API failed, using the bundled fixtures", error);
    return "bundled";
  }
}

export function fixtureBySlug(slug: string): ListedFixture | undefined {
  return listedFixtures.find((fixture) => fixture.slug === slug);
}

export function fixtureById(matchId: number): ListedFixture | undefined {
  return listedFixtures.find((fixture) => fixture.id === matchId);
}

export function playerOf(fixture: Fixture, playerId: number): Player | undefined {
  return fixture.players.find((player) => player.id === playerId);
}

export function matchName(fixture: Fixture): string {
  return `${fixture.home.name} v ${fixture.away.name}`;
}

export function matchdayLabel(fixture: Fixture): string {
  return fixture.warmUp || fixture.matchday === 0 ? "Warm-up" : `Matchday ${fixture.matchday}`;
}

/** The competition as a general category: "UEFA Nations League 2026-27" reads "UEFA Nations League". */
export function competitionOf(fixture: Fixture): string {
  return fixture.competition.replace(/\s+\d{4}(-\d{2,4})?$/, "").trim();
}

/** Every competition on the board, with how many matches each has, in board order. */
export function competitionsOn(list: readonly Fixture[]): { name: string; matches: number }[] {
  const counts = new Map<string, number>();
  for (const fixture of list)
    counts.set(competitionOf(fixture), (counts.get(competitionOf(fixture)) ?? 0) + 1);
  return [...counts].map(([name, matches]) => ({ name, matches }));
}

/**
 * The kickoff to show people. A warm-up is listed on chain a few minutes ahead (listMatch needs a future
 * kickoff), but it is a match already played, so it shows its real date. Countdowns still use the chain's.
 */
export function shownKickoff(fixture: Fixture, chainKickoff: number): number {
  return fixture.warmUp ? Math.floor(Date.parse(fixture.kickoff) / 1000) : chainKickoff;
}
