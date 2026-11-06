// Number formatting for every surface (site, README generator, video). Figures use tabular numerals in CSS.

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatUsd(value: number): string {
  return usd.format(value);
}

export function formatCompact(value: number): string {
  return compact.format(value);
}

/** Shortens 0x addresses and long ids for display: 0x1234…abcd. */
export function shortId(id: string, head = 6, tail = 4): string {
  return id.length <= head + tail + 1 ? id : `${id.slice(0, head)}…${id.slice(-tail)}`;
}
