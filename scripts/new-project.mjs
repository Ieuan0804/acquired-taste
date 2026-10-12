#!/usr/bin/env node
// Creates a new Next.js project from the plugin's starter and installs dependencies.
// Faster and more predictable than scaffolding from scratch every time.
//
//   node new-project.mjs [dir] [--name my-site]
//
// Refuses to run where a package.json already exists: extend existing projects instead.

import { cpSync, existsSync, readFileSync, writeFileSync, renameSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const nameAt = args.indexOf("--name");
const name = nameAt === -1 ? null : args.splice(nameAt, 2)[1];
const dir = resolve(args[0] ?? ".");

if (existsSync(join(dir, "package.json"))) {
  console.error(`${dir} already has a package.json. Extend the existing project instead of creating a new one.`);
  process.exit(1);
}
const clashes = existsSync(dir) ? readdirSync(dir).filter((f) => ["app", "next.config.ts", "tsconfig.json"].includes(f)) : [];
if (clashes.length) {
  console.error(`${dir} already contains ${clashes.join(", ")}. Not overwriting.`);
  process.exit(1);
}

const started = Date.now();
cpSync(join(PLUGIN, "templates", "next"), dir, { recursive: true });
renameSync(join(dir, "gitignore.txt"), join(dir, ".gitignore"));

const pkgPath = join(dir, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.name = (name ?? basename(dir)).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "site";
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`Created a Next.js starter in ${dir}. Installing dependencies…`);
const install = spawnSync("npm", ["install", "--prefer-offline", "--no-audit", "--no-fund", "--loglevel=error"], {
  cwd: dir,
  stdio: "inherit",
  shell: process.platform === "win32",
  windowsHide: true,
});
if (install.status !== 0) {
  console.error("npm install failed. Fix the error above, then run `npm install` in the project.");
  process.exit(install.status ?? 1);
}
console.log(`Ready in ${Math.round((Date.now() - started) / 1000)}s. Next: set the design tokens in app/globals.css and the fonts in app/layout.tsx.`);
