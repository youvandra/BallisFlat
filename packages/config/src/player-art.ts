// Player illustrations hosted on S3, written by scripts/gen-art.ts. A player missing here keeps the
// generated number art.
import matches from "./match-art.json" with { type: "json" };
import art from "./player-art.json" with { type: "json" };

/** Stable key per player across fixtures: team code plus an ASCII slug of the name. */
export function artKey(teamCode: string, name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${teamCode}-${slug}`;
}

export const playerArt = art as Record<string, string>;

/** Match cover art by fixture slug, written by `scripts/gen-art.ts --matches`. */
export const matchArt = matches as Record<string, string>;
