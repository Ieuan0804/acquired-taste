#!/usr/bin/env node
// Real random starting picks for a new site, so two sites (or two runs of the same brief) don't
// begin from the same defaults. Asking the model to "be random" doesn't work: it converges
// (two Ledgerline runs came out nearly identical). These are a nudge, not orders: keep each pick
// unless it fights the brief, and say why when you change one. Picks used by the last project
// of the same type (from memory) are skipped so consecutive sites differ.
//
//   node seed.mjs [--type landing|ecommerce|local-business|app-screens|dashboard] [--seed N]
//
// Prints the picks and a JSON line to copy into the design system and the memory record.

import { randomInt } from "node:crypto";
import { recentProjects } from "./memory.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const type = opt("type", "landing");
const marketing = !["app-screens", "dashboard"].includes(type);

// Deterministic when --seed is given (to reproduce a run), otherwise truly random.
let state = Number(opt("seed", randomInt(1, 2 ** 31 - 1)));
const seed = state;
const next = () => { state = (state * 48271) % 2147483647; return state / 2147483647; };

const DIMENSIONS = marketing ? {
  hero: [
    "split: type on one side, the signature visual on the other",
    "full-bleed visual with the headline set over it",
    "type-led: an oversized headline is the visual, with a small supporting image or object",
    "offset collage: overlapping image, object and type at different depths",
    "the product or service itself, live and working, as the hero",
    "a single big number, word or object, with everything else small",
    "editorial: magazine-style grid with a strong image crop and a pull-quote",
  ],
  typeDirection: [
    "a characterful display face with a quiet, very readable body face",
    "one versatile family used at extremes of weight or width",
    "a serif display with a sans body",
    "a condensed or compressed display face",
    "a wide or extended display face",
    "a rounded or soft display face",
    "a mono or technical face for labels and numbers as the accent",
  ],
  typeScale: ["restrained (ratio ~1.2): calm, confident", "classic (ratio ~1.33)", "dramatic (ratio ~1.5): big contrast between headline and body", "poster (ratio ~1.75+): one huge moment per section"],
  colour: [
    "light and warm, with one strong accent",
    "light and cool, with one strong accent",
    "dark-led, with light sections for contrast",
    "mid-tone or tinted backgrounds (not white, not near-black)",
    "high-contrast bands: alternating strong colour and neutral sections",
    "mostly monochrome, with the brand colour used sparingly and boldly",
  ],
  rhythm: ["alternating full-width bands", "one continuous canvas with soft transitions", "stacked cards or sheets with depth", "an editorial grid with asymmetric columns", "full-height chapters, one idea per screen"],
  motion: ["snappy and tactile", "calm and smooth", "mechanical and precise", "playful and bouncy", "cinematic and slow"],
  radius: ["sharp (0-2px)", "soft (6-10px)", "round (16-24px)", "mixed: sharp containers, pill buttons"],
} : {
  layout: ["sidebar navigation", "top navigation with a dense workspace", "split list and detail", "command-first (search or command bar central)"],
  density: ["comfortable", "compact", "dense (wall display or power users)"],
  // Every option here must read as a current product (2026-10-11: "sharp 0-2px" + "mono for data"
  // + dense made a rota app look like a 2010 spreadsheet). Variety comes from colour, layout and
  // type character, never from dated combinations.
  colour: ["light, neutral, one status palette", "dark, deep and slightly tinted, one status palette", "light, with a tinted brand surface", "light app with a dark, rich navigation or header"],
  typeDirection: ["one modern sans for everything, tabular numbers on", "a modern sans for the interface plus a characterful display face for page titles and big numbers", "a warm humanist sans for long sessions", "a modern sans with a mono accent for codes, IDs and timestamps only"],
  radius: ["soft (6-8px)", "soft (8-10px)", "round (12-14px)"],
};

// Skip what the last project of this type used, so back-to-back sites differ.
const last = recentProjects(type, 1).sameType[0]?.seed?.picks ?? {};
const picks = {};
for (const [dim, options] of Object.entries(DIMENSIONS)) {
  const pool = options.filter((o) => o !== last[dim]);
  picks[dim] = pool[Math.floor(next() * pool.length)];
}

console.log(`Starting picks for this ${type} (seed ${seed}). Keep each unless it fights the brief; if you change one, say why in the design system.`);
for (const [dim, pick] of Object.entries(picks)) console.log(`- ${dim}: ${pick}`);
if (Object.keys(last).length) console.log("(Skipped the picks the previous project of this type used.)");
console.log(`\nFor the record: ${JSON.stringify({ seed, picks })}`);
