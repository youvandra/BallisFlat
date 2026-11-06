import * as z from "zod/mini";

// The only reader of import.meta.env. A missing or malformed variable fails at start.
const schema = z.object({
  VITE_SITE_URL: z._default(z.url(), "http://localhost:5173"),
  // `chain` talks to the deployed contract (production). `mock` runs a simulated chain in the browser for
  // development and the e2e suite; it must be asked for explicitly.
  VITE_DATA_MODE: z._default(z.enum(["mock", "chain"]), "chain"),
  VITE_RPC_URL: z._default(z.url(), "https://rpc.mainnet.chain.robinhood.com"),
  // Which record in packages/config/src/deployments.json chain mode reads.
  VITE_NETWORK: z._default(z.enum(["mainnet", "local"]), "mainnet"),
  // The Ball is Flat API (apps/indexer). Chain mode reads fixtures, squads, cards, listings and the
  // leaderboard from it; without it the app falls back to the bundled fixtures and direct event scans.
  VITE_API_URL: z.optional(z.url()),
  // Local only: an unlocked anvil account the app signs with instead of a browser wallet.
  VITE_DEV_ACCOUNT: z.optional(z.string().check(z.regex(/^0x[0-9a-fA-F]{40}$/))),
});

export const env = schema.parse(import.meta.env);
