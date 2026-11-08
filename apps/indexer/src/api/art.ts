// Card art for NFT images. Wallets and marketplaces show the card SVG as an <img>, and an SVG shown that
// way may not load anything from another URL, so the player illustration is fetched once, kept in memory
// and written into the SVG as a data URI. Only our art CDN is fetched (the URLs come from player-art.json).
import { artKey, playerArt } from "@app/config/player-art";
import sharp from "sharp";

const allowedHost = "d29qeiydx3h9k2.cloudfront.net";
const maxEntries = 400; // one ~50-150 KB PNG per player; a few hundred players at most
const cache = new Map<string, Promise<string | null>>();

/** The illustration URL for a player, if one exists and lives on our CDN. */
export function artUrlFor(teamCode: string, playerName: string): string | null {
  const url = playerArt[artKey(teamCode, playerName)];
  if (!url) return null;
  try {
    return new URL(url).host === allowedHost ? url : null;
  } catch {
    return null;
  }
}

async function download(url: string, fetcher: typeof fetch): Promise<string | null> {
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(8_000) });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.startsWith("image/")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    const mime = type.split(";")[0] ?? "";
    // The PNG route rasterises the SVG with librsvg, which leaves WebP (our art format) blank: re-encode it.
    if (mime === "image/png" || mime === "image/jpeg")
      return `data:${mime};base64,${bytes.toString("base64")}`;
    const png = await sharp(bytes).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * The illustration as a data URI, or null when there is none (the card then prints the shirt number).
 * A failed download is forgotten so the next request tries again.
 */
export function inlineArt(url: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const hit = cache.get(url);
  if (hit) return hit;
  if (cache.size >= maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  const pending = download(url, fetcher).then((dataUri) => {
    if (!dataUri) cache.delete(url);
    return dataUri;
  });
  cache.set(url, pending);
  return pending;
}
