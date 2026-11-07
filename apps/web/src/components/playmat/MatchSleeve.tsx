import { matchArtUrl, useCoverArtReady } from "../../lib/art";
import { formatDay } from "../../lib/format";
import { competitionOf, type ListedFixture, matchdayLabel, matchName } from "../../lib/game/fixtures";
import { sleeveCodes, sleeveColour, sleeveNumber } from "../../lib/game/sleeve";
import { palette } from "../../lib/palette";
import { CaseSleeve } from "./framer";

/** The fixture in the landing's Case Sleeve (CaseSleeve.tsx) at its 260 x 390 design size: tilt it, it is the real card. */
export function MatchSleeve({ fixture }: { fixture: ListedFixture }) {
  const ink = palette();
  useCoverArtReady();
  return (
    <div className="aspect-sleeve w-65 max-w-full flex-none">
      <CaseSleeve
        image={{ src: matchArtUrl(fixture.slug), alt: matchName(fixture) }}
        title={sleeveCodes(fixture)}
        number={sleeveNumber(fixture)}
        type={competitionOf(fixture).replace(/^UEFA\s+/, "")}
        year={formatDay(Math.floor(Date.parse(fixture.kickoff) / 1000))}
        discipline={matchdayLabel(fixture)}
        color={sleeveColour(fixture)}
        tilt
        card={ink.card}
        ink={ink.ink}
        muted={ink.graphite}
        line={ink.lineSoft}
        // neutral, like the board cards: the cover already carries both team colours
        edge="color-mix(in srgb, var(--color-ink) 18%, var(--color-mat))"
        dark={ink.mat}
      />
    </div>
  );
}
