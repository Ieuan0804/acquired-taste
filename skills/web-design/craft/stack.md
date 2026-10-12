# Stack

Use established tools that any developer can pick up and edit later. Sites should be able to grow, for example from a landing page to a customer hub and a staff dashboard, in one codebase.

## New projects

- **Start from the plugin's starter**, not a fresh scaffold: `node "PLUGIN/scripts/new-project.mjs" <dir> --name <site-name>` (PLUGIN is two folders above this skill's base directory). In about 15 seconds it creates a Next.js + TypeScript + Tailwind + GSAP project with the dependencies installed, a token block in `app/globals.css` and a reduced-motion baseline. Then set the design tokens and fonts, and build.
- **Next.js** (App Router, TypeScript). Pages that don't need a server should be static.
- **Styling:** Tailwind CSS. The design system's tokens (colours, type scale, spacing, radius) are CSS variables in the global stylesheet, and Tailwind uses them. Don't ship a component library's default look. If you use primitives such as Radix, style them to the design system.
- **Fonts:** chosen and installed with `type.md` (free for commercial use only). At most two families plus an optional mono.
- **Icons:** one set (Phosphor, Lucide or Tabler) or bespoke SVG, with a consistent stroke and size.
- **Motion:** use the plugin's tested motion blocks (`scripts/add-blocks.mjs`, see `motion.md`), plus CSS transitions for hover and focus states and custom GSAP only for the signature moment. Never animate on raw `scroll` event listeners. Respect `prefers-reduced-motion` everywhere.
- **Routes for mixed briefs:** the marketing site at `/`, the customer area at `/hub` (or what the brief calls it), staff and admin screens at `/admin` or `/dashboard`.
- The project must pass `npm run build` with no errors and no hydration warnings.
- **Round computed numbers that end up in the HTML** (SVG coordinates from `Math.sin`/`Math.cos`, percentages, generated positions) to 2 decimal places, e.g. `Math.round(x * 100) / 100`. The server and the browser can print the same calculation slightly differently, which breaks hydration. Anything random or time-based (`Math.random`, `Date.now`) goes in an effect, never in the first render.
- **Override a framework's styles through the values it uses, then check the built CSS.** CSS minifiers merge and drop declarations they think are redundant: a `translate: none !important` meant to cancel Tailwind's `-translate-x-1/2` was silently removed in production (Tailwind v4 positions with `translate: var(--tw-translate-x) var(--tw-translate-y)`, so set `--tw-translate-x: 0` and `--tw-translate-y: 0` instead). After `npm run build`, grep the built stylesheet for any override the layout depends on.
- **Write files with your file-writing tool, not shell heredocs** (`cat > file <<EOF`). Long JSX and CSS trip up shell quoting, and every run that tried it lost time switching over.
- **Edit code with your file-editing tool, never shell string replacement** (PowerShell `-replace`, `sed`, inline Python). On Windows especially, backslashes, `$` and backticks in code get mangled silently: a redesign run broke a file this way and had to repair it.

## Existing projects

Use the framework and conventions already there. Never migrate a project to a new stack unless asked.

## A tiny one-page site, if the user asks for no build step

Plain HTML, CSS and JS in one folder is fine.

## Running servers safely

Start and stop servers only with the plugin's `scripts/serve.mjs` (see `review.md`). It picks a free port and stops exactly the process it started. **Never kill processes by name** (`taskkill /IM node.exe`, `pkill node`): other programs on the machine use Node too.

## Hand-over files

- `HOW-TO-RUN.md`: install, run in development, build and run in production, the local URL and every page route.
- `.acquired-taste/design-system.md`: the design read and tokens (step 4 of the skill).
- `.acquired-taste/decisions.md`: what the user kept or rejected.
