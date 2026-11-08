// The settler bot: posts each match's result from FotMob's published ratings, corrects it if FotMob's
// ratings move during the dispute window, and finalizes once the window has passed.
//
//   node scripts/settler.ts --network local --once --dry-run     read and print, send nothing
//   node scripts/settler.ts --network mainnet --once              one pass (systemd timer, every 5 minutes)
//   node scripts/settler.ts --network mainnet                     loop every SETTLER_INTERVAL seconds
//
// Env: SETTLER_KEY (the settler wallet's key; falls back to DEPLOYER_KEY), RPC_URL, API_URL (the Ball is
// Flat API, for squads of fixtures added through /ops; without it the bundled fixtures are used),
// SETTLE_AFTER_MINUTES (wait after full time so ratings settle, default 30), SETTLER_INTERVAL (default 300).
//
// It never guesses: if a top-rated person is not on the listed squad, or a match is postponed, it logs
// "NEEDS A HUMAN" and leaves that match alone. The owner then settles or voids it from /ops.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  type Hex,
  http,
  publicActions,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ballIsFlatAbi } from "../packages/config/src/abi/BallIsFlat.ts";
import { robinhoodChain } from "../packages/config/src/chain.ts";
import type { Deployment, Network } from "../packages/config/src/deployments.ts";
import { fixtures as bundledFixtures } from "../packages/config/src/fixtures.ts";
import {
  nameKey,
  parseFotmobMatch,
  type RatedMatch,
  type SquadPlayer,
  settle,
} from "../packages/core/src/settle.ts";
import { squadIds, squadProof } from "../packages/core/src/squad.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const network = (args[args.indexOf("--network") + 1] ?? "local") as Network;
const once = args.includes("--once");
const dryRun = args.includes("--dry-run");
const settleAfter = Number(process.env.SETTLE_AFTER_MINUTES ?? 30) * 60;
const interval = Number(process.env.SETTLER_INTERVAL ?? 300) * 1000;
const apiUrl = process.env.API_URL?.replace(/\/$/, "") ?? null;
// FotMob marks a match finished at full time; extra time and penalties can push that to ~2h30 after kickoff.
const FULL_TIME_AFTER = 105 * 60;

const deployment: Deployment = JSON.parse(
  readFileSync(resolve(root, "packages/config/src/deployments.json"), "utf8"),
)[network];
const address = deployment?.contracts.BallIsFlat as Address | undefined;
if (!address) throw new Error(`no BallIsFlat deployment for ${network}`);

const rpcUrl =
  process.env.RPC_URL ??
  (network === "local" ? "http://127.0.0.1:8545" : robinhoodChain.rpcUrls.default.http[0]);
const chain = defineChain({ ...robinhoodChain, rpcUrls: { default: { http: [rpcUrl] } } });
const key = (process.env.SETTLER_KEY ??
  process.env.DEPLOYER_KEY ??
  (network === "local" ? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" : undefined)) as
  | Hex
  | undefined;
const publicClient = createPublicClient({ chain, transport: http() });
const wallet = key
  ? createWalletClient({ account: privateKeyToAccount(key), chain, transport: http() }).extend(publicActions)
  : null;
const contract = { address, abi: ballIsFlatAbi } as const;

// IBallIsFlat.State
const STATE = ["None", "Open", "Locked", "Proposed", "Final", "RolledOver", "Void"] as const;

interface Listed {
  matchId: bigint;
  slug: string;
  home: string;
  away: string;
  /** The real kickoff (the warm-up is listed on chain with a later one). */
  kickoff: string;
  squad: SquadPlayer[];
  fotmobId: string | null;
}

const log = (slug: string, line: string) => console.log(`${new Date().toISOString()} ${slug}: ${line}`);
const human = (slug: string, line: string) =>
  console.log(`${new Date().toISOString()} ${slug}: NEEDS A HUMAN ${line}`);

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 ballisflat-settler" } });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return (await response.json()) as T;
}

/** Listed matches with their squads: from the API when there is one, else the bundled fixtures. */
async function listedMatches(): Promise<Listed[]> {
  if (apiUrl) {
    type ApiFixture = {
      slug: string;
      kickoff: string;
      homeCode: string;
      awayCode: string;
      matchId: string | null;
    };
    type ApiDetail = {
      squad: { playerId: number; name: string; number: number; side: "home" | "away" }[];
    };
    const [fixtures, teams] = await Promise.all([
      getJson<ApiFixture[]>(`${apiUrl}/api/fixtures`),
      getJson<{ code: string; name: string }[]>(`${apiUrl}/api/teams`),
    ]);
    const teamName = new Map(teams.map((t) => [t.code, t.name]));
    const listed = fixtures.filter((f) => f.matchId !== null);
    return Promise.all(
      listed.map(async (f) => {
        const detail = await getJson<ApiDetail>(`${apiUrl}/api/fixtures/${f.slug}`);
        return {
          matchId: BigInt(f.matchId as string),
          slug: f.slug,
          home: teamName.get(f.homeCode) ?? f.homeCode,
          away: teamName.get(f.awayCode) ?? f.awayCode,
          kickoff: f.kickoff,
          squad: detail.squad.map((p) => ({ id: p.playerId, name: p.name, number: p.number, side: p.side })),
          fotmobId: null,
        };
      }),
    );
  }
  return bundledFixtures.flatMap((f) => {
    const id = deployment.matches[f.slug];
    if (id === undefined) return [];
    return [
      {
        matchId: BigInt(id),
        slug: f.slug,
        home: f.home.name,
        away: f.away.name,
        kickoff: f.kickoff,
        squad: f.players.map((p) => ({ id: p.id, name: p.name, number: p.number, side: p.side })),
        fotmobId: f.fotmobId ?? null,
      },
    ];
  });
}

/** FotMob's id for a fixture: given, or found on FotMob's day list by team names and kickoff. */
async function findFotmobMatch(match: Listed): Promise<{ id: string; flipped: boolean } | null> {
  if (match.fotmobId) return { id: match.fotmobId, flipped: false };
  const day = match.kickoff.slice(0, 10).replaceAll("-", "");
  type Day = { leagues?: { matches?: { id: number; home: { name: string }; away: { name: string } }[] }[] };
  const list = await getJson<Day>(`https://www.fotmob.com/api/data/matches?date=${day}`);
  const home = nameKey(match.home);
  const away = nameKey(match.away);
  for (const league of list.leagues ?? []) {
    for (const m of league.matches ?? []) {
      const h = nameKey(m.home.name);
      const a = nameKey(m.away.name);
      if (h === home && a === away) return { id: String(m.id), flipped: false };
      if (h === away && a === home) return { id: String(m.id), flipped: true };
    }
  }
  return null;
}

async function ratedMatch(match: Listed): Promise<{ rated: RatedMatch; flipped: boolean } | null> {
  const found = await findFotmobMatch(match);
  if (!found) return null;
  const json = await getJson<unknown>(`https://www.fotmob.com/api/data/matchDetails?matchId=${found.id}`);
  return { rated: parseFotmobMatch(json), flipped: found.flipped };
}

async function send(slug: string, functionName: "propose" | "correct" | "finalize", fnArgs: unknown[]) {
  if (dryRun || !wallet) {
    log(
      slug,
      `${dryRun ? "dry run" : "no key"}: would call ${functionName}(${JSON.stringify(fnArgs, (_k, v) => (typeof v === "bigint" ? v.toString() : v))})`,
    );
    return;
  }
  const hash = await wallet.writeContract({ ...contract, functionName, args: fnArgs } as never);
  const receipt = await wallet.waitForTransactionReceipt({ hash });
  log(slug, `${functionName} ${receipt.status} ${hash}`);
}

async function settleOne(match: Listed, disputeWindow: bigint, now: number) {
  const [stateIndex, info] = await Promise.all([
    publicClient.readContract({ ...contract, functionName: "stateOf", args: [match.matchId] }),
    publicClient.readContract({ ...contract, functionName: "matchInfo", args: [match.matchId] }),
  ]);
  const state = STATE[stateIndex] ?? "None";
  if (state !== "Locked" && state !== "Proposed") return;

  if (state === "Proposed" && now >= Number(info.proposedAt + disputeWindow)) {
    await send(match.slug, "finalize", [match.matchId]);
    return;
  }

  const realKickoff = Math.floor(Date.parse(match.kickoff) / 1000);
  if (now < realKickoff + FULL_TIME_AFTER) return;
  const found = await ratedMatch(match);
  if (!found) {
    human(
      match.slug,
      `not found on FotMob for ${match.kickoff.slice(0, 10)} (${match.home} v ${match.away})`,
    );
    return;
  }
  const { rated, flipped } = found;
  if (rated.cancelled) {
    human(match.slug, `FotMob shows it cancelled or postponed (${rated.url}): void it from /ops`);
    return;
  }
  if (!rated.finished) return log(match.slug, `not finished yet on FotMob (${rated.url})`);
  if (now < realKickoff + FULL_TIME_AFTER + settleAfter)
    return log(match.slug, "finished, waiting for ratings to settle");

  const result = settle(rated, match.squad, flipped);
  if (result.unmatched.length > 0 || result.winners.length === 0) {
    human(
      match.slug,
      `top rating ${result.rating} by ${result.top.map((p) => p.name).join(", ")} is not on the listed squad (${rated.url})`,
    );
    return;
  }
  const ids = squadIds(match.squad.map((p) => p.id));
  const proofs = result.winners.map((id) => squadProof(ids, id) ?? []);
  const names = result.top.map((p) => `${p.name} ${p.rating}`).join(", ");

  if (state === "Locked") {
    log(match.slug, `top rated: ${names}`);
    await send(match.slug, "propose", [match.matchId, result.winners, proofs, rated.url]);
    return;
  }
  // Proposed and still in the window: follow FotMob if its ratings moved.
  const posted = await publicClient.readContract({
    ...contract,
    functionName: "winnersOf",
    args: [match.matchId],
  });
  const same = [...posted].sort((a, b) => a - b).join(",") === result.winners.join(",");
  if (!same) {
    log(match.slug, `FotMob changed: ${names} (posted ${posted.join(",")})`);
    await send(match.slug, "correct", [match.matchId, result.winners, proofs, rated.url]);
  }
}

async function pass() {
  const [matches, disputeWindow, block] = await Promise.all([
    listedMatches(),
    publicClient.readContract({ ...contract, functionName: "disputeWindow" }),
    publicClient.getBlock(),
  ]);
  const now = Number(block.timestamp);
  for (const match of matches) {
    try {
      await settleOne(match, disputeWindow, now);
    } catch (error) {
      human(match.slug, `error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

console.log(
  `settler on ${network} (${address}) as ${wallet?.account.address ?? "read-only"}${dryRun ? ", dry run" : ""}`,
);
await pass();
while (!once) {
  await new Promise((done) => setTimeout(done, interval));
  await pass();
}
