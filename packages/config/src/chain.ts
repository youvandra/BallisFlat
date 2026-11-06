// Robinhood Chain network definitions, shaped for viem's defineChain (viem is not a dependency here).
// Source: https://docs.robinhood.com/chain/connecting (read 2026-11-06). The public RPCs are rate-limited.

type ChainDefinition = {
  id: number;
  name: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: { default: { http: readonly string[] } };
  blockExplorers: { default: { name: string; url: string } };
  testnet?: boolean;
};

const ether = { name: "Ether", symbol: "ETH", decimals: 18 } as const;

export const robinhoodChain = {
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: ether,
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
} as const satisfies ChainDefinition;

export const robinhoodChainTestnet = {
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: ether,
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Explorer", url: "https://explorer.testnet.chain.robinhood.com" } },
  testnet: true,
} as const satisfies ChainDefinition;
