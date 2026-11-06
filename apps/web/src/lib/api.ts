// The Ball is Flat API (apps/indexer): indexed on-chain state plus off-chain fixtures and squads.
// Amounts and token ids arrive as decimal strings and are turned back into bigints here.
import { env } from "./env";

export const apiUrl: string | null =
  env.VITE_DATA_MODE === "chain" && env.VITE_API_URL ? env.VITE_API_URL.replace(/\/$/, "") : null;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string): Promise<T> {
  if (!apiUrl) throw new ApiError(0, "no API configured");
  const response = await fetch(`${apiUrl}${path}`, { headers: { accept: "application/json" } });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(response.status, body.error ?? `API ${response.status}`);
  }
  return (await response.json()) as T;
}

export const big = (value: string | number | null | undefined): bigint => BigInt(value ?? 0);

export type ApiPlayer = {
  playerId: number;
  name: string;
  teamCode: string;
  number: number;
  position: "GK" | "DF" | "MF" | "FW";
  side: "home" | "away";
  cards: number;
};

export type ApiFixture = {
  slug: string;
  competition: string;
  matchday: number;
  kickoff: string;
  homeCode: string;
  awayCode: string;
  warmUp: boolean;
  squadSourceUrl: string;
  squadReadOn: string;
  matchId: string | null;
};

export type ApiTeam = { code: string; name: string; colour: string };

export type ApiCard = {
  tokenId: string;
  matchId: string;
  playerId: number;
  serial: number;
  minter: `0x${string}`;
  owner: `0x${string}`;
  opened: boolean;
  state: "live" | "claimed" | "refunded";
  payout: string;
  mintedAt: string;
  mintTx: `0x${string}`;
  burnTx: `0x${string}` | null;
  listingPrice: string | null;
};
