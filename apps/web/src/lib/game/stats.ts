// Traction numbers for /stats, from the API's /api/stats (indexed events plus connected wallets), and the
// once-per-session report of a connected wallet that feeds the connected count.
import { useQuery } from "@tanstack/react-query";
import { api, apiUrl, big } from "../api";

type Kind = { actions: number; wallets: number; amount: bigint; burned: bigint };

type StatsActivity = {
  id: string;
  kind: string;
  wallet: string | null;
  amount: bigint;
  at: number;
  tx: string;
};

export type Stats = {
  wallets: { transacting: number; connected: number };
  actions: number;
  kinds: Record<string, Kind>;
  wif: { paidIn: bigint; marketVolume: bigint; paidOut: bigint; burned: bigint };
  daily: { day: string; actions: number; wallets: number }[];
  connectedDaily: { day: string; count: number }[];
  recent: StatsActivity[];
};

type RawKind = { actions: number; wallets: number; amount: string; burned: string };
type RawStats = Omit<Stats, "kinds" | "wif" | "recent"> & {
  kinds: Record<string, RawKind>;
  wif: Record<keyof Stats["wif"], string>;
  recent: { id: string; kind: string; wallet: string | null; amount: string; at: string; tx: string }[];
};

export function parseStats(raw: RawStats): Stats {
  return {
    ...raw,
    kinds: Object.fromEntries(
      Object.entries(raw.kinds).map(([kind, row]) => [
        kind,
        { actions: row.actions, wallets: row.wallets, amount: big(row.amount), burned: big(row.burned) },
      ]),
    ),
    wif: {
      paidIn: big(raw.wif.paidIn),
      marketVolume: big(raw.wif.marketVolume),
      paidOut: big(raw.wif.paidOut),
      burned: big(raw.wif.burned),
    },
    recent: raw.recent.map((row) => ({ ...row, amount: big(row.amount), at: Number(row.at) })),
  };
}

/** Null data without an API (mock mode): the page says the numbers live on the deployed app. */
export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: async () => (apiUrl ? parseStats(await api<RawStats>("/api/stats")) : null),
    refetchInterval: 60_000,
  });
}

const SEEN_KEY = "bif-seen";

/** Tells the API this wallet connected, once per browser session; failures are ignored. */
export function reportSeen(address: string): void {
  if (!apiUrl) return;
  const key = `${SEEN_KEY}:${address.toLowerCase()}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // Storage blocked: report anyway; the API keeps one row per wallet.
  }
  void fetch(`${apiUrl}/api/seen`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet: address }),
    keepalive: true,
  }).catch(() => undefined);
}
