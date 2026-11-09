// Writes the logo files the web app serves: logo-white.svg, logo-black.svg, favicon.svg,
// apple-touch-icon.png (180) and og.png (1200x630 link preview, cut from the designer's banner). Run: node scripts/brand-assets.ts
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { logo, logoSvg } from "../packages/config/src/brand.ts";
import { product } from "../packages/config/src/constants.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pub = resolve(root, "apps/web/public");

// Same values as apps/web/src/styles/tokens.css.
const color = { bg: "#141416", ink: "#f2f2ee", pink: "#ff4fa3", cyan: "#3fe0ff", black: "#0b0b0b" };

/** The logo path placed inside a box, centred, `width` wide. */
function placed(x: number, y: number, width: number, fill: string): string {
  const scale = width / logo.width;
  const left = x - width / 2;
  const top = y - (logo.height * scale) / 2;
  return `<path transform="translate(${left.toFixed(2)} ${top.toFixed(2)}) scale(${scale.toFixed(4)})" fill="${fill}" fill-rule="evenodd" d="${logo.path}"/>`;
}

function square(size: number, radius: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><title>${product.name}</title><rect width="${size}" height="${size}" rx="${radius}" fill="${color.pink}"/>${placed(size / 2, size / 2, size * 0.92, color.black)}</svg>`;
}

// The link preview is the designer's banner (docs/media/banner.webp, 1500x500), scaled to 630 high and cut to the
// headline, so the 1200x630 card carries "Mint your take on the game." with nothing sliced at the edges.
const banner = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/media/banner.webp");

writeFileSync(resolve(pub, "logo-white.svg"), logoSvg("#ffffff"));
writeFileSync(resolve(pub, "logo-black.svg"), logoSvg(color.black));
writeFileSync(resolve(pub, "favicon.svg"), `${square(64, 14)}\n`);
await sharp(Buffer.from(square(180, 0)))
  .png()
  .toFile(resolve(pub, "apple-touch-icon.png"));
await sharp(banner)
  .resize({ height: 630 })
  .extract({ left: 690, top: 0, width: 1200, height: 630 })
  .png()
  .toFile(resolve(pub, "og.png"));
console.log("wrote logo-white.svg, logo-black.svg, favicon.svg, apple-touch-icon.png, og.png");
