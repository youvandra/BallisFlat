// Indexes the BallIsFlat contract into Postgres. NETWORK picks the deployment record in
// packages/config/src/deployments.json (mainnet = Robinhood Chain, local = anvil with the same chain id).
import { ballIsFlatAbi } from "@app/config/abi/BallIsFlat";
import { networks } from "@app/config/deployments";
import { createConfig } from "ponder";

const network = process.env.NETWORK === "local" ? "local" : "mainnet";
const deployment = networks[network];
const address = deployment.contracts.BallIsFlat;
if (!address) throw new Error(`no BallIsFlat address for ${network} in packages/config/src/deployments.json`);

export default createConfig({
  database: process.env.DATABASE_URL
    ? { kind: "postgres", connectionString: process.env.DATABASE_URL }
    : { kind: "pglite" },
  chains: {
    robinhood: {
      id: deployment.chainId,
      rpc:
        process.env.RPC_URL ??
        (network === "local" ? "http://127.0.0.1:8545" : "https://rpc.mainnet.chain.robinhood.com"),
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
  },
});
