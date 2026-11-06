import { robinhoodChain } from "@app/config/chain";
import { type Chain, defineChain } from "viem";
import { env } from "../env";
import { deployment, facts } from "./facts";

/** Robinhood Chain as wallets see it; wagmi adds it to the wallet when missing. */
export const chain: Chain = defineChain({
  ...robinhoodChain,
  rpcUrls: { default: { http: [env.VITE_RPC_URL] } },
});

export const contractAddress = facts.contractAddress;
export const wifAddress = facts.wifAddress;
// Event scans start at the block the deploy script recorded.
export const deployBlock = BigInt(deployment.deployBlock);
