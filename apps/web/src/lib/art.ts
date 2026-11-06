// Card art, all drawn here as SVG from the fixture data. Match covers are riso prints of the two flags and
// a halftone ball, with no text; player art is drawn here as an SVG: the team colour as a halftone screen and the shirt number printed
// twice, pink over cyan, off register. No photos, no likeness.
import { flagShapes } from "@app/config/flags";
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

type CoverTeam = Pick<Team, "code" | "colour">;

/**
 * A fixture cover as a two-ink riso print of both flags, no text: the home flag fills the left of a slanted
 * seam and the away flag the right, each printed through a halftone screen with a faint off-register copy,
 * and a halftone ball sits on the seam. "card" is square (sleeves, the deck); "wide" is 2:1 (list tiles).
 */
function coverSvg(home: CoverTeam, away: CoverTeam, shape: CoverShape): string {
  const ink = palette();
  const wide = shape === "wide";
  const w = 1024;
  const h = wide ? 512 : 1024;
  const cx = w / 2;
  const cy = h / 2;
  const r = wide ? 92 : 124;
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
        `<polygon points="${pentagon(cx + dx * k, cy + dy * k, size * k)}" fill="${ink.mat}"/>`,
    )
    .join("");
  // The seam leans like the dock and the card stacks: top 60% across, bottom 40% across.
  const top = w * 0.6;
  const bottom = w * 0.4;
  const half = (id: string, team: CoverTeam, points: string, dx: number) =>
    `<clipPath id="${id}"><polygon points="${points}"/></clipPath>
<g clip-path="url(#${id})">
<g transform="translate(${dx} 6)" opacity="0.22">${flagShapes(team.code, team.colour, w, h)}</g>
<g mask="url(#screen)">${flagShapes(team.code, team.colour, w, h)}</g>
</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
<defs>
<pattern id="dots" width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="5.5" cy="5.5" r="4.9" fill="white"/></pattern>
<mask id="screen"><rect width="${w}" height="${h}" fill="url(#dots)"/></mask>
<pattern id="fine" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(15)"><circle cx="3.5" cy="3.5" r="2.4" fill="${ink.ink}"/></pattern>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0"/></filter>
</defs>
<rect width="${w}" height="${h}" fill="${ink.mat}"/>
${half("home", home, `0,0 ${top},0 ${bottom},${h} 0,${h}`, -7)}
${half("away", away, `${top},0 ${w},0 ${w},${h} ${bottom},${h}`, 7)}
<line x1="${top}" y1="0" x2="${bottom}" y2="${h}" stroke="${ink.mat}" stroke-width="14"/>
<line x1="${top + 9}" y1="0" x2="${bottom + 9}" y2="${h}" stroke="${ink.cyan}" stroke-width="3" opacity="0.8"/>
<circle cx="${cx + 6}" cy="${cy + 5}" r="${r}" fill="${ink.pink}" opacity="0.55"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ink.mat}"/>
<circle cx="${cx}" cy="${cy}" r="${r - 4}" fill="url(#fine)"/>
${patches}
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ink.cyan}" stroke-width="5"/>
<rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.35"/>
</svg>`;
}

const coverCache = new Map<string, string>();

/**
 * The fixture's cover art: a generated cover from match-art.json when one is listed there, else the riso
 * flag print drawn here from the fixture's two teams.
 */
export function matchArtUrl(slug: string, shape: CoverShape = "card"): string {
  const generated = shape === "card" ? matchArt[slug] : undefined;
  if (generated) return generated;
  const key = `${slug}:${shape}`;
  const hit = coverCache.get(key);
  if (hit) return hit;
  const fixture = fixtureBySlug(slug);
  const fallback = { code: "BIF", colour: palette().pink };
  const url = svgDataUrl(coverSvg(fixture?.home ?? fallback, fixture?.away ?? fallback, shape));
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
