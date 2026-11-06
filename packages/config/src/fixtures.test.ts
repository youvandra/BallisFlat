import { describe, expect, it } from "vitest";
import { fixtures, squadSources } from "./fixtures";

describe("fixtures", () => {
  it("has unique slugs and ISO UTC kick-offs", () => {
    expect(new Set(fixtures.map((f) => f.slug)).size).toBe(fixtures.length);
    for (const f of fixtures) expect(new Date(f.kickoff).toISOString()).toBe(f.kickoff.replace("Z", ".000Z"));
  });

  it("keeps player ids unique per match, home 1-99 and away 101-199", () => {
    for (const f of fixtures) {
      const ids = f.players.map((p) => p.id);
      expect(new Set(ids).size, f.slug).toBe(ids.length);
      for (const p of f.players) {
        const [lo, hi] = p.side === "home" ? [1, 99] : [101, 199];
        expect(p.id, `${f.slug} ${p.name}`).toBeGreaterThanOrEqual(lo);
        expect(p.id, `${f.slug} ${p.name}`).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("lists exactly one warm-up and three goalkeepers or more per side", () => {
    expect(fixtures.filter((f) => f.warmUp)).toHaveLength(1);
    for (const f of fixtures) {
      for (const side of ["home", "away"] as const) {
        const keepers = f.players.filter((p) => p.side === side && p.position === "GK");
        expect(keepers.length, `${f.slug} ${side}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("records a source for every team", () => {
    for (const f of fixtures.filter((x) => !x.warmUp)) {
      expect(squadSources[f.home.code]?.url).toMatch(/^https:\/\//);
      expect(squadSources[f.away.code]?.url).toMatch(/^https:\/\//);
    }
  });
});
