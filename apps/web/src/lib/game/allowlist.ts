// Free-pack allowlists. The tree is built in packages/core/src/allowlist.ts; the root goes on chain
// (setTier), the wallets live with the API (app.hunt_allowlist) so any visitor can fetch their proof.
// Without an API (mock mode, or chain mode with no VITE_API_URL) lists are kept in this browser.
import { allowProof, allowRoot } from "@app/core/allowlist";
import { adminApi, api, apiUrl } from "../api";
import type { Address, Hash } from "./types";

const LOCAL_KEY = "bif-allowlists";

function localLists(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}") as Record<string, string[]>;
  } catch {
    return {};
  }
}

/** Stores the list and returns its root (the API recomputes and checks it). */
export async function uploadAllowlist(wallets: Hash[]): Promise<{ root: Hash; count: number }> {
  const root = allowRoot(wallets);
  if (apiUrl) {
    const stored = await adminApi<{ root: Hash; count: number }>("/api/admin/hunt/allowlist", {
      method: "POST",
      body: { wallets },
    });
    if (stored.root.toLowerCase() !== root.toLowerCase()) throw new Error("API built a different root");
    return stored;
  }
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...localLists(), [root]: wallets }));
  } catch {
    // Storage blocked: the root still goes on chain, proofs just cannot be served from this browser.
  }
  return { root, count: wallets.length };
}

/** Every wallet on the stored list with `root` (admin), or null when neither the API nor this browser has it. */
export async function fetchAllowlist(root: Hash): Promise<Address[] | null> {
  if (apiUrl) {
    try {
      const { wallets } = await adminApi<{ wallets: Address[] }>(`/api/admin/hunt/allowlist/${root}`);
      return wallets;
    } catch {
      return null;
    }
  }
  const wallets = localLists()[root];
  return wallets ? (wallets as Address[]) : null;
}

/** The wallet's proof for the list with `root`, or null when it is not on it. */
export async function fetchAllowProof(root: Hash, wallet: Address): Promise<Hash[] | null> {
  if (apiUrl) {
    try {
      const { proof } = await api<{ proof: Hash[] }>(`/api/hunt/allowlist/${root}/${wallet}`);
      return proof;
    } catch {
      return null;
    }
  }
  const wallets = localLists()[root];
  return wallets ? allowProof(wallets, wallet) : null;
}
