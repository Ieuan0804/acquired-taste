---
name: setup
description: Use only when the user asks to set up, install, check or troubleshoot Acquired Taste, or when its review loop or image generation fails because something is missing or not signed in.
---

# Acquired Taste: setup check

The plugin root is two folders above this skill's base directory. Call it PLUGIN.

1. Tell the user you're checking their setup (it takes about 20 seconds).
2. Run `node "PLUGIN/scripts/setup.mjs"`.
3. For each `[fix]` line, explain in plain words what's missing and what the fix does, then offer to run the fix command for them. Installing packages (`npm install`, `npx playwright install chromium`, `npm install -g @openai/codex`) needs their OK first. The upscaler is optional: explain that it keeps generated heroes sharp on big and high-resolution screens, that it's a one-off ~45 MB download from the official Real-ESRGAN GitHub release, and run `node "PLUGIN/scripts/upscale.mjs" --install` only if they agree.
4. Signing in to Codex needs the user, because it opens their browser. Give them the exact commands to run in their own terminal (`codex logout`, then `codex login`, choosing **Sign in with ChatGPT**). On Windows, if `codex` isn't recognised, give the full path instead: `& "$env:APPDATA\npm\codex.cmd" login` in PowerShell.
5. Re-run the check after fixes. If they want proof that images work, run it with `--image` (about a minute, uses a little of their ChatGPT allowance, not their Claude usage).
6. Finish with a short summary: whether the review loop is ready, whether image generation is ready, and whether the upscaler is installed. If images aren't available, explain that sites will still be built with code-made visuals and clearly labelled photo placeholders.
