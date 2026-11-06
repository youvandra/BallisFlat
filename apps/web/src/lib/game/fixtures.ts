// Squads and fixture data from packages/config, keyed the way the app looks them up.
import { fixtures } from "@app/config/fixtures";
import type { Fixture, Player, Team } from "@app/config/fixtures.types";
import { env } from "../env";
import { deployment } from "./facts";
import { fixtureMatchIds } from "./mock-seed";

export type { Fixture, Player, Team };

// On chain a fixture is on the board once the deploy script lists it; the mock lists them all.
const ids =
  env.VITE_DATA_MODE === "mock" ? fixtureMatchIds(fixtures) : new Map(Object.entries(deployment.matches));

export interface ListedFixture extends Fixture {
  id: number;
}

export const listedFixtures: ListedFixture[] = fixtures
  .filter((fixture) => ids.has(fixture.slug))
  .map((fixture) => ({ ...fixture, id: ids.get(fixture.slug) ?? 0 }))
  .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

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
