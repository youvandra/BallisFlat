// Written by scripts/deploy.ts. Any address shown in docs or UI must come from here.
// `mainnet` is Robinhood Chain; `local` is an anvil node started with the same chain id (npm run chain:local).
import deployments from "./deployments.json";

export type Network = "mainnet" | "local";

export type Deployment = {
  chainId: number;
  /** Block the contract was deployed in; event scans start here. */
  deployBlock: number;
  contracts: Partial<Record<"BallIsFlat" | "WIF", `0x${string}`>>;
  /** Fixture slug to on-chain match id, filled as the deploy script lists matches. */
  matches: Record<string, number>;
};

export const networks = deployments as Record<Network, Deployment>;
