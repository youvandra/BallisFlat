// Indexes the BallIsFlat contract into Postgres. NETWORK picks the deployment record in
// packages/config/src/deployments.json (mainnet = Robinhood Chain, local = anvil with the same chain id).
import { ballIsFlatAbi } from "@app/config/abi/BallIsFlat";
import { ballIsFlatHuntAbi } from "@app/config/abi/BallIsFlatHunt";
import { networks } from "@app/config/deployments";
import { createConfig } from "ponder";
import { fallback, http } from "viem";

const network = process.env.NETWORK === "local" ? "local" : "mainnet";
const deployment = networks[network];
const address = deployment.contracts.BallIsFlat;
if (!address) throw new Error(`no BallIsFlat address for ${network} in packages/config/src/deployments.json`);
const huntAddress = deployment.contracts.BallIsFlatHunt;
if (!huntAddress)
  throw new Error(`no BallIsFlatHunt address for ${network} in packages/config/src/deployments.json`);

const rpcUrls = (
  process.env.RPC_URL ??
  (network === "local" ? "http://127.0.0.1:8545" : "https://rpc.mainnet.chain.robinhood.com")
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

export default createConfig({
  database: process.env.DATABASE_URL
    ? { kind: "postgres", connectionString: process.env.DATABASE_URL }
    : { kind: "pglite" },
  chains: {
    robinhood: {
      id: deployment.chainId,
      // RPC_URL may list several URLs, comma-separated: the first serves every request and the next take over
      // only when it fails (a viem fallback, not Ponder's load balancing, so a metered backup stays idle).
      rpc: rpcUrls.length > 1 ? fallback(rpcUrls.map((url) => http(url))) : rpcUrls[0],
      // anvil mines on demand; poll quickly there so local runs feel live
      pollingInterval: network === "local" ? 500 : 1_000,
      cacheRpcRequests: network !== "local",
    },
  },
  contracts: {
    BallIsFlat: {
      abi: ballIsFlatAbi,
      chain: "robinhood",
      address,
      startBlock: deployment.deployBlock,
    },
    // Hunt packs and finds, for the traction log (activity); game state is still read from the contract.
    BallIsFlatHunt: {
      abi: ballIsFlatHuntAbi,
      chain: "robinhood",
      address: huntAddress,
      startBlock: deployment.deployBlock,
    },
  },
});
