// Locates the OpenAI Codex CLI without relying on PATH (npm's global folder often isn't
// on PATH on Windows). Returns { command, args } to pass to spawn, or null.

import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

export function findCodex() {
  // Prefer running the package's JS entry with this Node: no shell, no .cmd quoting issues.
  const roots = [
    process.env.APPDATA && join(process.env.APPDATA, "npm", "node_modules"),
    process.env.npm_config_prefix && join(process.env.npm_config_prefix, "lib", "node_modules"),
    "/usr/local/lib/node_modules",
    "/opt/homebrew/lib/node_modules",
  ].filter(Boolean);
  try {
    roots.unshift(execFileSync("npm", ["root", "-g"], { encoding: "utf8", shell: process.platform === "win32", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim());
  } catch { /* npm not available */ }
  for (const root of roots) {
    const entry = join(root, "@openai", "codex", "bin", "codex.js");
    if (existsSync(entry)) return { command: process.execPath, args: [entry] };
  }
  // Fall back to a native binary on PATH (e.g. installed with Homebrew).
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", ["codex"], { stdio: "ignore", windowsHide: true });
    return { command: "codex", args: [] };
  } catch {
    return null;
  }
}
