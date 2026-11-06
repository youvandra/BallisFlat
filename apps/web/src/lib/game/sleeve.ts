// How a fixture is printed on its sleeve, the same way the landing labels its match cards:
// "001", "ENG v CRO", "MD5, 12 Nov", pink for Matchday 5 and cyan for Matchday 6.
import { formatDay } from "../format";
import { palette } from "../palette";
import { type ListedFixture, listedFixtures } from "./fixtures";

export function sleeveNumber(fixture: ListedFixture): string {
  if (fixture.warmUp) return "000";
  const index = listedFixtures.filter((item) => !item.warmUp).findIndex((item) => item.slug === fixture.slug);
  return String(index + 1).padStart(3, "0");
}

export function sleeveCodes(fixture: ListedFixture): string {
  return `${fixture.home.code} v ${fixture.away.code}`;
}

export function sleeveTag(fixture: ListedFixture): string {
  const day = formatDay(Math.floor(Date.parse(fixture.kickoff) / 1000));
  return fixture.warmUp ? `Warm-up, ${day}` : `MD${fixture.matchday}, ${day}`;
}

export function sleeveColour(fixture: ListedFixture): string {
  const ink = palette();
  if (fixture.warmUp) return ink.note;
  return fixture.matchday % 2 === 1 ? ink.pink : ink.cyan;
}

/** The matchday as a Badge fill (Pink or cyan only): Matchday 5 Pink, Matchday 6 and the warm-up cyan. */
export function sleeveTone(fixture: ListedFixture): "pink" | "cyan" {
  return !fixture.warmUp && fixture.matchday % 2 === 1 ? "pink" : "cyan";
}
