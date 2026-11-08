// Every product fact the app shows, read from packages/config. Nothing here restates a number.
import { robinhoodChain } from "@app/config/chain";
import { game, pool, wif } from "@app/config/constants";
import { networks } from "@app/config/deployments";
import { env } from "../env";
import type { Address } from "./types";

/** The deployment chain mode reads: Robinhood Chain mainnet, or a local anvil node. */
export const deployment = networks[env.VITE_NETWORK];

export const facts = {
  price: game.cardPrice,
  burnBps: game.burnBps,
  disputeWindow: game.disputeWindowSeconds,
  maxPerPlayer: game.maxPerPlayer,
  saleBurnBps: game.saleBurnBps,
  wifAddress: (deployment.contracts.WIF ?? wif.address) as Address,
  poolUrl: pool.dexscreener,
  explorerUrl: robinhoodChain.blockExplorers.default.url,
  contractAddress: (deployment.contracts.BallIsFlat ??
    "0x0000000000000000000000000000000000000000") as Address,
  /** Null until the Hunt contract is deployed on this network. */
  huntAddress: (deployment.contracts.BallIsFlatHunt ?? null) as Address | null,
} as const;

export function txUrl(hash: string): string {
  return `${facts.explorerUrl}/tx/${hash}`;
}
