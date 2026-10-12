#!/usr/bin/env node
// Serves a production build folder (dist/, out/, build/) for the final review when the project's
// own production server can't run locally. Start it through serve.mjs so it's stopped safely:
//
//   node serve.mjs start -- node "<plugin>/scripts/static.mjs" dist [--spa]
//
// --spa sends unknown paths to index.html (single-page apps with client-side routes).
// Reviewing the dev server instead is not a substitute: production builds minify and reorder
// CSS and can drop rules that worked in development (a redesign's panel broke only in production).

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve, normalize } from "node:path";

const args = process.argv.slice(2);
const spa = args.includes("--spa");
const dir = resolve(args.find((a) => !a.startsWith("--")) ?? "dist");
const port = Number(process.env.PORT || 4300);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain", ".webmanifest": "application/manifest+json" };

async function find(path) {
  const safe = normalize(decodeURIComponent(path)).replace(/^([/\\])+/, "");
  if (safe.includes("..")) return null;
  for (const candidate of [join(dir, safe), join(dir, safe, "index.html"), join(dir, `${safe}.html`)]) {
    try { if ((await stat(candidate)).isFile()) return candidate; } catch { /* next */ }
  }
  return spa ? join(dir, "index.html") : null;
}

createServer(async (req, res) => {
  const file = await find(new URL(req.url, "http://x").pathname);
  if (!file) { res.writeHead(404, { "content-type": "text/plain" }).end("Not found"); return; }
  try { res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
}).listen(port, "127.0.0.1", () => console.log(`Serving ${dir} at http://localhost:${port}`));
