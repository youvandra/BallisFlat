// Prices, limits, fees and durations. Docs, site and video import these; nothing restates them.

export const product = {
  name: "Ball is Flat",
  tagline: "Pick the man of the match, mint the card, burn it to get paid.",
} as const;

/** $WIF on Robinhood Chain mainnet: the stake, the pot and the burn. */
export const wif = {
  address: "0x5173b8eA6923c2d40267890D45C46a3480954773",
  decimals: 18,
  symbol: "WIF",
} as const;

/** The $WIF/ETH pool, linked from "Get $WIF". */
export const pool = {
  dexscreener:
    "https://dexscreener.com/robinhood/0x71ef4106340f0a3b9c19ec994eef4fc44a1d2513f38faac39d7636b156548c79",
} as const;

/** Game parameters the contract is deployed with. */
export const game = {
  /** 1,000 $WIF per card, in wei (18 decimals). */
  cardPrice: 1000n * 10n ** 18n,
  /** 1000 bps = 10% of every finalized pot is burned. */
  burnBps: 1000,
  /** 2 hours between a proposed result and finalize. */
  disputeWindowSeconds: 7200,
  /** At most 10 cards per player per match (listMatch maxPerPlayer; 0 would mean unlimited). */
  maxPerPlayer: 10,
  /** 500 bps = 5% of every market sale is burned, the rest goes to the seller. */
  saleBurnBps: 500,
} as const;

export const links = {
  rules: "https://worldisflat.fun/build/rules",
} as const;
