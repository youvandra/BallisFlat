// Re-encodes every player cut-out in packages/config/src/player-art.json as a 512px WebP (about a fifth of the
// PNG), uploads it next to the PNG on the art bucket and points the manifest at it. Idempotent: entries that
// already end in .webp are skipped. Run: ART_BUCKET=... ART_BASE_URL=... node scripts/art-webp.ts
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "packages/config/src/player-art.json");
const bucket = process.env.ART_BUCKET ?? "";
const baseUrl = (process.env.ART_BASE_URL ?? "").replace(/\/$/, "");
if (!bucket || !baseUrl) throw new Error("ART_BUCKET and ART_BASE_URL are required");

const s3 = new S3Client({ region: "us-west-2" });
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, string>;
let before = 0;
let after = 0;
for (const [key, url] of Object.entries(manifest)) {
  if (new URL(url).pathname.endsWith(".webp")) continue;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${key}: ${response.status} for ${url}`);
  const png = Buffer.from(await response.arrayBuffer());
  const webp = await sharp(png)
    .resize({ width: 512, withoutEnlargement: true })
    .webp({ quality: 80, alphaQuality: 90 })
    .toBuffer();
  const objectKey = `players/${key}.webp`;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: webp,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  // a cache-busting query keeps a redrawn player from showing a stale cached image
  manifest[key] = `${baseUrl}/${objectKey}?v=${Date.now().toString(36)}`;
  before += png.length;
  after += webp.length;
  console.log(`${key} ${Math.round(png.length / 1024)}KB -> ${Math.round(webp.length / 1024)}KB`);
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`total ${Math.round(before / 1024)}KB -> ${Math.round(after / 1024)}KB`);
