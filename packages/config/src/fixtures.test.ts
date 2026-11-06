import { describe, expect, it } from "vitest";
import { fixtures, squadSources } from "./fixtures";

describe("fixtures", () => {
  it("has unique slugs and ISO UTC kick-offs", () => {
    expect(new Set(fixtures.map((f) => f.slug)).size).toBe(fixtures.length);
    for (const f of fixtures) expect(new Date(f.kickoff).toISOString()).toBe(f.kickoff.replace("Z", ".000Z"));
  });

  it("gives every person one global id, the same in every match", () => {
    const byKey = new Map<string, number>();
    for (const f of fixtures) {
      const ids = f.players.map((p) => p.id);
      expect(new Set(ids).size, f.slug).toBe(ids.length);
      for (const p of f.players) {
        const key = `${(p.side === "home" ? f.home : f.away).code}:${p.name}`;
        expect(Number.isInteger(p.id) && p.id > 0 && p.id < 2 ** 32, key).toBe(true);
        expect(byKey.get(key) ?? p.id, key).toBe(p.id);
        byKey.set(key, p.id);
      }
    }
    expect(new Set(byKey.values()).size).toBe(byKey.size);
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
