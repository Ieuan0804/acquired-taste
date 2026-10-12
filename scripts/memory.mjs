#!/usr/bin/env node
// Memory across projects: what each site used (fonts, palette, concept, hero, starting picks)
// and what the user kept or rejected, so the next site doesn't repeat itself and leans towards
// what the user liked. Plain JSONL records, one line each, one file per person (so a shared
// git folder never conflicts), plus a short rules.md condensed from them over time.
//
//   node memory.mjs summary [--type landing]     what to avoid and what's been liked (read at the design read)
//   node memory.mjs add <record.json>            record a finished project (see the fields below)
//   node memory.mjs verdict --project <name> --keep|--reject --what "<item>" [--reason "<why>"]
//   node memory.mjs where                        print the memory folder
//
// Record fields: { "project": "Ledgerline", "type": "landing", "fonts": ["Archivo", "Source Sans 3"],
//   "palette": { "background": "#f6f1e7", "accent": "#e2531f" }, "concept": "spirit level",
//   "hero": "split, photo right", "seed": { ... } }
//
// Folder: $ACQUIRED_TASTE_MEMORY, or ~/.acquired-taste/memory.

import { readFileSync, appendFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, userInfo } from "node:os";

export const MEMORY = process.env.ACQUIRED_TASTE_MEMORY || join(homedir(), ".acquired-taste", "memory");
const mine = join(MEMORY, `${(userInfo().username || "user").replace(/[^\w.-]/g, "_")}.jsonl`);

export function readAll() {
  if (!existsSync(MEMORY)) return [];
  return readdirSync(MEMORY).filter((f) => f.endsWith(".jsonl")).flatMap((f) =>
    readFileSync(join(MEMORY, f), "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

function append(record) {
  mkdirSync(MEMORY, { recursive: true });
  appendFileSync(mine, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`);
}

// The fonts, concepts and starting picks of recent projects, newest first.
export function recentProjects(type, n = 10) {
  const projects = readAll().filter((r) => r.kind === "project");
  const sameType = type ? projects.filter((p) => p.type === type) : projects;
  return { all: projects.slice(-n).reverse(), sameType: sameType.slice(-n).reverse() };
}

function summary(type) {
  const records = readAll();
  if (!records.length) return console.log(`Memory is empty (${MEMORY}). This is the first project: no history to avoid yet.`);
  const { all, sameType } = recentProjects(type, 10);
  const count = (list) => Object.entries(list.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  const out = [];

  out.push(`Memory: ${records.length} records in ${MEMORY}`);
  out.push("", "Recent projects (newest first):");
  for (const p of all.slice(0, 8)) out.push(`- ${String(p.at).slice(0, 10)} ${p.project} (${p.type}): fonts ${(p.fonts ?? []).join(" + ") || "?"}; concept ${p.concept ?? "?"}; hero ${p.hero ?? "?"}`);

  // Variety only matters between similar projects: a font used on a landing page must not block
  // it for an app (2026-10-11: the rota app excluded Figtree, Instrument Sans and Hanken Grotesk,
  // all used on websites, and ended up with a dated mono-heavy pairing).
  const PRODUCT = ["app-screens", "dashboard"];
  const group = (t) => (PRODUCT.includes(t) ? "product" : "marketing");
  const similar = type ? all.filter((p) => group(p.type) === group(type)) : all;
  const fonts = count(similar.flatMap((p) => p.fonts ?? []));
  if (fonts.length) {
    out.push("", `Fonts used on recent ${type ? (group(type) === "product" ? "apps and dashboards" : "websites") : "projects"}. Suit the brief first; when another font fits as well, prefer it over these:`);
    out.push(fonts.map(([f, c]) => `${f} (${c}x)`).join(", "));
    if (type) out.push(`Fonts used only on ${group(type) === "product" ? "websites" : "apps and dashboards"} are fine to use here.`);
  }
  const last = similar[0];
  if (last) out.push(`Never repeat the previous ${type ? "similar " : ""}project's fonts (${(last.fonts ?? []).join(" + ")}) unless the brief clearly needs them; say why if you do.`);
  if (type && sameType.length) {
    out.push("", `Recent ${type} concepts and heroes (find a different angle):`);
    for (const p of sameType.slice(0, 5)) out.push(`- ${p.concept ?? "?"} / ${p.hero ?? "?"}`);
  }

  const verdicts = records.filter((r) => r.kind === "verdict");
  const kept = verdicts.filter((v) => v.keep).slice(-12).reverse();
  const rejected = verdicts.filter((v) => !v.keep).slice(-12).reverse();
  if (kept.length) { out.push("", "The user kept (can reuse on similar briefs, never twice in a row):"); for (const v of kept) out.push(`- ${v.what} (${v.project})${v.reason ? `: ${v.reason}` : ""}`); }
  if (rejected.length) { out.push("", "The user rejected (avoid on similar briefs):"); for (const v of rejected) out.push(`- ${v.what} (${v.project})${v.reason ? `: ${v.reason}` : ""}`); }

  const rules = join(MEMORY, "rules.md");
  if (existsSync(rules)) out.push("", "Rules learned so far:", readFileSync(rules, "utf8").trim());
  if (verdicts.length >= 20 && (!existsSync(rules) || verdicts.length % 20 === 0)) {
    out.push("", `Time to condense: ${verdicts.length} verdicts. After this project, rewrite ${rules} as at most 15 short rules ("avoid techy grotesques for food brands"), merging the verdicts above.`);
  }
  console.log(out.join("\n"));
}

const isCli = resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
const args = isCli ? process.argv.slice(2) : [];
const opt = (n) => { const i = args.indexOf(`--${n}`); return i === -1 ? undefined : args[i + 1]; };
const [command] = args;

if (command === "summary") summary(opt("type"));
else if (command === "where") console.log(MEMORY);
else if (command === "add") {
  const file = args[1];
  if (!file || !existsSync(file)) { console.error("Usage: node memory.mjs add <record.json>"); process.exit(1); }
  const record = JSON.parse(readFileSync(file, "utf8"));
  append({ kind: "project", ...record });
  console.log(`Recorded ${record.project ?? "project"} in ${mine}`);
} else if (command === "verdict") {
  const keep = args.includes("--keep"), reject = args.includes("--reject");
  if (!opt("project") || !opt("what") || keep === reject) { console.error('Usage: node memory.mjs verdict --project <name> --keep|--reject --what "<item>" [--reason "<why>"]'); process.exit(1); }
  append({ kind: "verdict", project: opt("project"), keep, what: opt("what"), reason: opt("reason") });
  console.log(`Recorded: ${keep ? "kept" : "rejected"} ${opt("what")}`);
} else if (command) {
  console.error("Usage: node memory.mjs summary [--type t] | add <record.json> | verdict ... | where");
  process.exit(1);
}
