#!/usr/bin/env node
// Fails when the app strays from docs/design-rules.md (the Framer project's rules): monospace type,
// uppercase or letter-spaced labels, soft shadows, radii Framer never uses, colours outside the nine
// colour styles, and type sizes that bypass the eight presets. The verbatim Framer components in
// src/framer are skipped; everything else must follow the rules.
//
//   node scripts/check-design-rules.mjs apps/web/src --skip apps/web/src/framer

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const args = process.argv.slice(2);
const root = args[0] ?? "apps/web/src";
const skipped = [];
for (let i = 1; i < args.length; i += 1) if (args[i] === "--skip" && args[i + 1]) skipped.push(args[++i]);

/** Radii read from Framer: legend swatch, sticky note, input, card, nav card/sleeve, zone, drawer, field, pill. */
const radii = new Set([0, 3, 6, 12, 14, 16, 18, 24, 28, 100]);
/** The nine colour styles (and white for labels on pink), as rgb channels; alpha is free. */
const palette = new Set(
  ["20 20 22", "30 30 35", "242 242 238", "63 224 255", "255 232 0", "255 79 163", "255 255 255"].map(
    (c) => c,
  ),
);
const hexes = new Set(["#141416", "#1e1e23", "#f2f2ee", "#ffe800", "#ff4fa3", "#3fe0ff", "#ffffff", "#fff"]);
/** Submit / Error state, the one colour outside the nine. */
const errorChannels = "220 60 60";
const presets = new Set([
  "t-display",
  "t-heading",
  "t-title",
  "t-stat",
  "t-zone",
  "t-body-strong",
  "t-body",
  "t-small",
]);

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (skipped.some((skip) => path === skip || path.startsWith(`${skip}/`))) continue;
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(tsx?|css)$/.test(entry) && !/\.test\./.test(entry)) yield path;
  }
}

const channels = (raw) =>
  raw
    .replace(/,/g, " ")
    .split("/")[0]
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((n) => String(Math.round(Number(n))))
    .join(" ");

/** px value of a length like 14px / 0.5rem / 9999px; null when it is a var() or keyword. */
function px(value) {
  const m = value.trim().match(/^(-?[\d.]+)(px|rem)?$/);
  if (!m) return null;
  return m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
}

const checks = [
  {
    name: "monospace type",
    test: (line) => /font-mono|monospace|Geist Mono|--font-mono/.test(line),
  },
  {
    name: "uppercase label",
    test: (line) => /\buppercase\b|text-transform:\s*uppercase|textTransform:\s*"uppercase"/.test(line),
  },
  {
    name: "positive letter-spacing",
    test: (line) =>
      /tracking-(wide|wider|widest)\b/.test(line) ||
      /letter-spacing:\s*(0?\.\d*[1-9]|[1-9])/.test(line) ||
      /letterSpacing:\s*"(0?\.\d*[1-9]|[1-9])/.test(line),
  },
  {
    name: "soft shadow (blur > 0)",
    test: (line) => {
      if (/\bshadow-(sm|md|lg|xl|2xl|inner)\b/.test(line)) return true;
      const m = line.match(/box-shadow:\s*([^;]+)/) ?? line.match(/boxShadow:\s*[`"']([^`"']+)/);
      if (!m) return false;
      return m[1].split(/,(?![^(]*\))/).some((part) => {
        const nums = part
          .replace(/var\([^)]*\)|rgba?\([^)]*\)|#[0-9a-f]+/gi, "")
          .trim()
          .split(/\s+/)
          .map(px)
          .filter((n) => n !== null);
        return nums.length >= 3 && (nums[2] ?? 0) > 0;
      });
    },
  },
  {
    name: "radius outside the Framer set",
    test: (line) => {
      if (/\brounded(-(sm|md|lg|xl|2xl|3xl|full|none|t|b|l|r)\b|\s|"|$)/.test(line)) return true;
      const m =
        line.match(/border-radius:\s*([^;]+)/) ??
        line.match(/--radius-[a-z-]+:\s*([^;]+)/) ??
        line.match(/borderRadius:\s*([\d.]+)/);
      if (!m) return false;
      return m[1]
        .split(/\s+/)
        .map(px)
        .some((n) => n !== null && !radii.has(n));
    },
  },
  {
    name: "colour outside the nine colour styles",
    test: (line) => {
      for (const hex of line.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g) ?? []) {
        if (!hexes.has(hex.toLowerCase())) return true;
      }
      for (const m of line.matchAll(/rgba?\(([^)]*)\)/g)) {
        const c = channels(m[1] ?? "");
        if (c === "0 0 0" && /,\s*0\s*\)|\/\s*0\s*\)/.test(m[0])) continue; // transparent
        if (!palette.has(c) && c !== errorChannels) return true;
      }
      return false;
    },
  },
  {
    name: "type size outside the eight presets",
    test: (line, file) => {
      if (/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b|\btext-\[/.test(line)) return true;
      if (/\bfont-(thin|light|normal|medium|semibold|bold|extrabold|black)\b/.test(line)) return true;
      if (file.endsWith(".tsx")) {
        for (const m of line.matchAll(/\bt-[a-z-]+/g)) if (!presets.has(m[0])) return true;
      }
      return false;
    },
  },
];

const findings = [];
for (const file of files(root)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (/design-rules: allow/.test(line) || /design-rules: allow/.test(lines[index - 1] ?? "")) return;
    // Comments describe things ("rounded up", "rgb()"); only code counts.
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
    for (const check of checks) {
      if (check.test(line, file))
        findings.push(`${relative(process.cwd(), file)}:${index + 1}  ${check.name}: ${line.trim()}`);
    }
  });
}

if (findings.length) {
  console.error(findings.join("\n"));
  console.error(`\n${findings.length} line(s) break docs/design-rules.md.`);
  process.exit(1);
}
console.log(`design rules: clean (${root}, skipping ${skipped.join(", ") || "nothing"})`);
