// Card art, all drawn here as SVG from the fixture data. Match covers are riso prints of the two team codes
// and a halftone ball; player art is drawn here as an SVG: the team colour as a halftone screen and the shirt number printed
// twice, pink over cyan, off register. No photos, no likeness.
import { artKey, matchArt, playerArt } from "@app/config/player-art";
import { useEffect, useSyncExternalStore } from "react";
import { fixtureBySlug, listedFixtures, type Player, type Team } from "./game/fixtures";
import { palette } from "./palette";

/** HoloCard and CaseSleeve write the URL into an unquoted CSS url(), so parentheses and quotes are escaped. */
function svgDataUrl(svg: string): string {
  const encoded = encodeURIComponent(svg).replace(
    /[()']/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

type CoverShape = "card" | "wide";

// A cover is an image (a data URL), so it cannot use the page's fonts. To print the codes in Unbounded 800
// like the landing's covers, the font is fetched once (only the letters the codes need), embedded in each
// cover, and every cover is redrawn when it arrives. Until then the codes fall back to Arial Black.
let coverFontCss = "";
let coverFontStarted = false;
const coverListeners = new Set<() => void>();

function loadCoverFont(): void {
  if (coverFontStarted || typeof window === "undefined") return;
  coverFontStarted = true;
  const letters = [
    ...new Set(listedFixtures.flatMap((f) => [...f.home.code, ...f.away.code]).concat([..."BIFv"])),
  ];
  const cssUrl = `https://fonts.googleapis.com/css2?family=Unbounded:wght@800&text=${encodeURIComponent(letters.join(""))}`;
  (async () => {
    const css = await (await fetch(cssUrl)).text();
    const fontUrl = css.match(/url\((https:[^)]+)\)/)?.[1];
    if (!fontUrl) return;
    const bytes = new Uint8Array(await (await fetch(fontUrl)).arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    coverFontCss = `@font-face{font-family:"BIF Cover";font-weight:800;src:url(data:font/woff2;base64,${btoa(binary)})}`;
    coverCache.clear();
    for (const listener of coverListeners) listener();
  })().catch(() => {
    // Offline or blocked: the covers keep the fallback face.
  });
}

/** Redraws a component's covers once the cover font has arrived. */
export function useCoverArtReady(): boolean {
  useEffect(loadCoverFont, []);
  return useSyncExternalStore(
    (listener) => {
      coverListeners.add(listener);
      return () => coverListeners.delete(listener);
    },
    () => coverFontCss !== "",
    () => false,
  );
}

/**
 * A fixture cover in the landing's riso print, drawn from the fixture: the home code in pink, the away code
 * in cyan, a halftone ball on the halfway line between them. "card" is square with the codes above and
 * below the ball (sleeves, the deck); "wide" is 2:1 with the codes either side (the match list tiles).
 */
function coverSvg(home: string, away: string, shape: CoverShape): string {
  const ink = palette();
  const wide = shape === "wide";
  const w = 1024;
  const h = wide ? 512 : 1024;
  const cx = w / 2;
  const cy = h / 2;
  const r = wide ? 150 : 220;
  const k = r / 220;
  const pentagon = (x: number, y: number, size: number) =>
    Array.from({ length: 5 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      return `${(x + size * Math.cos(a)).toFixed(1)},${(y + size * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
  const patches = [
    [0, 0, 44],
    [0, -112, 30],
    [-98, -42, 30],
    [98, -42, 30],
    [-62, 88, 30],
    [62, 88, 30],
  ]
    .map(
      ([dx = 0, dy = 0, size = 0]) =>
        `<polygon points="${pentagon(cx + dx * k, cy + dy * k, size * k)}" fill="${ink.mat}" opacity="0.85"/>`,
    )
    .join("");
  // textLength keeps any three-letter code inside its half, however wide the letters are.
  const codes = wide
    ? `<text x="${cx - r - 165}" y="${cy + 66}" font-size="190" textLength="290" lengthAdjust="spacingAndGlyphs" fill="url(#pinkDots)">${home}</text>
<text x="${cx + r + 165}" y="${cy + 66}" font-size="190" textLength="290" lengthAdjust="spacingAndGlyphs" fill="url(#cyanDots)">${away}</text>`
    : `<text x="${cx}" y="300" font-size="300" textLength="860" lengthAdjust="spacingAndGlyphs" fill="url(#pinkDots)">${home}</text>
<text x="${cx}" y="960" font-size="300" textLength="860" lengthAdjust="spacingAndGlyphs" fill="url(#cyanDots)">${away}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
<defs>
<linearGradient id="fade" x1="0" y1="0" x2="${wide ? 1 : 0}" y2="${wide ? 0 : 1}"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
<mask id="first"><rect width="${w}" height="${h}" fill="url(#fade)"/></mask>
<mask id="second"><rect width="${w}" height="${h}" fill="url(#fade)" transform="rotate(180 ${cx} ${cy})"/></mask>
<pattern id="dotsPink" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="6" cy="6" r="3.2" fill="${ink.pink}"/></pattern>
<pattern id="dotsCyan" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="6" cy="6" r="3.2" fill="${ink.cyan}"/></pattern>
<pattern id="fine" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(15)"><circle cx="4" cy="4" r="2.6" fill="${ink.ink}"/></pattern>
<pattern id="pinkDots" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="5" cy="5" r="4.4" fill="${ink.pink}"/></pattern>
<pattern id="cyanDots" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="5" cy="5" r="4.4" fill="${ink.cyan}"/></pattern>
${coverFontCss ? `<style>${coverFontCss}</style>` : ""}
<radialGradient id="shade" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0.35"/></radialGradient>
<mask id="ball"><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#shade)"/></mask>
</defs>
<rect width="${w}" height="${h}" fill="${ink.mat}"/>
<rect width="${w}" height="${h}" fill="url(#dotsPink)" mask="url(#first)" opacity="0.6"/>
<rect width="${w}" height="${h}" fill="url(#dotsCyan)" mask="url(#second)" opacity="0.6"/>
<line x1="0" y1="${cy}" x2="${w}" y2="${cy}" stroke="${ink.cyan}" stroke-width="5"/>
<g font-family="'BIF Cover', Unbounded, 'Arial Black', sans-serif" font-weight="800" text-anchor="middle">
${codes}
</g>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ink.pink}" opacity="0.45"/>
<rect width="${w}" height="${h}" fill="url(#fine)" mask="url(#ball)"/>
${patches}
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ink.cyan}" stroke-width="5"/>
${wide ? "" : `<text x="${cx}" y="780" font-family="'BIF Cover', Unbounded, sans-serif" font-weight="800" font-size="44" text-anchor="middle" fill="${ink.ink}">v</text>`}
</svg>`;
}

const coverCache = new Map<string, string>();

/**
 * The fixture's cover art: the generated stadium cover (scripts/gen-art.ts --matches) when there is one,
 * else drawn from its team codes so the art and the text always agree.
 */
export function matchArtUrl(slug: string, shape: CoverShape = "card"): string {
  const generated = shape === "card" ? matchArt[slug] : undefined;
  if (generated) return generated;
  const key = `${slug}:${shape}`;
  const hit = coverCache.get(key);
  if (hit) return hit;
  const fixture = fixtureBySlug(slug);
  const url = svgDataUrl(coverSvg(fixture?.home.code ?? "BIF", fixture?.away.code ?? "BIF", shape));
  coverCache.set(key, url);
  return url;
}

const cache = new Map<string, string>();

// Unbounded's digits stand 0.75em tall on the baseline, so a baseline at centre + 0.375em centres the ink.
const digitHeight = 0.75;

/** The player's action illustration (scripts/gen-art.ts, served from the art CDN), when one exists. */
export function playerIllustration(
  player: Pick<Player, "name">,
  team: Pick<Team, "code">,
): string | undefined {
  return playerArt[artKey(team.code, player.name)];
}

/**
 * A data URL for the player's card art, sized 600 x 720 so it fills a HoloCard art well. With
 * `number: false` the art is the halftone only and the card prints the number itself (ShirtNumber), centred
 * on its glyphs; the pack's card keeps the number in the art, centred on the art's middle.
 */
export function playerArtUrl(
  player: Pick<Player, "number">,
  team: Pick<Team, "colour" | "code">,
  { number = true }: { number?: boolean } = {},
): string {
  const key = `${team.code}-${player.number}-${number ? "n" : "plain"}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const ink = palette();
  const size = player.number >= 10 ? 330 : 420;
  const baseline = Math.round(360 + (size * digitHeight) / 2);
  const digits = number
    ? `<g font-family="Unbounded, sans-serif" font-weight="800" text-anchor="middle" style="mix-blend-mode:screen">
<text x="291" y="${baseline - 9}" font-size="${size}" fill="${ink.cyan}">${player.number}</text>
<text x="309" y="${baseline + 9}" font-size="${size}" fill="${ink.pink}" opacity="0.92">${player.number}</text>
</g>
<text x="40" y="84" font-family="Unbounded, sans-serif" font-weight="700" font-size="46" fill="${ink.ink}">${team.code}</text>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 720">
<defs>
<pattern id="d" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(22)"><circle cx="13" cy="13" r="9.5" fill="${team.colour}"/></pattern>
<pattern id="f" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(-15)"><circle cx="7" cy="7" r="3" fill="${ink.ink}" opacity="0.4"/></pattern>
<radialGradient id="g" cx="0.85" cy="0.1" r="1.05"><stop offset="0" stop-color="white"/><stop offset="0.55" stop-color="white" stop-opacity="0.55"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient>
<mask id="m"><rect width="600" height="720" fill="url(#g)"/></mask>
</defs>
<rect width="600" height="720" fill="${ink.card}"/>
<rect width="600" height="720" fill="url(#d)" mask="url(#m)"/>
<rect width="600" height="720" fill="url(#f)" mask="url(#m)"/>
${digits}
</svg>`;
  const url = svgDataUrl(svg);
  cache.set(key, url);
  return url;
}
