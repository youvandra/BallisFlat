// Can this browser reach what the app needs? Robinhood Chain's RPC (every read and write) and, when one is
// configured, the Ball is Flat API. Used to tell a broken connection apart from a broken page.
import { apiUrl } from "./api";
import { env } from "./env";

const TIMEOUT_MS = 8_000;
/** Robinhood Chain mainnet; local anvil runs with the same id. */
const CHAIN_ID_HEX = "0x1237";

export type Health = "ok" | "offline" | "rpc" | "api";

async function withTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    window.clearTimeout(timer);
  }
}

/** True when the RPC answers eth_chainId with Robinhood Chain's id. A DNS hijack or TLS failure is false. */
export async function rpcReachable(): Promise<boolean> {
  try {
    const response = await withTimeout(env.VITE_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { result?: string };
    return body.result?.toLowerCase() === CHAIN_ID_HEX;
  } catch {
    return false;
  }
}

/** True when the API answers its board, or when there is no API to reach (mock or event-scan mode). */
export async function apiReachable(): Promise<boolean> {
  if (!apiUrl) return true;
  try {
    const response = await withTimeout(`${apiUrl}/api/board`, { headers: { accept: "application/json" } });
    return response.ok;
  } catch {
    return false;
  }
}

/** The worst problem right now, checked in the order a fix would follow: network, chain, then server. */
export async function checkHealth(): Promise<Health> {
  if (env.VITE_DATA_MODE === "mock") return navigator.onLine ? "ok" : "offline";
  if (!navigator.onLine) return "offline";
  const [rpc, api] = await Promise.all([rpcReachable(), apiReachable()]);
  if (!rpc) return navigator.onLine ? "rpc" : "offline";
  if (!api) return "api";
  return "ok";
}
