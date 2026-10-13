// Journey steps shared by try.mjs and review.mjs (including review's --login).
//
//   goto:/path              open a page
//   click:Text              click a button or link by its visible name (falls back to any text)
//   fill:Label=value        type into the field with that label (or placeholder; if the label
//                           isn't linked to its box: its name or id, the box after the words,
//                           or the only email/password box)
//   select:Label=Option     choose an option in a select (by its text, or its value)
//   check:Label             tick a checkbox or radio
//   press:Enter             press a key
//   expect:Text             pass once this text is visible
//   expect-gone:Text        pass once this text is no longer visible
//   expect-url:/part        pass once the address contains this
//   expect-value:Label=val  pass once that field holds this value
//   shot:name               save a screenshot to <out>/try-<name>.png
//   wait:500                wait (ms); rarely needed, since every step waits for the page
//   js:code / expect-js:code  last resort: run code in the page / pass once it's true
//
// Picking one of several: "click:Remove in "Test lobby"" (the Remove nearest those words:
// same row, card or section), "click:Delete (2nd)", "click:Remove (last)". An exact name
// beats a partial one ("Name" picks the Name box over "Project name").
//
// After every action the step waits until the page has finished loading what the action
// started (capped at 3 s, so live pages that never go quiet can't stall it), instead of a
// fixed pause. "Are you sure?" pop-ups are accepted and noted.
//
// ${NAME} in a step is replaced with the environment variable NAME, so test passwords
// don't have to appear in the command, the printed steps or saved reports. {run} is
// replaced with a short tag unique to this run, for test names that mustn't clash with
// leftovers from earlier runs; {num} is a six-digit
// one, for fields that only take numbers.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Git Bash on Windows rewrites "/games" into "C:/Program Files/Git/games" and a route whose
// first part is one letter ("/p/abc") into a drive path ("P:/abc"); undo both. Routes are
// never Windows paths. The drive letter comes back lowercase (Git Bash loses its case).
export const unmangle = (r) => {
  const s = String(r).replace(/\\/g, "/");
  const git = s.match(/^[a-z]:\/(?:.*\/)?Git\/(.*)$/i);
  if (git) return "/" + git[1];
  const drive = s.match(/^([a-z]):\/(.*)$/i);
  if (drive) return `/${drive[1].toLowerCase()}${drive[2] ? "/" + drive[2] : ""}`;
  return r;
};

export function expandEnv(text) {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
    if (process.env[name] === undefined) throw new Error(`environment variable ${name} isn't set`);
    return process.env[name];
  });
}

// A login is either a file (one step per line, # for comments) or one string with steps
// separated by ";". Use a file when a value itself contains ";".
export function parseLogin(value) {
  const fromFile = existsSync(value);
  const text = fromFile ? readFileSync(value, "utf8") : value;
  const steps = text.split(fromFile ? /\r?\n/ : ";").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
  if (!steps.length) throw new Error("--login has no steps");
  return steps.map(unmangle);
}

// Requests each page has in flight (live streams left out), and pop-ups it accepted.
const watched = new WeakMap();
function watch(page) {
  if (watched.has(page)) return watched.get(page);
  const w = { pending: new Map(), dialogs: [] };
  page.on("request", (r) => { if (!["eventsource", "websocket"].includes(r.resourceType())) w.pending.set(r, Date.now()); });
  page.on("requestfinished", (r) => w.pending.delete(r));
  page.on("requestfailed", (r) => w.pending.delete(r));
  page.on("dialog", (d) => { w.dialogs.push(d.message().slice(0, 80)); d.accept().catch(() => {}); });
  watched.set(page, w);
  return w;
}

// Waits until requests started since `since` have finished and stayed quiet for 200 ms,
// then for the next paint. Requests that were already running (polling, long-lived
// connections) don't count, and the wait gives up after `cap` ms rather than stalling.
async function settle(page, since, cap = 3000) {
  const w = watch(page);
  const end = Date.now() + cap;
  let quietFrom = Date.now();
  while (Date.now() < end) {
    if ([...w.pending.values()].some((t) => t >= since)) quietFrom = Date.now();
    else if (Date.now() - quietFrom >= 200) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  await page.waitForLoadState("load", { timeout: Math.max(500, end - Date.now()) }).catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {});
}

// Retries `fn` until it returns something (elements can appear a moment after the page
// settles: a dialog opening, a list refreshing).
async function poll(fn, timeout) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
}

// "Remove (2nd) in "Test lobby"" → { text: "Remove", nth: 1, region: "Test lobby" }.
function parseTarget(s) {
  let text = s.trim(), region = null, nth = null;
  const r = text.match(/^(.*?)\s+in\s+"([^"]+)"$/);
  if (r) [, text, region] = r;
  const n = text.match(/^(.*?)\s+\((?:(\d+)(?:st|nd|rd|th)|(last))\)$/i);
  if (n) { text = n[1]; nth = n[3] ? "last" : Number(n[2]) - 1; }
  return { text, nth, region };
}

// One element out of a locator's visible matches: the one nearest the region's words
// (fewest levels up to an element containing them), then the nth, else the first.
async function pick(locator, { nth, region }) {
  const all = locator.filter({ visible: true });
  const n = await all.count();
  if (!n) return null;
  let candidates = [...Array(n).keys()];
  if (region) {
    const levels = await all.evaluateAll((els, words) => els.map((el) => {
      const x = words.toLowerCase();
      for (let a = el.parentElement, d = 1; a; a = a.parentElement, d++) {
        if ((a.innerText ?? "").toLowerCase().includes(x) || (a.getAttribute("aria-label") ?? "").toLowerCase() === x) return d;
      }
      return -1;
    }), region);
    const best = Math.min(...levels.filter((l) => l >= 0));
    if (!Number.isFinite(best)) return null;
    candidates = candidates.filter((i) => levels[i] === best);
  }
  const i = nth === "last" ? candidates.at(-1) : candidates[nth ?? 0];
  return i === undefined ? null : all.nth(i);
}

// A button, link or other control by its accessible name, exact names first; then any text.
const ROLES = ["button", "link", "tab", "radio", "checkbox", "menuitem", "option", "switch"];
async function clickable(page, target) {
  const tries = [
    ...ROLES.map((role) => page.getByRole(role, { name: target.text, exact: true })),
    ...ROLES.map((role) => page.getByRole(role, { name: target.text })),
    page.getByText(target.text, { exact: true }),
    page.getByText(target.text),
  ];
  for (const l of tries) { const el = await pick(l, target); if (el) return el; }
  return null;
}

// A form field by its label or placeholder (exact first). Many apps show a label that
// isn't linked to its box, so after those it tries, in order: the box's name or id ("Email"
// finds name="email"), the box straight after those exact words, and for words like Email
// or Password the only visible box of that type. Returns { el, how } (how is "" for a label
// or placeholder match, so callers can say how the box was found), or { el: null, why }
// when nothing matched or a fallback matched more than one box (never guess between two,
// unless the step says which: "(2nd)" or "in "...").
const BOX = "input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select";
const TYPES = [[/e-?mail/i, "email"], [/password|passcode/i, "password"], [/phone|mobile|tel\b/i, "tel"], [/search/i, "search"], [/website|url/i, "url"]];
async function field(page, target) {
  const label = target.text;
  for (const l of [page.getByLabel(label, { exact: true }), page.getByPlaceholder(label, { exact: true }), page.getByLabel(label), page.getByPlaceholder(label)]) {
    const el = await pick(l, target);
    if (el) return { el, how: "" };
  }
  const q = label.replace(/["\\]/g, "\\$&");
  const dashed = label.trim().toLowerCase().replace(/\s+/g, "-");
  const fallbacks = [
    [`name or id "${label}"`, page.locator(`:is(${BOX}):is([name="${q}" i], [id="${q}" i], [name="${dashed}" i], [id="${dashed}" i])`)],
    [`the box after the words "${label}"`, page.getByText(label, { exact: true }).filter({ visible: true }).locator(`xpath=following::*[self::input[not(@type="hidden" or @type="submit" or @type="button")] or self::textarea or self::select][1]`)],
  ];
  const type = TYPES.find(([re]) => re.test(label))?.[1];
  if (type) fallbacks.push([`box type "${type}"`, page.locator(`input[type=${type}]`)]);
  const chosen = target.nth !== null || target.region;
  for (const [how, l] of fallbacks) {
    const n = await l.filter({ visible: true }).count();
    if (n === 1 || (n > 1 && chosen)) { const el = await pick(l, target); if (el) return { el, how }; }
    if (n > 1) return { el: null, why: `no box labelled "${label}", and ${n} boxes match ${how}; use a label, placeholder or name that only one box has, or say which: "(2nd)" or in "..."` };
  }
  return { el: null, why: `no field labelled "${label}" (also tried its name or id, the box after those words${type ? `, and box type "${type}"` : ""})` };
}

const address = (page) => { const u = new URL(page.url()); return decodeURIComponent(u.pathname + u.search + u.hash); };
const where = (t) => `${t.nth === "last" ? " (last)" : t.nth !== null ? ` (match ${t.nth + 1})` : ""}${t.region ? ` in "${t.region}"` : ""}`;

// Runs one step; throws with a short reason if it fails. Returns a note: a screenshot path,
// how a field was found, or a pop-up that was accepted. `vars.run` fills {run}, `vars.num` {num}.
export async function runStep(page, baseUrl, step, outDir, vars = {}) {
  const at = step.indexOf(":");
  if (at === -1) throw new Error(`a step looks like "action:value", got "${step}"`);
  const action = step.slice(0, at).trim();
  const rest = expandEnv(step.slice(at + 1).replaceAll("{run}", vars.run ?? "run").replaceAll("{num}", vars.num ?? "0"));
  const eq = rest.indexOf("=");
  const [key, value] = eq === -1 ? [rest, ""] : [rest.slice(0, eq), rest.slice(eq + 1)];
  const w = watch(page);
  const popups = w.dialogs.length;
  const since = Date.now();
  const notes = [];

  if (action === "goto") {
    await page.goto(new URL(unmangle(rest), baseUrl).toString(), { waitUntil: "load", timeout: 30000 });
    await settle(page, since);
  } else if (action === "click") {
    const t = parseTarget(rest);
    const el = await poll(() => clickable(page, t), 5000);
    if (!el) throw new Error(`nothing visible called "${t.text}"${where(t)}`);
    await el.click({ timeout: 5000 });
    await settle(page, since);
  } else if (action === "fill" || action === "select" || action === "check") {
    const t = parseTarget(action === "check" ? rest : key);
    let found = await poll(async () => { const f = await field(page, t); return f.el || /boxes match/.test(f.why) ? f : null; }, 5000) ?? await field(page, t);
    if (!found.el && action === "check") { const el = await clickable(page, t); if (el) found = { el, how: "" }; }
    if (!found.el) throw new Error(found.why);
    if (action === "fill") await found.el.fill(value);
    else if (action === "check") {
      // Styled radios and checkboxes often hide the real box under a card or label (opacity 0,
      // 1px, or covered), so a direct tick can't land. Click what a person clicks, its label,
      // then confirm it ticked.
      await found.el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
      const already = await found.el.evaluate((el) => el instanceof HTMLInputElement && el.checked).catch(() => false);
      const covered = !already && await found.el.evaluate((el) => {
        if (!(el instanceof HTMLInputElement)) return true;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || getComputedStyle(el).opacity === "0") return true;
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) !== el;
      }).catch(() => false);
      const label = covered ? (await found.el.evaluateHandle((el) => el.labels?.[0] ?? el.closest("label"))).asElement() : null;
      if (label) {
        await label.click({ timeout: 5000 });
        const box = await found.el.evaluateHandle((el) => (el instanceof HTMLInputElement ? el : el.closest("label")?.control ?? el.querySelector?.("input")));
        const ticked = await box.evaluate((b) => !b || b.checked).catch(() => true);
        if (!ticked) throw new Error(`clicked the label of "${t.text}" but its box didn't tick`);
        notes.push("ticked by clicking its label (the box itself is hidden)");
      } else if (!already) await found.el.check({ timeout: 5000 });
      await settle(page, since);
    }
    else {
      // By the option's text, then its value, then part of its text, so a miss costs no timeout.
      const options = await found.el.locator("option").evaluateAll((os) => os.map((o) => ({ label: o.label.trim(), value: o.value })));
      const v = value.trim().toLowerCase();
      const o = options.find((x) => x.label.toLowerCase() === v) ?? options.find((x) => x.value.toLowerCase() === v) ?? options.find((x) => x.label.toLowerCase().includes(v));
      if (!o) throw new Error(`no option "${value}"; the options are: ${options.map((x) => x.label || x.value).slice(0, 12).join(", ")}`);
      await found.el.selectOption(o.value, { timeout: 5000 });
      await settle(page, since);
    }
    if (found.how) notes.push(`found by ${found.how}`);
  } else if (action === "press") {
    await page.keyboard.press(rest.trim());
    await settle(page, since);
  } else if (action === "expect") {
    const t = parseTarget(rest);
    const ok = await poll(() => pick(page.getByText(t.text), t), 5000);
    if (!ok) throw new Error(`"${t.text}" isn't visible${where(t)}`);
  } else if (action === "expect-gone") {
    const t = parseTarget(rest);
    const gone = await poll(async () => !(await pick(page.getByText(t.text), t)), 8000);
    if (!gone) throw new Error(`"${t.text}" is still visible${where(t)}`);
  } else if (action === "expect-url") {
    const ok = await poll(async () => address(page).includes(rest.trim()), 8000);
    if (!ok) throw new Error(`the address is ${address(page)}, not containing "${rest.trim()}"`);
    await settle(page, since);
  } else if (action === "expect-value") {
    const t = parseTarget(key);
    let seen = null, why = "";
    const ok = await poll(async () => { const f = await field(page, t); if (!f.el) { why = f.why; return null; } seen = await f.el.inputValue(); return seen === value; }, 5000);
    if (!ok) throw new Error(seen === null ? why : `"${t.text}" holds "${seen}", not "${value}"`);
  } else if (action === "js") {
    await page.evaluate(rest);
    await settle(page, since);
  } else if (action === "expect-js") {
    const ok = await poll(() => page.evaluate(`Boolean(${rest})`), 5000);
    if (!ok) throw new Error(`stayed false: ${rest}`);
  } else if (action === "wait") await page.waitForTimeout(Number(rest) || 500);
  else if (action === "shot") { const p = join(outDir, `try-${rest}.png`); await page.screenshot({ path: p }); notes.push(p); }
  else throw new Error(`unknown step "${action}"`);

  if (w.dialogs.length > popups) notes.push(`accepted a pop-up: "${w.dialogs.slice(popups).join('", "')}"`);
  return notes.join("; ");
}

// Signs in with the given steps in a fresh context and returns its saved state (cookies,
// local storage and IndexedDB, which covers cookie, token and Firebase-style sign-ins),
// plus the login page's path so callers can spot a bounce back to it.
// Waits for the app to leave the login page (or for network quiet) after the last step,
// because many apps save the session only once the sign-in request returns.
export async function signIn(browser, baseUrl, steps, outDir) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  let loginPath = null;
  const notes = [];
  try {
    for (const step of steps) {
      try {
        const note = await runStep(page, baseUrl, step, outDir);
        if (note.startsWith("found by")) notes.push(note);
      } catch (e) {
        const shot = join(outDir, "login-failed.png");
        await page.screenshot({ path: shot }).catch(() => {});
        throw new Error(`login step "${step}" failed: ${e.message.split("\n")[0].slice(0, 160)} (screenshot: ${shot})`);
      }
      if (loginPath === null && step.startsWith("goto:")) loginPath = new URL(page.url()).pathname;
    }
    loginPath ??= new URL(page.url()).pathname;
    await page.waitForURL((u) => u.pathname !== loginPath, { timeout: 8000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    const state = await context.storageState({ indexedDB: true });
    // Saved state leaves out sessionStorage (it belongs to one tab), so copy it separately.
    const session = await page.evaluate(() => ({ origin: location.origin, items: Object.entries(sessionStorage) })).catch(() => ({ items: [] }));
    const signedIn = state.cookies.length > 0 || session.items.length > 0 || state.origins.some((o) => o.localStorage.length || o.indexedDB?.length);
    if (!signedIn) throw new Error(`the login steps ran but no session was saved (no cookies or storage). Check the steps end by submitting the form; screenshot: ${join(outDir, "login-failed.png")}`);
    return { state, session, loginPath, notes };
  } catch (e) {
    await page.screenshot({ path: join(outDir, "login-failed.png") }).catch(() => {});
    throw e;
  } finally {
    await context.close();
  }
}

// A browser context that starts signed in when a login is given (otherwise a plain one).
export async function newContext(browser, login, options) {
  const context = await browser.newContext({ ...options, storageState: login?.state });
  if (login?.session.items.length) {
    await context.addInitScript(({ origin, items }) => {
      if (location.origin !== origin) return;
      for (const [k, v] of items) if (sessionStorage.getItem(k) === null) sessionStorage.setItem(k, v);
    }, login.session);
  }
  return context;
}
