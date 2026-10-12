#!/usr/bin/env node
// Tests review.mjs --login and try.mjs --login against a tiny local app with three kinds of
// sign-in: a server cookie, a token in localStorage (how Supabase and most single-page apps
// keep a session) and a per-tab sessionStorage session (which can't carry over, so review
// must say so instead of screenshotting the login form). Run before releasing changes to
// review.mjs, try.mjs or scripts/lib/steps.mjs.
//
//   node dev/test-login.mjs

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PASSWORD = "correct horse";

const page = (title, body, script = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font:16px system-ui;margin:40px}button{padding:10px 16px}</style></head><body>${body}<script>${script}</script></body></html>`;
const form = (action, error = "") => `<h1>Sign in</h1>${error ? `<p role="alert">${error}</p>` : ""}
<form method="post" action="${action}" id="f"><label>Email <input name="email" type="email"></label>
<label>Password <input name="password" type="password"></label><button>Sign in</button></form>`;
// Client-side sign-in: posts, then stores the token in the given storage and moves on.
const jsLogin = (storage, next) => `document.getElementById("f").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await fetch("/api/token", { method: "POST", body: new FormData(e.target) });
  if (!r.ok) return;
  ${storage}.setItem("token", await r.text());
  location.href = "${next}";
});`;
const guard = (storage, back) => `if (${storage}.getItem("token") !== "t-123") location.replace("${back}");
else document.getElementById("who").textContent = "Signed in as tester";`;

const body = (req) => new Promise((ok) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => ok(s)); });
const formPassword = (raw) => {
  if (raw.includes("Content-Disposition")) return /name="password"\r\n\r\n([^\r]*)/.exec(raw)?.[1];
  return new URLSearchParams(raw).get("password");
};

const server = createServer(async (req, res) => {
  const html = (code, s, headers = {}) => { res.writeHead(code, { "content-type": "text/html", ...headers }); res.end(s); };
  const path = new URL(req.url, "http://x").pathname;
  const cookie = /(?:^|; )sid=ok/.test(req.headers.cookie ?? "");
  if (path === "/") return html(200, page("Home", "<h1>Home</h1><p>Public page.</p>"));
  // 1. Cookie sign-in, server-side redirect.
  if (path === "/login" && req.method === "POST") {
    if (formPassword(await body(req)) === PASSWORD) return html(303, "", { location: "/app", "set-cookie": "sid=ok; Path=/; HttpOnly" });
    return html(200, page("Sign in", form("/login", "Wrong email or password")));
  }
  if (path === "/login") return html(200, page("Sign in", form("/login")));
  if (path === "/app") return cookie ? html(200, page("App", "<h1>Today</h1><p>Signed in as tester</p>")) : html(302, "", { location: "/login" });
  // Needs a role the test user hasn't got: always back to the login page.
  if (path === "/admin") return html(302, "", { location: "/login" });
  // 2. Token in localStorage, client-side redirect (Supabase-style).
  if (path === "/api/token" && req.method === "POST") {
    const ok = formPassword(await body(req)) === PASSWORD;
    res.writeHead(ok ? 200 : 401); return res.end(ok ? "t-123" : "no");
  }
  if (path === "/js-login") return html(200, page("Sign in", form("#"), jsLogin("localStorage", "/dash")));
  if (path === "/dash") return html(200, page("Dash", '<h1>Dashboard</h1><p id="who"></p>', guard("localStorage", "/js-login")));
  // 3. Token in sessionStorage: per tab, so review copies it into each new page itself.
  if (path === "/tab-login") return html(200, page("Sign in", form("#"), jsLogin("sessionStorage", "/tab")));
  if (path === "/tab") return html(200, page("Tab", '<h1>Tab app</h1><p id="who"></p>', guard("sessionStorage", "/tab-login")));
  // 4. Forms whose labels aren't linked to their boxes (common in generated apps); the
  // password can be in any field, since these use made-up field names. A cookie sign-in.
  if (path.startsWith("/unlinked/") && req.method === "POST") {
    const raw = await body(req);
    if (new URLSearchParams(raw).values().some((v) => v === PASSWORD)) return html(303, "", { location: "/app", "set-cookie": "sid=ok; Path=/; HttpOnly" });
    return html(200, page("Sign in", "<p>Wrong</p>"));
  }
  const unlinked = {
    // Words next to the box, not linked; the box has a matching name (the real-use app).
    named: `<label>Email</label><input name="email" type="email"><label>Password</label><input name="password" type="password">`,
    // Words next to the box, made-up names.
    words: `<div><span>Email</span><input name="f1" type="email"></div><div><span>Password</span><input name="f2" type="password"></div>`,
    // No words at all: only the box types tell them apart.
    bare: `<input name="a1" type="email"><input name="a2" type="password">`,
    // Two password boxes and no words: the tool must refuse to guess.
    twopw: `<input name="a1" type="email"><input name="a2" type="password"><input name="a3" type="password">`,
  };
  if (path.startsWith("/unlinked/") && unlinked[path.slice(10)]) return html(200, page("Sign in", `<h1>Sign in</h1><form method="post" action="${path}">${unlinked[path.slice(10)]}<button>Sign in</button></form>`));
  html(404, page("Not found", "<h1>Not found</h1>"));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;
const work = mkdtempSync(join(tmpdir(), "acquired-taste-login-"));

const node = (script, args, env = {}) => {
  // Async: the test app runs in this process, so a blocking spawn would stop it answering.
  const child = spawn(process.execPath, [join(PLUGIN, "scripts", script), ...args], { cwd: work, windowsHide: true, env: { ...process.env, ...env } });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  return new Promise((ok) => child.on("close", (code) => ok({ code, out })));
};
const review = (args, env) => node("review.mjs", [base, ...args, "--widths", "390,1440"], env);
const login = (path) => `goto:${path}; fill:Email=tester@example.com; fill:Password=\${TEST_PASSWORD}; click:Sign in`;
const env = { TEST_PASSWORD: PASSWORD };

let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n${detail}`}`); if (!ok) failed++; };
const reviewJson = () => JSON.parse(readFileSync(join(work, ".acquired-taste", "review", "review.json"), "utf8"));

// The old behaviour: without --login, a protected route silently reviews the login form.
let r = await review(["/app"]);
check("without --login, /app shows the login form (the gap being fixed)", r.code === 0 && !/sent back/.test(r.out), r.out);

r = await review(["/app", "--login", login("/login")], env);
check("cookie login: signs in and reviews /app with no bounce", r.code === 0 && /Signed in/.test(r.out) && !/sent back|Couldn't sign in/.test(r.out), r.out);
check("cookie login: the password isn't saved in review.json", !JSON.stringify(reviewJson()).includes(PASSWORD));

r = await review(["/dash", "--login", login("/js-login")], env);
check("localStorage token login (client redirect): reviews /dash with no bounce", r.code === 0 && /Signed in \(login page \/js-login\)/.test(r.out) && !/sent back/.test(r.out), r.out);

r = await review(["/tab", "--login", login("/tab-login")], env);
check("sessionStorage token login: carried into every page, no bounce", r.code === 0 && /Signed in/.test(r.out) && !/sent back/.test(r.out), r.out);

r = await review(["/app", "/admin", "--login", login("/login")], env);
check("a route the session can't open: reported as sent back, not reviewed as the login form",
  /\/admin @390,1440,1440 reduced-motion: sent back to the login page \(\/login\)/.test(r.out) && !/\/app @.*sent back/.test(r.out), r.out);

r = await review(["/app", "--login", "goto:/login; fill:Email=tester@example.com; fill:Password=wrong; click:Sign in"]);
check("wrong password: stops with a clear message and exit code 1", r.code === 1 && /Couldn't sign in.*no session was saved/s.test(r.out), r.out);

r = await review(["/app", "--login", login("/login")]);
check("missing environment variable: named in the error", r.code === 1 && /TEST_PASSWORD isn't set/.test(r.out), r.out);

r = await review(["/app", "--login", "goto:/login; fill:Username=x; click:Sign in"], env);
check("a step that can't run: names the step", r.code === 1 && /login step "fill:Username=x" failed: no field/.test(r.out), r.out);

const stepsFile = join(work, "login.txt");
writeFileSync(stepsFile, `# test sign-in\ngoto:/login\nfill:Email=tester@example.com\nfill:Password=\${TEST_PASSWORD}\nclick:Sign in\n`);
r = await review(["/app", "--login", stepsFile], env);
check("login steps from a file", r.code === 0 && /Signed in/.test(r.out) && !/sent back/.test(r.out), r.out);

r = await node("try.mjs", [base, "--login", login("/js-login"), "goto:/dash", "expect:Signed in as tester", "shot:dash"], env);
check("try.mjs --login: journey starts signed in", r.code === 0 && /Journey works/.test(r.out) && existsSync(join(work, ".acquired-taste", "review", "try-dash.png")), r.out);

r = await node("try.mjs", [base, "goto:/login", "fill:Email=tester@example.com", "fill:Password=${TEST_PASSWORD}", "click:Sign in", "expect:Signed in as tester"], env);
check("try.mjs without --login: sign-in steps in the journey still work (and ${NAME} expands)", r.code === 0 && /Journey works/.test(r.out) && !r.out.includes(PASSWORD), r.out);

// Labels not linked to their boxes: found another way, and the run says how.
r = await review(["/app", "--login", login("/unlinked/named")], env);
check("unlinked labels: found by name, and the report says so", r.code === 0 && /Fields found by name or id "Email"; found by name or id "Password"/.test(r.out) && !/sent back/.test(r.out), r.out);
r = await review(["/app", "--login", login("/unlinked/words")], env);
check("unlinked labels, made-up names: found by the box after the words", r.code === 0 && /found by the box after the words "Email"; found by the box after the words "Password"/.test(r.out), r.out);
r = await node("try.mjs", [base, "goto:/unlinked/bare", "fill:Email=tester@example.com", "fill:Password=${TEST_PASSWORD}", "click:Sign in", "expect:Signed in as tester"], env);
check("no labels at all: try.mjs finds the email and password boxes by type and prints it", r.code === 0 && /ok {3}fill:Email=tester@example.com: found by box type "email"/.test(r.out) && /found by box type "password"/.test(r.out) && !r.out.includes(PASSWORD), r.out);
r = await node("try.mjs", [base, "goto:/unlinked/twopw", "fill:Email=tester@example.com", "fill:Password=x"]);
check("two password boxes: refuses to guess and says why", r.code === 1 && /FAIL fill:Password=x: no box labelled "Password", and 2 boxes match box type "password"/.test(r.out), r.out);

server.close();
rmSync(work, { recursive: true, force: true });
console.log(failed ? `${failed} failed` : "All login tests passed.");
process.exit(failed ? 1 : 0);
