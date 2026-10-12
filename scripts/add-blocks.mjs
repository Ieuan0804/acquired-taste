#!/usr/bin/env node
// Copies tested motion blocks into a project (only the ones you name).
//
//   node add-blocks.mjs <block> [block ...] [--to lib/motion] [--css app]
//
// Blocks: reveal, counter, pointer (magnetic, tilt, cursor), scroll (parallax, scene,
// progress), marquee, smooth (Lenis; also run: npm i lenis), depth (CSS kit), all.

import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "blocks", "motion");
const args = process.argv.slice(2);
const take = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args.splice(i, 2)[1];
};
const to = resolve(take("to", join("lib", "motion")));
const cssDir = resolve(take("css", "app"));
const ALL = ["reveal", "counter", "pointer", "scroll", "marquee", "smooth", "depth"];
const wanted = args.includes("all") ? ALL : args;
const unknown = wanted.filter((b) => !ALL.includes(b));
if (!wanted.length || unknown.length) {
  console.error(`Usage: node add-blocks.mjs <block> [...] (choose from: ${ALL.join(", ")}, all)${unknown.length ? `\nUnknown: ${unknown.join(", ")}` : ""}`);
  process.exit(1);
}

mkdirSync(to, { recursive: true });
copyFileSync(join(SRC, "env.ts"), join(to, "env.ts"));
const added = ["env.ts"];
for (const b of wanted) {
  if (b === "depth") {
    mkdirSync(cssDir, { recursive: true });
    copyFileSync(join(SRC, "depth.css"), join(cssDir, "depth.css"));
    added.push(join(cssDir, "depth.css"));
  } else {
    copyFileSync(join(SRC, `${b}.ts`), join(to, `${b}.ts`));
    added.push(`${b}.ts`);
  }
}
console.log(`Added to ${to}: ${added.join(", ")}`);
if (wanted.includes("depth")) console.log(`Import the depth kit once: @import "./depth.css"; in your global stylesheet (after @import "tailwindcss").`);
if (wanted.includes("smooth") && !existsSync(join("node_modules", "lenis"))) console.log("Smooth scroll needs Lenis: npm i lenis");
console.log('Use them in "use client" components: useEffect(() => reveal(ref.current!, { mode: "words" }), []).');
