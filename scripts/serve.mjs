#!/usr/bin/env node
// Starts and stops a project's server safely: picks a free port, remembers the exact
// process it started, and stops only that process tree. Never kills anything by name.
//
//   node serve.mjs start [--dir .] [--port N] [--timeout 180] -- <command...>
//       The port is passed as the PORT env var; write {port} in the command for tools that
//       need it as an argument (e.g. -- npx vite preview --port {port}). Prints the URL.
//   node serve.mjs stop [--dir .]
//   node serve.mjs status [--dir .]

import { spawn, execFileSync } from "node:child_process";
import net from "node:net";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, openSync } from "node:fs";
import { workDir } from "./lib/workdir.mjs";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const action = argv[0];
const dashAt = argv.indexOf("--");
const flagArgs = argv.slice(1, dashAt === -1 ? undefined : dashAt);
const command = dashAt === -1 ? [] : argv.slice(dashAt + 1);

const flags = {};
for (let i = 0; i < flagArgs.length; i += 2) flags[flagArgs[i].replace(/^--/, "")] = flagArgs[i + 1];

const dir = resolve(flags.dir ?? ".");
const stateDir = join(dir, ".acquired-taste");
const stateFile = join(stateDir, "server.json");
const logFile = join(stateDir, "server.log");

const readState = () => (existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : null);

function killTree(pid) {
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      process.kill(-pid, "SIGTERM");
    }
  } catch {
    try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
  }
}

// Waits until the old server has really let go of its port. Without this, a new server could
// start on the same port while the old one was still answering, then die when the old one
// finally exited (2026-10-11: cost a Ledgerline run a restart in its final pass).
async function stop() {
  const state = readState();
  if (!state) { console.log("No server recorded for this project."); return null; }
  killTree(state.pid);
  rmSync(stateFile, { force: true });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && (isAlive(state.pid) || !(await portIsFree(state.port)) || (await responds(state.port, 500)))) {
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`Stopped the server on port ${state.port} (pid ${state.pid}).`);
  return state.port;
}

function portIsFree(port) {
  return new Promise((done) => {
    const probe = net.createServer().once("error", () => done(false));
    probe.once("listening", () => probe.close(() => done(true))).listen(port);
  });
}

async function findFreePort(from, avoid = null) {
  for (let port = from; port < from + 500; port++) if (port !== avoid && (await portIsFree(port))) return port;
  throw new Error(`No free port between ${from} and ${from + 499}.`);
}

async function responds(port, timeoutMs = 2000) {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    try {
      await fetch(`http://${host}:${port}/`, { signal: AbortSignal.timeout(timeoutMs) });
      return true;
    } catch { /* not up yet */ }
  }
  return false;
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// Windows: a detached Node child has no console, so every console program it starts
// (npm, next, vite) would open its own visible window. Start a launcher through
// PowerShell's Start-Process with a hidden window instead: the whole tree shares that
// hidden console, and it outlives this script.
function startHiddenWindows(line, port) {
  const launcher = join(stateDir, "server.cmd");
  writeFileSync(launcher, `@echo off\r\nset PORT=${port}\r\n${line} > "${logFile}" 2>&1\r\n`);
  const q = (s) => `'${s.replaceAll("'", "''")}'`;
  const ps = `(Start-Process -FilePath 'cmd.exe' -ArgumentList '/d','/c',${q(`"${launcher}"`)} `
    + `-WorkingDirectory ${q(dir)} -WindowStyle Hidden -PassThru).Id`;
  const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8", windowsHide: true });
  return Number(out.trim());
}

function startDetachedPosix(line, port) {
  const out = openSync(logFile, "w");
  const child = spawn(line, {
    cwd: dir,
    shell: true,
    detached: true,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", out, out],
  });
  child.unref();
  return child.pid;
}

function tail(file, lines = 30) {
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf8").trimEnd().split("\n").slice(-lines).join("\n");
}

async function start() {
  if (!command.length) {
    console.error("Usage: node serve.mjs start [--dir .] [--port N] -- <command...>");
    process.exit(1);
  }
  const previous = readState() ? await stop() : null;
  workDir(dir);

  // Never reuse the port just freed: a slow-dying server can still answer on it for a moment.
  const port = flags.port ? Number(flags.port) : await findFreePort(4300, previous);
  // Quote words with spaces (a plugin or project path like "C:/Users/John Smith/...") so the
  // shell doesn't split them; words already quoted are left alone.
  const quote = (word) => (/\s/.test(word) && !/^".*"$/.test(word) ? `"${word}"` : word);
  const line = command.map(quote).join(" ").replaceAll("{port}", String(port));
  const pid = process.platform === "win32" ? startHiddenWindows(line, port) : startDetachedPosix(line, port);
  writeFileSync(stateFile, JSON.stringify({ pid, port, command: line, started: new Date().toISOString() }, null, 2));

  const deadline = Date.now() + Number(flags.timeout ?? 180) * 1000;
  let exited = false;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) { exited = true; break; }
    if (await responds(port)) {
      console.log(`http://localhost:${port}`);
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.error(exited
    ? "The server command exited before responding."
    : `The server didn't respond on port ${port} within ${flags.timeout ?? 180}s.`);
  console.error(`Last lines of ${logFile}:\n${tail(logFile)}`);
  await stop();
  process.exit(1);
}

if (action === "start") await start();
else if (action === "stop") await stop();
else if (action === "status") console.log(readState() ?? "No server recorded for this project.");
else {
  console.error("Usage: node serve.mjs start|stop|status [--dir .] [-- <command...>]");
  process.exit(1);
}
