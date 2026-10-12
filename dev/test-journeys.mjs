#!/usr/bin/env node
// Tests try.mjs --journeys against a tiny local practice app with the things that made a
// real run write its own browser script: a slow page with a same-named button on the page
// before it, duplicate buttons in rows, a slow save, a dropdown chosen by value, an exact
// label next to a longer one, an "are you sure?" pop-up, a phone menu, a live page that
// never goes quiet, a sign-out that ends the session, put-back steps, and reruns of only
// what failed. Run before releasing changes to try.mjs or scripts/lib/steps.mjs.
//
//   node dev/test-journeys.mjs

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PASSWORD = "correct horse";
const state = { name: "Pet Kingdom", places: [["Alpha", "office"], ["Beta", "office"]], sessions: new Set(), wrongClicks: 0 };

const page = (title, body, script = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font:16px system-ui;margin:24px}button{padding:8px 14px}nav[hidden]{display:none}</style></head><body>${body}<script>${script}</script></body></html>`;
const esc = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const placesHtml = () => state.places.map(([n, r]) => `<li><span>${esc(n)} (${r})</span> <button class="rm" data-n="${esc(n)}">Remove</button></li>`).join("");
const settings = () => `<h1>Settings</h1><h2 id="title">Project: ${esc(state.name)}</h2>
<label>Name <input id="name" value="${esc(state.name)}"></label> <button id="save">Save</button>
<p><label>Project name to confirm <input id="confirm"></label> <button id="del">Delete project</button></p><p id="deleted"></p>
<h2>Places</h2><ul id="places">${placesHtml()}</ul>
<label>Place name <input id="pn"></label>
<label>Role <select id="role"><option value="office">Office</option><option value="lobby">Main lobby area</option></select></label>
<button id="add">Add place</button>`;
const settingsJs = `
const post = (u, b) => fetch(u, { method: "POST", body: JSON.stringify(b) }).then((r) => r.text());
const draw = (html) => { document.getElementById("places").innerHTML = html; bind(); };
function bind() { for (const b of document.querySelectorAll(".rm")) b.onclick = async () => draw(await post("/api/remove", { n: b.dataset.n })); }
bind();
document.getElementById("add").onclick = async () => draw(await post("/api/add", { n: document.getElementById("pn").value, r: document.getElementById("role").value }));
document.getElementById("save").onclick = async () => { const n = await post("/api/name", { n: document.getElementById("name").value }); document.getElementById("title").textContent = "Project: " + n; };
document.getElementById("del").onclick = () => { if (confirm("Delete this project?")) document.getElementById("deleted").textContent = "Deleted (not really)"; };`;

const body = (req) => new Promise((ok) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => ok(s)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = createServer(async (req, res) => {
  const html = (code, s, headers = {}) => { res.writeHead(code, { "content-type": "text/html", ...headers }); res.end(s); };
  const path = new URL(req.url, "http://x").pathname;
  const sid = /(?:^|; )sid=([\w-]+)/.exec(req.headers.cookie ?? "")?.[1];
  const signedIn = sid && state.sessions.has(sid);
  if (path === "/login" && req.method === "POST") {
    const f = new URLSearchParams(await body(req));
    if (f.get("password") !== PASSWORD) return html(200, page("Sign in", `<h1>Sign in</h1><p role="alert">Wrong email or password</p>`));
    const t = Math.random().toString(36).slice(2);
    state.sessions.add(t);
    return html(303, "", { location: "/app", "set-cookie": `sid=${t}; Path=/; HttpOnly` });
  }
  if (path === "/login") return html(200, page("Sign in", `<h1>Sign in</h1><form method="post" action="/login"><label>Email <input name="email" type="email"></label>
<label>Password <input name="password" type="password"></label><button>Sign in</button></form>`));
  if (path === "/logout" && req.method === "POST") { state.sessions.delete(sid); return html(303, "", { location: "/login" }); }
  if (path === "/wrong") { state.wrongClicks++; return html(200, page("Wrong", "<h1>Wrong page</h1>")); }
  if (path === "/steps/a") return html(200, page("A", `<h1>Step A</h1><a href="/steps/b">Next</a> <button onclick="location.href='/wrong'">Continue</button>`));
  if (path === "/steps/b") { await sleep(1500); return html(200, page("B", `<h1>Step B</h1><button onclick="document.getElementById('o').textContent='Continued on B'">Continue</button><p id="o"></p>`)); }
  // Live page: polls every 300 ms, keeps a stream open and a request hanging, forever.
  if (path === "/api/ping") { res.writeHead(200); return res.end("pong"); }
  if (path === "/api/stream") { res.writeHead(200, { "content-type": "text/event-stream" }); const t = setInterval(() => res.write("data: tick\n\n"), 200); return req.on("close", () => clearInterval(t)); }
  if (path === "/api/hang") return; // never answers
  if (path.startsWith("/api/")) {
    if (!signedIn) { res.writeHead(401); return res.end(); }
    const b = JSON.parse((await body(req)) || "{}");
    if (path === "/api/add") { await sleep(1200); state.places.push([b.n, b.r]); }
    if (path === "/api/remove") { await sleep(300); state.places = state.places.filter(([n]) => n !== b.n); }
    if (path === "/api/name") { await sleep(800); state.name = b.n; res.writeHead(200); return res.end(state.name); }
    res.writeHead(200); return res.end(placesHtml());
  }
  if (!signedIn) return html(302, "", { location: "/login" });
  if (path === "/app") return html(200, page("App", `<h1>Today</h1><button onclick="document.querySelector('nav').hidden=false">Open menu</button>
<nav hidden><a href="/settings">Settings</a> <a href="/live">Live</a></nav><form method="post" action="/logout"><button>Sign out</button></form>`));
  if (path === "/settings") return html(200, page("Settings", settings(), settingsJs));
  if (path === "/live") return html(200, page("Live", `<h1>Live</h1><button id="r">Refresh</button><p id="o"></p>`,
    `setInterval(() => fetch("/api/ping"), 300); new EventSource("/api/stream"); fetch("/api/hang").catch(() => {});
document.getElementById("r").onclick = async () => { await fetch("/api/ping"); document.getElementById("o").textContent = "Refreshed"; };`));
  html(404, page("Not found", "<h1>Not found</h1>"));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;
const work = mkdtempSync(join(tmpdir(), "acquired-taste-journeys-"));

const node = (args, env = {}) => {
  const child = spawn(process.execPath, [join(PLUGIN, "scripts", "try.mjs"), base, ...args], { cwd: work, windowsHide: true, env: { ...process.env, ...env } });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  return new Promise((ok) => child.on("close", (code) => ok({ code, out })));
};
const env = { TEST_PASSWORD: PASSWORD };

const journeys = `# Practice app journeys
login: goto:/login; fill:Email=tester@example.com; fill:Password=\${TEST_PASSWORD}; click:Sign in

== Wait for a slow page before the next click
goto:/steps/a
click:Next
click:Continue
expect:Continued on B

== Remove the right one of several
goto:/settings
click:Remove in "Beta"
expect-gone:Beta (office)
expect:Alpha (office)

== Add a place slowly, choose by value, then remove it
goto:/settings
fill:Place name=Lobby {run}
select:Role=lobby
click:Add place
expect:Lobby {run} (lobby)
click:Remove in "Lobby {run}"
expect-gone:Lobby {run}

== Exact label wins, and a pop-up is accepted
goto:/settings
fill:Name=Renamed {run}
expect-value:Project name to confirm=
click:Save
expect:Project: Renamed {run}
click:Delete project
expect:Deleted (not really)
always:
fill:Name=Pet Kingdom
click:Save
expect:Project: Pet Kingdom

== Put back runs even when a journey fails
goto:/settings
fill:Name=Broken {run}
click:Save
expect:Something that never appears
always:
fill:Name=Pet Kingdom
click:Save
expect:Project: Pet Kingdom

== Live page that never goes quiet
goto:/live
click:Refresh
expect:Refreshed
expect-js:document.title === "Live"

== Phone menu opens a page [phone]
goto:/app
click:Open menu
click:Settings
expect-url:/settings

== Sign out
goto:/app
click:Sign out
expect-url:/login

== Still works after a sign-out
goto:/settings
expect:Places

== Wrong password shows an error [signed out]
goto:/login
fill:Email=tester@example.com
fill:Password=wrong
click:Sign in
expect:Wrong email or password
`;
const file = join(work, "journeys.txt");
writeFileSync(file, journeys);

let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n${detail}`}`); if (!ok) failed++; };
const line = (out, name) => out.split("\n").find((l) => /^(ok {3}|FAIL )/.test(l) && l.includes(` ${name}`)) ?? "";
const secs = (out, name) => Number(/\(([\d.]+) s\)/.exec(line(out, name))?.[1] ?? 99);

let r = await node(["--journeys", file], env);
check("full run: 9 of 10 pass (one fails on purpose) with a one-line summary", r.code === 1 && /9 of 10 journeys passed in \d+ s\. Fix, then rerun only the failures with --failed/.test(r.out), r.out);
check("waits for a slow page before the next click (never clicks the old page's button)", line(r.out, "Wait for a slow page").startsWith("ok") && state.wrongClicks === 0, r.out);
check("picks the right one of several identical buttons", line(r.out, "Remove the right one").startsWith("ok") && state.places.some(([n]) => n === "Alpha") && !state.places.some(([n]) => n === "Beta"), JSON.stringify(state.places) + "\n" + r.out);
check("slow save, dropdown by value, {run} tag, and the added place cleaned up", line(r.out, "Add a place slowly").startsWith("ok") && state.places.length === 1, JSON.stringify(state.places) + "\n" + r.out);
check("exact label wins and the pop-up is accepted and noted", line(r.out, "Exact label wins").startsWith("ok") && /accepted a pop-up: "Delete this project\?"/.test(r.out), r.out);
check("put-back runs even when the journey fails (project name restored)", /FAIL Put back runs even when a journey fails[^\n]*\n\s+step 4 "expect:Something that never appears": "Something that never appears" isn't visible/.test(r.out) && state.name === "Pet Kingdom", `name: ${state.name}\n${r.out}`);
check(`live page that never goes quiet doesn't stall (${secs(r.out, "Live page")} s)`, line(r.out, "Live page").startsWith("ok") && secs(r.out, "Live page") < 8, r.out);
check("phone menu journey at phone width", line(r.out, "Phone menu").startsWith("ok"), r.out);
check("after a sign-out, the next journey signs in again by itself", line(r.out, "Still works after a sign-out").startsWith("ok") && /signed in again/.test(r.out), r.out);
check("signed-out journey: wrong password shows the error", line(r.out, "Wrong password").startsWith("ok"), r.out);
check("the password never appears in the output", !r.out.includes(PASSWORD), r.out);

r = await node(["--journeys", file, "--failed"], env);
check("--failed reruns only the one that failed", r.code === 1 && /0 of 1 passed in \d+ s \(ran 1 of 10\)/.test(r.out) && !/Live page/.test(r.out) && state.name === "Pet Kingdom", r.out);

r = await node(["--journeys", file, "--only", "phone|live"], env);
check("--only runs journeys by name and still remembers the earlier failure", r.code === 0 && /2 of 2 passed in \d+ s \(ran 2 of 10\)\. Still failing from earlier: Put back runs even when a journey fails\./.test(r.out), r.out);

writeFileSync(join(work, "bad.txt"), "== Something [tablet]\ngoto:/\n");
r = await node(["--journeys", join(work, "bad.txt")]);
check("an unknown tag is a clear error", r.code === 1 && /line 1: unknown tag \[tablet\]/.test(r.out), r.out);

r = await node(["goto:/steps/a", "click:Next", "click:Continue", "expect:Continued on B"]);
check("one journey on the command line still works the old way (and now waits for slow pages)", r.code === 0 && /Journey works/.test(r.out) && state.wrongClicks === 0, r.out);

server.closeAllConnections();
server.close();
rmSync(work, { recursive: true, force: true });
console.log(failed ? `${failed} failed` : "All journey tests passed.");
process.exit(failed ? 1 : 0);
