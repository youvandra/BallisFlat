// Generates one action figure per player (faceless, team kit, a pose for the position) with Stable Image
// Ultra on Amazon Bedrock. Claude on Bedrock checks each image (one player, one ball, believable anatomy,
// no face detail, no logos or text, whole body in frame) and a failed image is redrawn with a new seed, up
// to --tries times. A passing image gets its background removed, is shrunk to a transparent PNG, uploaded
// to S3 (served by CloudFront) and recorded in packages/config/src/player-art.json. The app lays the
// cutout over its own halftone background, so background and framing always match the brand.
// A player with no passing image keeps the number art.
//
//   node scripts/gen-art.ts --only "ENG:Bukayo Saka,CRO:Luka Modrić"   a few players (spike)
//   node scripts/gen-art.ts --limit 20                                 the first 20 missing
//   node scripts/gen-art.ts                                            every missing player
//   node scripts/gen-art.ts --matches                                  match cover art (one per fixture)
//   flags: --force (redo existing), --tries N (default 4), --dry (print prompts only)
//
// Env: ART_BUCKET (private S3 bucket), ART_BASE_URL (the CloudFront origin serving its players/ prefix).
// AWS credentials from ~/.aws. Every attempt costs Bedrock credit: spike with --only first.

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { fixtures } from "../packages/config/src/fixtures.ts";
import type { Player, Team } from "../packages/config/src/fixtures.types.ts";
import { artKey } from "../packages/config/src/player-art.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "packages/config/src/player-art.json");
const matchManifestPath = resolve(root, "packages/config/src/match-art.json");
const previewDir = resolve(root, "scripts/.art-preview");

const region = "us-west-2";
const imageModel = "stability.stable-image-ultra-v1:1";
const judgeModel = "us.anthropic.claude-sonnet-4-6";
const cutoutModel = "us.stability.stable-image-remove-background-v1:0";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const only = value("only")
  ?.split(",")
  .map((item) => item.trim());
const limit = Number(value("limit") ?? Number.POSITIVE_INFINITY);
const tries = Number(value("tries") ?? 4);

/** Kits as plain words: image models do not read hex. Colours only, no crests or sponsor marks. */
const kits: Record<string, string> = {
  ENG: "white shirt and navy shorts",
  CRO: "red and white checkered shirt and white shorts",
  NIR: "green shirt and white shorts",
  UKR: "yellow shirt and blue shorts",
  ESP: "red shirt and navy shorts",
  HUN: "red shirt and white shorts",
  IRL: "green shirt and white shorts",
  KVX: "royal blue shirt and blue shorts",
  WAL: "red shirt and red shorts",
  POR: "dark red shirt and green shorts",
};

/** Each side's colours as smoke, for the match covers. */
const flares: Record<string, string> = {
  ENG: "white",
  CRO: "red and white",
  NIR: "emerald green",
  UKR: "yellow and blue",
  ESP: "red and gold",
  HUN: "red and green",
  IRL: "green",
  KVX: "royal blue and gold",
  WAL: "deep red",
  POR: "dark red and green",
};

/**
 * Action poses per position, each one physically possible and saying where the one ball is. A player
 * gets one, fixed by their name, so reruns match.
 */
const poses: Record<Player["position"], string[]> = {
  GK: [
    "goalkeeper diving sideways at full stretch, body horizontal above the grass, both gloved hands on the ball",
    "goalkeeper leaping straight up, one arm high, his fist punching the ball away",
    "goalkeeper crouched ready, knees bent, gloves open in front of his chest, the ball on the grass ahead",
  ],
  DF: [
    "defender in a sliding tackle along the grass, one leg stretched out, boot sole on the ball",
    "defender jumping for a header, both feet off the ground, forehead meeting the ball",
    "defender lunging to block, one leg planted, the other stretched sideways, the ball hitting his shin",
  ],
  MF: [
    "midfielder striking a volley, standing leg planted, kicking leg swung at hip height into the ball",
    "midfielder dribbling at speed, leaning forward, the ball at his toes",
    "midfielder after a long pass, standing foot planted, kicking leg in follow-through, the ball flying away low",
  ],
  FW: [
    "striker doing an overhead bicycle kick, back parallel to the grass, kicking leg high above his head meeting the ball, arms spread",
    "striker celebrating a goal, sliding on both knees, torso upright, arms spread wide, no ball",
    "striker about to shoot, standing foot beside the ball, kicking leg drawn back, arms out for balance",
  ],
};

/** What an image must not contain: faces, brands, numbers, frames, a light paper look, broken bodies. */
const negative =
  "two balls, multiple balls, extra ball, floating balls, two players, crowd, extra legs, extra arms, missing limbs, fused legs, twisted limbs, backward knees, broken joints, deformed hands, deformed boots, detailed face, eyes, nose, mouth, portrait, photograph, photorealistic, nike, adidas, swoosh, brand logo, crest, badge, sponsor, number, digits, text, letters, watermark, signature, border, frame, poster margin, paper texture, light background, white background";

/**
 * Cross-region profiles (us.*) sometimes route to us-east-1, which refuses this account with "Error 002";
 * the same call usually lands in a region that accepts it on the next try.
 */
async function routed<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      const refused = error instanceof Error && error.message.includes("Error 002");
      if (!refused || attempt >= 8) throw error;
      await new Promise((done) => setTimeout(done, 1500 * (attempt + 1)));
    }
  }
}

function hash(text: string): number {
  let h = 2166136261;
  for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}

function prompt(player: Player, team: Team): string {
  const options = poses[player.position];
  const pose = options[hash(player.name) % options.length];
  return [
    `Flat vector silhouette illustration of a single football player, ${pose}.`,
    `Shirt filled with one solid flat colour, ${kits[team.code] ?? "plain shirt"}, completely plain fabric with no logos, no badge, no stripes, no numbers.`,
    "Head, hair, face, arms and legs are one solid dark navy silhouette shape with no facial features and no inner detail.",
    "Minimal flat shapes, crisp clean edges, no outlines inside the figure, no texture, no gradients.",
    "Exactly one ball. Natural anatomy, two arms, two legs. Whole body in frame. Plain flat light grey background.",
  ].join(" ");
}

const rubric = `You check one generated illustration of a football player that will be cut out of its background. Pass it only if ALL hold:
1. Exactly one person.
2. At most one football (none is fine only for a knee-slide celebration).
3. Believable anatomy: two arms, two legs, joints bend the natural way, no fused, missing or extra limbs, hands and boots not mangled.
4. The pose is physically possible and the ball, if any, is where the action implies: touching or just leaving the body part using it.
5. No readable facial features: the face is in shadow, blank or turned away.
6. No logos, brand marks, crests, numbers, letters or signatures on the player, kit or anywhere else.
7. The whole body is inside the frame (head, hands and boots not cut off).
Ignore the background and the colours. Reply with only JSON: {"pass": true|false, "problems": ["short reason", ...]}`;

/** Claude's verdict on one image. */
async function judge(
  bedrock: BedrockRuntimeClient,
  bytes: Buffer,
  check = rubric,
): Promise<{ pass: boolean; problems: string[] }> {
  const response = await routed(() =>
    bedrock.send(
      new ConverseCommand({
        modelId: judgeModel,
        messages: [
          {
            role: "user",
            content: [{ image: { format: "jpeg", source: { bytes } } }, { text: check }],
          },
        ],
        inferenceConfig: { maxTokens: 300 },
      }),
    ),
  );
  const text = response.output?.message?.content?.find((part) => "text" in part)?.text ?? "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return { pass: false, problems: [`unreadable verdict: ${text.slice(0, 80)}`] };
  const verdict = JSON.parse(json) as { pass?: boolean; problems?: string[] };
  return { pass: verdict.pass === true, problems: verdict.problems ?? [] };
}

/** One Ultra image, or null when Bedrock's safety filter drops it. */
async function draw(bedrock: BedrockRuntimeClient, text: string, seed: number): Promise<Buffer | null> {
  const response = await routed(() =>
    bedrock.send(
      new InvokeModelCommand({
        modelId: imageModel,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          prompt: text,
          negative_prompt: negative,
          seed,
          aspect_ratio: "4:5",
          output_format: "jpeg",
        }),
      }),
    ),
  );
  const body = JSON.parse(new TextDecoder().decode(response.body)) as {
    images?: string[];
    finish_reasons?: (string | null)[];
  };
  const image = body.images?.[0];
  return image && !body.finish_reasons?.[0] ? Buffer.from(image, "base64") : null;
}

/** The figure on a transparent background, as PNG. */
async function cutout(bedrock: BedrockRuntimeClient, bytes: Buffer): Promise<Buffer | null> {
  const response = await routed(() =>
    bedrock.send(
      new InvokeModelCommand({
        modelId: cutoutModel,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({ image: bytes.toString("base64"), output_format: "png" }),
      }),
    ),
  );
  const body = JSON.parse(new TextDecoder().decode(response.body)) as { images?: string[] };
  const image = body.images?.[0];
  return image ? Buffer.from(image, "base64") : null;
}

/** Card art shows at about 300px wide, so ship 640px on the long edge (macOS sips). */
function shrink(file: string): Buffer {
  const out = file.replace(/\.png$/, ".web.png");
  execFileSync("sips", ["-Z", "640", file, "--out", out], { stdio: "ignore" });
  return readFileSync(out);
}

const coverRubric = `You check one generated cover illustration for a football match card. Pass it only if ALL hold:
1. No people, faces or crowd figures you could recognise as individuals (a dark blurred crowd mass is fine).
2. No logos, brand marks, crests, flags with emblems, numbers, letters, scoreboards with text or signatures anywhere.
3. No frame, border, white margin or paper edge: the scene fills the whole image.
Reply with only JSON: {"pass": true|false, "problems": ["short reason", ...]}`;

/**
 * The house print over a cover: a riso halftone screen, pink light from the top left, cyan from the bottom
 * right and a dark vignette, so every cover sits on the mat like the rest of the app.
 */
async function brandCover(bytes: Buffer): Promise<Buffer> {
  const size = 1024;
  const dots = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><pattern id="d" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(22)"><circle cx="3.5" cy="3.5" r="1.6" fill="#141416"/></pattern></defs><rect width="100%" height="100%" fill="url(#d)" opacity="0.55"/></svg>`;
  const tint = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><radialGradient id="p" cx="0" cy="0" r="0.9"><stop offset="0" stop-color="#FF4FA3" stop-opacity="0.55"/><stop offset="1" stop-color="#FF4FA3" stop-opacity="0"/></radialGradient><radialGradient id="c" cx="1" cy="1" r="0.9"><stop offset="0" stop-color="#3FE0FF" stop-opacity="0.45"/><stop offset="1" stop-color="#3FE0FF" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#p)"/><rect width="100%" height="100%" fill="url(#c)"/></svg>`;
  const vignette = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><radialGradient id="v" cx="0.5" cy="0.55" r="0.75"><stop offset="0.55" stop-color="#141416" stop-opacity="0"/><stop offset="1" stop-color="#141416" stop-opacity="0.85"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#v)"/></svg>`;
  const printed = await sharp(bytes)
    .resize(size, size)
    .modulate({ saturation: 1.15 })
    .composite([
      { input: Buffer.from(tint), blend: "screen" },
      { input: Buffer.from(dots), blend: "multiply" },
      { input: Buffer.from(vignette), blend: "over" },
    ])
    .png()
    .toBuffer();
  return sharp(printed).resize(900, 900).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
}

/** Match covers: a floodlit stadium where the two sides' colours collide as smoke. */
async function matchCovers(bedrock: BedrockRuntimeClient, s3: S3Client, bucket: string, baseUrl: string) {
  const done = JSON.parse(readFileSync(matchManifestPath, "utf8")) as Manifest;
  for (const fixture of fixtures) {
    if (done[fixture.slug] && !flag("force")) continue;
    if (only && !only.includes(fixture.slug)) continue;
    const home = flares[fixture.home.code] ?? "white";
    const away = flares[fixture.away.code] ?? "white";
    const text = [
      "Square graphic poster illustration, not a photograph. Low angle on a dark football pitch at night;",
      "the stands are lost in black shadow and smoke, so nothing is visible beyond the pitch.",
      `A huge cloud of ${home} smoke billows in from the left and a cloud of ${away} smoke from the right,`,
      "colliding above a single football on the centre spot, sparks flying.",
      "Coarse halftone dot texture over everything, hot pink and cyan rim light, deep black background,",
      "bold flat colour shapes, high contrast, modern.",
    ].join(" ");
    let accepted: Buffer | null = null;
    for (let attempt = 0; attempt < tries && !accepted; attempt++) {
      const seed = (hash(`cover:${fixture.slug}`) + attempt * 7919) % 4294967294;
      const response = await routed(() =>
        bedrock.send(
          new InvokeModelCommand({
            modelId: imageModel,
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({
              prompt: text,
              negative_prompt:
                "stadium stands, seats, advertising boards, crowd, people, player, face, text, letters, numbers, scoreboard, logo, crest, flag emblem, watermark, signature, border, frame, white margin, paper edge",
              seed,
              aspect_ratio: "1:1",
              output_format: "jpeg",
            }),
          }),
        ),
      );
      const body = JSON.parse(new TextDecoder().decode(response.body)) as {
        images?: string[];
        finish_reasons?: (string | null)[];
      };
      const image = body.images?.[0];
      if (!image || body.finish_reasons?.[0]) continue;
      const bytes = Buffer.from(image, "base64");
      writeFileSync(resolve(previewDir, `cover-${fixture.slug}.try${attempt}.jpg`), bytes);
      const verdict = await judge(bedrock, bytes, coverRubric);
      appendFileSync(
        resolve(previewDir, "judge.log"),
        `cover-${fixture.slug} #${attempt} ${verdict.pass ? "PASS" : "FAIL"} ${verdict.problems.join("; ")}\n`,
      );
      if (verdict.pass) accepted = bytes;
    }
    if (!accepted) {
      console.warn(`  ${fixture.slug}: no cover passed in ${tries} tries`);
      continue;
    }
    const file = resolve(previewDir, `cover-${fixture.slug}.jpg`);
    writeFileSync(file, accepted);
    const web = file.replace(/\.jpg$/, ".web.jpg");
    writeFileSync(web, await brandCover(accepted));
    const objectKey = `matches/${fixture.slug}.jpg`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: readFileSync(web),
        ContentType: "image/jpeg",
        CacheControl: "public, max-age=300",
      }),
    );
    const latest = JSON.parse(readFileSync(matchManifestPath, "utf8")) as Manifest;
    latest[fixture.slug] = `${baseUrl}/${objectKey}`;
    writeFileSync(matchManifestPath, `${JSON.stringify(latest, null, 2)}\n`);
    console.log(`  cover ${fixture.slug}`);
  }
}

type Manifest = Record<string, string>;
function readManifest(): Manifest {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

async function main() {
  const players = new Map<string, { player: Player; team: Team }>();
  for (const fixture of fixtures) {
    for (const player of fixture.players) {
      const team = player.side === "home" ? fixture.home : fixture.away;
      players.set(artKey(team.code, player.name), { player, team });
    }
  }

  const manifest = readManifest();
  let todo = [...players.entries()];
  if (only) todo = todo.filter(([, { player, team }]) => only.includes(`${team.code}:${player.name}`));
  if (!flag("force")) todo = todo.filter(([key]) => !manifest[key]);
  todo = todo.slice(0, limit);
  console.log(`${todo.length} to draw (${players.size} players, ${Object.keys(manifest).length} done)`);
  if (flag("dry")) {
    for (const [key, { player, team }] of todo) console.log(key, prompt(player, team));
    return;
  }

  const bucket = process.env.ART_BUCKET;
  const baseUrl = process.env.ART_BASE_URL;
  if (!bucket || !baseUrl) throw new Error("ART_BUCKET and ART_BASE_URL are required");
  const bedrock = new BedrockRuntimeClient({ region, maxAttempts: 10, retryMode: "adaptive" });
  const s3 = new S3Client({ region });
  mkdirSync(previewDir, { recursive: true });
  if (flag("matches")) return matchCovers(bedrock, s3, bucket, baseUrl);
  const log = resolve(previewDir, "judge.log");

  let passed = 0;
  for (const [index, [key, { player, team }]] of todo.entries()) {
    const text = prompt(player, team);
    let accepted: Buffer | null = null;
    for (let attempt = 0; attempt < tries && !accepted; attempt++) {
      const seed = (hash(`${team.code}:${player.name}`) + attempt * 7919) % 4294967294;
      const bytes = await draw(bedrock, text, seed);
      if (!bytes) {
        appendFileSync(log, `${key} #${attempt} filtered\n`);
        continue;
      }
      writeFileSync(resolve(previewDir, `${key}.try${attempt}.jpg`), bytes);
      const verdict = await judge(bedrock, bytes);
      appendFileSync(
        log,
        `${key} #${attempt} ${verdict.pass ? "PASS" : "FAIL"} ${verdict.problems.join("; ")}\n`,
      );
      if (verdict.pass) accepted = bytes;
    }
    if (!accepted) {
      console.warn(`  ${index + 1}/${todo.length} ${key}: no image passed in ${tries} tries`);
      continue;
    }
    const png = await cutout(bedrock, accepted);
    if (!png) {
      console.warn(`  ${index + 1}/${todo.length} ${key}: background removal failed`);
      continue;
    }
    const file = resolve(previewDir, `${key}.png`);
    writeFileSync(file, png);
    const objectKey = `players/${key}.png`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: shrink(file),
        ContentType: "image/png",
        CacheControl: "public, max-age=300",
      }),
    );
    const latest = readManifest();
    latest[key] = `${baseUrl}/${objectKey}`;
    writeFileSync(manifestPath, `${JSON.stringify(latest, null, 2)}\n`);
    passed++;
    console.log(`  ${index + 1}/${todo.length} ${key}`);
  }
  console.log(`${passed}/${todo.length} passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
