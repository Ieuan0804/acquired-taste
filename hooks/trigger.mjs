#!/usr/bin/env node
// UserPromptSubmit hook: when a prompt looks like a request to build or change a website
// or web UI, remind Claude to use the web-design skill. Skills don't reliably trigger on
// their own (an installed design skill was never used in testing), so this is code, not hope.

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let prompt = "";
try {
  prompt = JSON.parse(raw).prompt ?? "";
} catch {
  process.exit(0);
}

// Slash commands are explicit choices; leave them alone.
if (/^\s*\//.test(prompt)) process.exit(0);

const subject = /\b(web ?sites?|landing ?pages?|home ?pages?|web ?pages?|dashboards?|admin (panel|screen|page|area)s?|web ?apps?|app screens?|store ?fronts?|online (shop|store)s?|e-?commerce|product pages?|checkout|portfolio site|booking (page|site|system)|hero section|pricing page|front ?end|user interface|ui|(web |booking |mobile |shop |till |pos |admin )?apps?|sites?|screens?|interface|look and feel|layout)\b/i;
const verb = /\b(build|make|create|design|redesign|restyle|reskin|modern[iy]se|polish|tidy up|style|code|develop|add|improve|revamp|refresh|mock ?up|prototype|set up|need|want)\b/i;

if (subject.test(prompt) && verb.test(prompt)) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext:
        "Acquired Taste: if this request involves building, designing or changing a website or web UI, invoke the acquired-taste:web-design skill (Skill tool) before writing any UI code. If it's a redesign, restyle or polish of an existing project, invoke acquired-taste:redesign instead. If it doesn't involve UI, ignore this note.",
    },
  }));
}
process.exit(0);
