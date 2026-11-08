import { describe, expect, it } from "vitest";
import {
  matchSquadPlayer,
  nameKey,
  parseFotmobMatch,
  type RatedPlayer,
  type SquadPlayer,
  settle,
  topRated,
} from "./settle";
import warmUpJson from "./testdata/fotmob-5181853.json";

// FotMob's matchDetails for the warm-up, Croatia v England on 3 Oct 2026 (trimmed to the fields used).
const warmUp = parseFotmobMatch(warmUpJson);

const rated = (
  name: string,
  rating: number,
  side: "home" | "away" = "away",
  shirtNumber: number | null = null,
) => ({ name, rating, side, shirtNumber }) satisfies RatedPlayer;

describe("FotMob match", () => {
  it("reads the warm-up: finished, both lineups, its public URL", () => {
    expect(warmUp.fotmobId).toBe("5181853");
    expect(warmUp.url).toBe("https://www.fotmob.com/match/5181853");
    expect([warmUp.home, warmUp.away]).toEqual(["Croatia", "England"]);
    expect(warmUp.finished).toBe(true);
    expect(warmUp.players.length).toBeGreaterThan(22);
  });

  it("the warm-up's top rating is Jude Bellingham, 9.8", () => {
    const top = topRated(warmUp.players);
    expect(top.rating).toBe(9.8);
    expect(top.players.map((p) => p.name)).toEqual(["Jude Bellingham"]);
  });

  it("refuses JSON that is not a match", () => {
    expect(() => parseFotmobMatch({})).toThrow("no matchId");
  });
});

describe("settle", () => {
  const squad: SquadPlayer[] = [
    { id: 10, name: "Jude Bellingham", number: 10, side: "away" },
    { id: 11, name: "Harry Kane", number: 9, side: "away" },
    { id: 20, name: "Luka Modrić", number: 10, side: "home" },
    { id: 21, name: "Josip Stanišić", number: 2, side: "home" },
    { id: 22, name: "Ivan Perišić", number: 4, side: "home" },
    { id: 23, name: "Nikola Perišić", number: 14, side: "home" },
  ];

  it("maps the top-rated person to the listed squad", () => {
    const result = settle(warmUp, squad);
    expect(result).toMatchObject({ rating: 9.8, winners: [10], unmatched: [] });
  });

  it("a tie proposes every top-rated player, ascending", () => {
    const match = {
      ...warmUp,
      players: [rated("Harry Kane", 8.7), rated("Luka Modric", 8.7, "home"), rated("X", 8.6)],
    };
    expect(settle(match, squad).winners).toEqual([11, 20]);
  });

  it("someone off the listed squad stops settlement", () => {
    const match = { ...warmUp, players: [rated("Cole Palmer", 9.1)] };
    expect(settle(match, squad)).toMatchObject({ winners: [], unmatched: [{ name: "Cole Palmer" }] });
  });

  it("FotMob listing the teams the other way round flips the sides", () => {
    const match = { ...warmUp, players: [rated("Luka Modrić", 9, "away")] };
    expect(settle(match, squad).winners).toEqual([]);
    expect(settle(match, squad, true).winners).toEqual([20]);
  });

  it("names compare without accents; shared surnames need the shirt number", () => {
    expect(nameKey("Josip Stanišić")).toBe("josip stanisic");
    expect(matchSquadPlayer(rated("J. Stanisic", 7, "home"), squad)).toBe(21);
    expect(matchSquadPlayer(rated("I. Perisic", 7, "home"), squad)).toBeNull();
    expect(matchSquadPlayer(rated("I. Perisic", 7, "home", 4), squad)).toBe(22);
  });
});
