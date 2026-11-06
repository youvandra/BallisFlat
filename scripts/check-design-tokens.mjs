#!/usr/bin/env node
// Fails when design values bypass the token file: hex colours in TS/TSX, Tailwind
// arbitrary values (text-[13px], bg-[#123456]) and Tailwind default palette classes.
// Our audit (research/code-primary.md) found these, not copied code, are how our UIs
// drift: TrustPool carried 374 arbitrary values when it was rejected as MVP-looking.
//
//   node scripts/check-design-tokens.mjs apps/web/src [--allow src/video/theme.ts]

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const args = process.argv.slice(2);
const root = args[0] ?? "src";
const allowed = new Set();
for (let i = 1; i < args.length; i += 1) if (args[i] === "--allow" && args[i + 1]) allowed.add(args[++i]);

const RULES = [
  { name: "hex colour outside tokens", pattern: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g },
  { name: "Tailwind arbitrary value", pattern: /\b[a-z-]+-\[(?:#|[0-9.]+(?:px|rem|em|%|ms|s)\b)[^\]]*\]/g },
  {
    name: "Tailwind default palette",
    pattern: /\b(?:bg|text|border|ring|fill|stroke|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
  },
];

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(tsx?|jsx?)$/.test(entry) && !/\.test\./.test(entry)) yield path;
  }
}

const findings = [];
for (const file of sourceFiles(root)) {
  const rel = relative(process.cwd(), file);
  // An allowed path is a file or a folder (vendor code copied verbatim, e.g. apps/web/src/framer).
  if ([...allowed].some((path) => rel === path || file === path || rel.startsWith(`${path}/`))) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      for (const match of line.matchAll(rule.pattern)) findings.push(`${file}:${index + 1}  ${rule.name}: ${match[0]}`);
    }
  });
}

if (findings.length) {
  console.error(findings.join("\n"));
  console.error(`\n${findings.length} design value(s) bypass tokens.css. Add a token and use its utility.`);
  process.exit(1);
}
console.log(`design tokens: clean (${root})`);
