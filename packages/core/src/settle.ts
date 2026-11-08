// Settlement from a published rating: the highest FotMob match rating wins; equal top ratings all win (the
// pot splits). The settler bot (scripts/settler.ts) reads FotMob's match JSON, keeps only what it needs here,
// and maps the top-rated people onto the squad listed on chain. Anything it cannot map stops the bot: a
// person can only win if they were on the listed squad, and a wrong guess would pay the wrong cards.

export type Side = "home" | "away";

export interface RatedPlayer {
  name: string;
  shirtNumber: number | null;
  side: Side;
  rating: number;
}

export interface RatedMatch {
  fotmobId: string;
  /** Public page the settler posts on chain as the source. */
  url: string;
  home: string;
  away: string;
  kickoff: string;
  finished: boolean;
  cancelled: boolean;
  players: RatedPlayer[];
}

export interface SquadPlayer {
  id: number;
  name: string;
  number: number;
  side: Side;
}

type FotmobPerson = {
  name?: string;
  shirtNumber?: string | number | null;
  performance?: { rating?: number | string | null } | null;
};
type FotmobSide = { name?: string; starters?: FotmobPerson[]; subs?: FotmobPerson[] };
type FotmobMatch = {
  general?: { matchId?: string | number; homeTeam?: { name?: string }; awayTeam?: { name?: string } };
  header?: { status?: { utcTime?: string; finished?: boolean; cancelled?: boolean } };
  content?: { lineup?: { homeTeam?: FotmobSide; awayTeam?: FotmobSide } | null };
};

export const fotmobMatchUrl = (id: string | number) => `https://www.fotmob.com/match/${id}`;

/** The parts of FotMob's matchDetails JSON settlement uses. Players without a rating are left out. */
export function parseFotmobMatch(json: unknown): RatedMatch {
  const data = json as FotmobMatch;
  const id = String(data.general?.matchId ?? "");
  if (!id) throw new Error("not a FotMob match: no matchId");
  const players: RatedPlayer[] = [];
  for (const side of ["home", "away"] as const) {
    const team = side === "home" ? data.content?.lineup?.homeTeam : data.content?.lineup?.awayTeam;
    for (const person of [...(team?.starters ?? []), ...(team?.subs ?? [])]) {
      const rating = Number(person.performance?.rating);
      if (!person.name || !Number.isFinite(rating) || rating <= 0) continue;
      const shirt = Number(person.shirtNumber);
      players.push({
        name: person.name,
        shirtNumber: Number.isInteger(shirt) && shirt > 0 ? shirt : null,
        side,
        rating,
      });
    }
  }
  return {
    fotmobId: id,
    url: fotmobMatchUrl(id),
    home: data.general?.homeTeam?.name ?? "",
    away: data.general?.awayTeam?.name ?? "",
    kickoff: data.header?.status?.utcTime ?? "",
    finished: Boolean(data.header?.status?.finished),
    cancelled: Boolean(data.header?.status?.cancelled),
    players,
  };
}

/** Everyone sharing the highest rating (FotMob shows one decimal; compared at that precision). */
export function topRated(players: readonly RatedPlayer[]): { rating: number; players: RatedPlayer[] } {
  if (players.length === 0) return { rating: 0, players: [] };
  const tenth = (value: number) => Math.round(value * 10);
  const best = Math.max(...players.map((p) => tenth(p.rating)));
  return { rating: best / 10, players: players.filter((p) => tenth(p.rating) === best) };
}

/** "Luka Modrić" and "luka modric" compare equal: no accents, case or punctuation. */
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/gi, "o")
    .replace(/æ/gi, "ae")
    .replace(/ß/g, "ss")
    .replace(/đ/gi, "d")
    .replace(/ł/gi, "l")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const lastName = (name: string) => nameKey(name).split(" ").at(-1) ?? "";

/**
 * The squad id of one rated person on the same side: full name first, then surname plus shirt number,
 * then a surname that only one squad player on that side has. Null when none of these is certain.
 */
export function matchSquadPlayer(person: RatedPlayer, squad: readonly SquadPlayer[]): number | null {
  const side = squad.filter((p) => p.side === person.side);
  const full = side.filter((p) => nameKey(p.name) === nameKey(person.name));
  if (full.length === 1) return full[0]?.id ?? null;
  const surname = side.filter((p) => lastName(p.name) === lastName(person.name));
  if (person.shirtNumber !== null) {
    const numbered = surname.filter((p) => p.number === person.shirtNumber);
    if (numbered.length === 1) return numbered[0]?.id ?? null;
  }
  return surname.length === 1 ? (surname[0]?.id ?? null) : null;
}

export interface Settlement {
  rating: number;
  /** Squad ids to propose, ascending; empty when nobody could be mapped. */
  winners: number[];
  /** Top-rated people not on the listed squad (or not mappable): the bot stops and asks a human. */
  unmatched: RatedPlayer[];
  top: RatedPlayer[];
}

/**
 * The result to propose. `flipped` = FotMob lists the teams the other way round from the fixture (the
 * settler checks team names and passes it).
 */
export function settle(match: RatedMatch, squad: readonly SquadPlayer[], flipped = false): Settlement {
  const { rating, players } = topRated(match.players);
  const winners = new Set<number>();
  const unmatched: RatedPlayer[] = [];
  for (const person of players) {
    const side: Side = flipped ? (person.side === "home" ? "away" : "home") : person.side;
    const id = matchSquadPlayer({ ...person, side }, squad);
    if (id === null) unmatched.push(person);
    else winners.add(id);
  }
  return { rating, winners: [...winners].sort((a, b) => a - b), unmatched, top: players };
}
