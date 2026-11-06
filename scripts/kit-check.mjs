#!/usr/bin/env node
// Audits a hackathon repo (and optionally its live site) against the kit's checklists.
// Each line is PASS, WARN or FAIL with the file that owns the rule.
//
//   node scripts/kit-check.mjs ../cordon [--url https://example.com] [--web apps/web/src]

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const repo = args[0];
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
if (!repo || !existsSync(repo)) {
  console.error("usage: node scripts/kit-check.mjs <repo> [--url <live site>] [--web <ui src dir>]");
  process.exit(2);
}

const results = [];
const report = (level, rule, detail, owner) => results.push({ level, rule, detail, owner });
const check = (ok, rule, detail, owner, level = "FAIL") => report(ok ? "PASS" : level, rule, detail, owner);

// Kept in step with 14-writing-for-judges.md §1.
const FILLER = ["platform", "seamless", "revolutionary", "leverage", "unlock", "empower", "robust",
  "cutting-edge", "next-generation", "web3-native", "game changer", "game-changer"];

function words(text) {
  return text.match(/[A-Za-z0-9'’-]+/g) ?? [];
}

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

// Flesch–Kincaid grade level.
function grade(text) {
  const sentences = Math.max(1, (text.match(/[.!?](\s|$)/g) ?? []).length);
  const ws = words(text);
  if (ws.length === 0) return 0;
  const syl = ws.reduce((n, w) => n + syllables(w), 0);
  return 0.39 * (ws.length / sentences) + 11.8 * (syl / ws.length) - 15.59;
}

function git(...cmd) {
  try {
    return execFileSync("git", ["-C", repo, ...cmd], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

// README (07, 11, 12, 14)
const readmePath = ["README.md", "readme.md", "Readme.md"].map((f) => join(repo, f)).find(existsSync);
if (!readmePath) {
  report("FAIL", "README exists", "no README.md", "07");
} else {
  const md = readFileSync(readmePath, "utf8");
  const prose = md.replace(/```[\s\S]*?```/g, "").replace(/<[^>]+>/g, "");
  const paragraphs = prose.split(/\n\s*\n/).map((p) => p.trim())
    .filter((p) => p && !p.startsWith("#") && !p.startsWith("![") && !p.startsWith("[!") && !/^\[.*\]\(.*\)$/.test(p) && !p.startsWith("|"));
  const opening = paragraphs[0] ?? "";
  const openingSentences = (opening.match(/[.!?](\s|$)/g) ?? []).length || 1;
  check(openingSentences <= 3, "Opening says what it does in ≤ 3 sentences", `${openingSentences} sentences`, "14", "WARN");
  check(/\d/.test(opening), "Opening carries a number", opening.slice(0, 90).replace(/\s+/g, " "), "12", "WARN");
  const g = grade(opening);
  check(g <= 12, "Opening readable (FK grade ≤ 12; target ≤ 9)", `grade ${g.toFixed(1)}`, "14", "WARN");
  check(!/\b(AI agents?|agentic)\b/i.test(opening.split(/[.!?]/)[0] ?? ""), "First sentence does not lead with the agent label", "", "12/16", "WARN");

  const lower = prose.toLowerCase();
  const filler = FILLER.filter((f) => lower.includes(f));
  check(filler.length === 0, "No banned filler words", filler.join(", "), "14", "WARN");
  const contrast = (prose.match(/,\s+not\s+\w+|\bnot just\b|\bnot only\b/gi) ?? []).length;
  check(contrast === 0, "No “X, not Y” contrast phrasing", `${contrast} found`, "14", "WARN");

  check(/https?:\/\/(?!github\.com)[^\s)]+/.test(md), "Live link", "", "07");
  check(/youtu\.?be|loom\.com|vimeo\.com|\.mp4/.test(md), "Video link", "", "07", "WARN");
  check(/0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{43,44}|0\.0\.\d{4,}/.test(md), "Deployed address listed", "", "07", "WARN");
  check(/architecture|how it works|how it's made|how it’s made/i.test(md), "Architecture / how it's made section", "", "12");
  check(/trust model|who can|privileged|admin key|operator/i.test(md), "Trust model stated", "", "19", "WARN");
  check(/```(?:bash|sh|shell)?\s*\n[\s\S]*?(npm|pnpm|bun|yarn|forge|anchor|cargo|make)\b/.test(md), "How to run locally", "", "07", "WARN");
  check(/prior art|related work|alternatives|compared to|competitor/i.test(md), "Prior art named", "", "07", "WARN");
  check(/\bAI use\b|built with (claude|ai)|AI assistance|AI-assisted/i.test(md), "AI-use disclosure (when the event requires it)", "", "11/13", "WARN");
  const hm = md.split(/\n#+\s*how (?:it'?s|it’s) (?:made|built)[^\n]*\n/i)[1];
  if (hm) {
    const n = words(hm.split(/\n#+\s/)[0]).length;
    check(n >= 150 && n <= 400, "How it's made 150–250 words", `${n} words`, "12", "WARN");
  }
}

// Repo hygiene (05, 07, 11)
const tracked = git("ls-files").split("\n").filter(Boolean);
const leaked = tracked.filter((f) => f === "CLAUDE.md" || f.startsWith(".claude/") || f.endsWith("/CLAUDE.md"));
check(leaked.length === 0, "CLAUDE.md / .claude/ never committed", leaked.slice(0, 3).join(", "), "owner rule");
const envs = tracked.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !/example|sample|template/.test(f));
check(envs.length === 0, "No .env committed", envs.join(", "), "09");
check(existsSync(join(repo, "LICENSE")) || existsSync(join(repo, "LICENSE.md")), "LICENSE present", "", "11", "WARN");
const tests = tracked.filter((f) => /(\.test\.|\.spec\.|\.t\.sol$|(^|\/)tests?\/)/.test(f) && !f.includes("node_modules"));
check(tests.length >= 5, "Tests on the core path", `${tests.length} test files`, "05/19", "WARN");
const coAuthor = git("log", "--format=%b").match(/Co-Authored-By: Claude/gi)?.length ?? 0;
check(coAuthor === 0, "No Claude co-author lines in history", `${coAuthor} commits`, "owner rule");

// Scaffold placeholders left in shipped files (starter/template)
const placeholderHits = tracked.concat(git("ls-files", "--others", "--exclude-standard").split("\n"))
  .filter((f) => /\.(html|tsx?|json)$/.test(f) && !f.includes("node_modules"))
  .filter((f) => existsSync(join(repo, f)) && /__[A-Z_]+__/.test(readFileSync(join(repo, f), "utf8")));
check(placeholderHits.length === 0, "No scaffold placeholders left", placeholderHits.slice(0, 3).join(", "), "21");
const ogImage = ["apps/web/public/og.png", "public/og.png"].some((f) => existsSync(join(repo, f)));
if (existsSync(join(repo, "apps/web/index.html"))) check(ogImage, "og.png present (1200×630)", "", "11");

// Commit history (07: ETHGlobal may disqualify single large commits)
const stat = git("log", "--no-merges", "--format=@@%H", "--shortstat");
const sizes = stat.split("@@").slice(1).map((b) => {
  const m = b.match(/(\d+) insertion/);
  return m ? Number(m[1]) : 0;
});
const total = sizes.reduce((a, b) => a + b, 0);
if (sizes.length) {
  const biggest = Math.max(...sizes);
  check(sizes.length >= 20, "Steady commit history", `${sizes.length} commits`, "07", "WARN");
  check(total === 0 || biggest / total < 0.3, "No single commit dominates", `largest = ${Math.round((100 * biggest) / (total || 1))}% of insertions`, "07", "WARN");
}

// Design tokens (03, 05)
const web = flag("--web");
if (web) {
  const guard = join(dirname(fileURLToPath(import.meta.url)), "check-design-tokens.mjs");
  let out = "";
  try {
    out = execFileSync("node", [guard, join(repo, web)], { encoding: "utf8" });
  } catch (e) {
    out = `${e.stdout ?? ""}`;
  }
  const n = Number(out.match(/(\d+) finding/)?.[1] ?? 0);
  check(n === 0, "Design values go through tokens", `${n} findings`, "03/05");
}

// Live site (09, 11)
const url = flag("--url");
if (url) {
  const start = Date.now();
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20000) });
    const html = await res.text();
    const ms = Date.now() - start;
    const meta = (p) => new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*>`, "i").test(html);
    check(res.ok, "Live site responds", `${res.status} in ${ms} ms`, "09");
    check(ms < 2500, "First byte to HTML under 2.5 s", `${ms} ms`, "03", "WARN");
    check(/<title>[^<]{3,}<\/title>/i.test(html), "Title tag", "", "11");
    check(meta("description") || meta("og:description"), "Meta description", "", "11");
    check(meta("og:image"), "og:image (1200×630)", "", "11");
    check(meta("twitter:card"), "twitter:card", "", "11", "WARN");
    check(/<link[^>]+rel=["'][^"']*icon/i.test(html), "Favicon", "", "11", "WARN");
  } catch (e) {
    report("FAIL", "Live site responds", String(e.message ?? e), "09");
  }
}

const order = { FAIL: 0, WARN: 1, PASS: 2 };
results.sort((a, b) => order[a.level] - order[b.level]);
for (const r of results) {
  console.log(`${r.level.padEnd(4)}  ${r.rule}${r.detail ? ` — ${r.detail}` : ""}  [${r.owner}]`);
}
const count = (l) => results.filter((r) => r.level === l).length;
console.log(`\n${count("PASS")} pass, ${count("WARN")} warn, ${count("FAIL")} fail`);
process.exit(count("FAIL") ? 1 : 0);
