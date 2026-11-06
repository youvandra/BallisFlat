// Shared shape for match data. packages/config fills it, apps/web reads it.
// Change only together with fixtures.ts and the app.

export type Position = "GK" | "DF" | "MF" | "FW";

export type Player = {
  /** Stable id stored on-chain as uint32. Unique within a match. */
  id: number;
  name: string;
  number: number;
  position: Position;
  side: "home" | "away";
};

export type Team = {
  /** FIFA three-letter code, e.g. "ENG". */
  code: string;
  name: string;
  /** Main kit colour, hex. Used for the halftone card art. */
  colour: string;
};

export type Fixture = {
  slug: string;
  matchday: number; // 5, 6 (0 = warm-up)
  competition: string;
  home: Team;
  away: Team;
  /** ISO 8601 UTC kickoff. */
  kickoff: string;
  players: Player[];
  /** Where the squad list came from and when it was read. */
  squadSource: { url: string; readOn: string };
  /** A past match listed only so the claim step can be demoed. */
  warmUp?: boolean;
};
