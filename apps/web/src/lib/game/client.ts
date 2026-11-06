import { fixtures } from "@app/config/fixtures";
import { env } from "../env";
import { facts } from "./facts";
import type { GameClient } from "./types";

// The demo wallet only exists in mock mode; it is the settler there so /ops works too.
const demoWallet = "0xba11f1a70000000000000000000000000000fa11" as const;

async function createClient(): Promise<GameClient> {
  if (env.VITE_DATA_MODE === "chain") {
    const { ChainGameClient } = await import("./chain-client");
    return new ChainGameClient();
  }
  const { MockGameClient } = await import("./mock-client");
  const client = new MockGameClient({
    fixtures,
    price: facts.price,
    burnBps: facts.burnBps,
    disputeWindow: facts.disputeWindow,
    maxPerPlayer: facts.maxPerPlayer,
    saleBurnBps: facts.saleBurnBps,
    demoWallet,
    startingWif: facts.price * 5n,
    storage: typeof localStorage === "undefined" ? null : localStorage,
    latencyMs: 900,
  });
  return client;
}

/** One client per page load, created on first use. */
export const gameClient: Promise<GameClient> = createClient();
