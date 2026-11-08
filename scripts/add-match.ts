// Adds or replaces a fixture and its squads in the API from one JSON file (docs/runbooks/add-match.md).
//
//   API_URL=https://wif-api.ballisflat.fun ADMIN_TOKEN=… node scripts/add-match.ts my-match.json
//   node scripts/add-match.ts my-match.json --check        validate only, send nothing
//
// The file follows docs/runbooks/add-match.template.json. Listing it on chain is a separate step the owner
// signs in /ops > Fixtures (List, then Link): this script never holds a key.

import { readFileSync } from "node:fs";

type Position = "GK" | "DF" | "MF" | "FW";
type Input = {
  slug: string;
  competition: string;
  matchday: number;
  kickoff: string;
  home: { code: string; name: string; colour: string };
  away: { code: string; name: string; colour: string };
  squadSourceUrl: string;
  squadReadOn: string;
  players: { side: "home" | "away"; number: number; name: string; position: Position }[];
};

const file = process.argv[2];
const checkOnly = process.argv.includes("--check");
if (!file) throw new Error("usage: node scripts/add-match.ts <match.json> [--check]");
const input = JSON.parse(readFileSync(file, "utf8")) as Input;

/** Every problem in the file, in plain words; empty when it can be sent. */
function problems(match: Input, now = Date.now()): string[] {
  const out: string[] = [];
  if (!/^[a-z0-9-]{3,80}$/.test(match.slug ?? "")) out.push("slug: lowercase letters, digits and dashes");
  if (!match.competition) out.push("competition is empty");
  if (!Number.isInteger(match.matchday) || match.matchday < 0) out.push("matchday: a whole number");
  const kickoff = Date.parse(match.kickoff);
  if (!/Z$/.test(match.kickoff ?? "") || Number.isNaN(kickoff))
    out.push("kickoff: ISO 8601 in UTC, ending in Z");
  else if (kickoff < now + 15 * 60_000)
    out.push("kickoff must be at least 15 minutes ahead (listing needs a future kickoff)");
  for (const side of ["home", "away"] as const) {
    const team = match[side];
    if (!/^[A-Z]{3}$/.test(team?.code ?? "")) out.push(`${side}.code: three capital letters (FIFA code)`);
    if (!team?.name) out.push(`${side}.name: the team name exactly as FotMob writes it`);
    if (!/^#[0-9a-fA-F]{6}$/.test(team?.colour ?? "")) out.push(`${side}.colour: hex like #c8102e`);
  }
  if (!/^https:\/\//.test(match.squadSourceUrl ?? ""))
    out.push("squadSourceUrl: the https page the squad came from");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(match.squadReadOn ?? "")) out.push("squadReadOn: YYYY-MM-DD");
  const players = match.players ?? [];
  for (const side of ["home", "away"] as const) {
    const squad = players.filter((p) => p.side === side);
    if (squad.length < 1) out.push(`no ${side} players`);
    const numbers = squad.map((p) => p.number);
    const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
    if (dupes.length) out.push(`${side}: shirt number used twice: ${[...new Set(dupes)].join(", ")}`);
    const names = squad.map((p) => p.name.trim().toLowerCase());
    const twice = names.filter((n, i) => names.indexOf(n) !== i);
    if (twice.length) out.push(`${side}: player listed twice: ${[...new Set(twice)].join(", ")}`);
  }
  for (const p of players) {
    if (!p.name?.trim()) out.push("a player has no name");
    if (!Number.isInteger(p.number) || p.number < 1 || p.number > 99) out.push(`${p.name}: number 1-99`);
    if (!["GK", "DF", "MF", "FW"].includes(p.position)) out.push(`${p.name}: position GK, DF, MF or FW`);
    if (p.side !== "home" && p.side !== "away") out.push(`${p.name}: side home or away`);
  }
  return out;
}

const found = problems(input);
if (found.length > 0) {
  console.error(`${file} is not ready:\n- ${found.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `${input.slug}: ${input.home.name} v ${input.away.name}, ${input.kickoff}, ${input.players.length} players. OK.`,
);
if (checkOnly) process.exit(0);

const apiUrl = process.env.API_URL?.replace(/\/$/, "");
const token = process.env.ADMIN_TOKEN;
if (!apiUrl || !token)
  throw new Error("set API_URL and ADMIN_TOKEN (sudo grep ADMIN_TOKEN /etc/ballisflat/api.env)");
const response = await fetch(`${apiUrl}/api/admin/fixtures/${input.slug}`, {
  method: "PUT",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify(input),
});
const body = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(`API refused: ${response.status} ${JSON.stringify(body)}`);
  process.exit(1);
}
console.log(`saved: ${JSON.stringify(body)}`);
console.log("next: the owner opens /ops > Fixtures, presses List on this fixture (wallet), then Link.");
