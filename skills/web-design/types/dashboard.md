# Dashboards and admin panels

**Success:** the person using it can answer "is anything wrong, and where?" in five seconds, at their real viewing distance. On a wall monitor, that means from across the room.

**Starting dials:** layout variance 3, motion 4 (functional, but alive), density 8.

Premium here means clarity first, and then desire: it should look like something people want to have open all day, modern and expensive, not merely correct. No custom cursors, marketing hero images or decorative scroll effects; the beauty comes from the data itself. When looks and clarity conflict, clarity wins.

## The modern product baseline

Every dashboard and app screen starts from how a current, well-funded product looks (open `craft/product-references.png`, six screens the plugin's author starred: Mercury, Stripe, shadcn, Vercel, Linear, Flighty). The picture is the quick check. For a closer look at how one of them handles something specific (a table, filters, a dark screen), you can open its live page: [Mercury](https://demo.mercury.com/dashboard), [Stripe](https://docs.stripe.com/connect/dashboard/review-actionable-accounts), [shadcn](https://ui.shadcn.com/examples/dashboard), [Vercel](https://vercel.com/docs/observability), [Linear](https://linear.app/insights), [Flighty](https://flighty.com/airports/hamburg-ham/tv). Optional, only when it helps. Clear and correct isn't enough: a screen can work perfectly and still look like a 2010 spreadsheet. The baseline:

- **Soft shapes:** 6-12px corners on cards, inputs and buttons; pills for status. Never sharp 0-2px boxes everywhere.
- **Space separates, not lines.** Group with whitespace and gentle background fills; use a hairline only where rows need it (table rows, a sidebar edge). No border round every cell.
- **Room to breathe, even when dense:** 16-24px padding in panels, 44-52px table rows, a clear gap between sections. Dense means more information, not less space.
- **Controls at a real size:** buttons and inputs 32-40px tall, clear hit areas, icons 16-20px from one set. **The primary action sits top right of the page header** (one dark or brand-filled button), secondary actions beside it as quiet outlined or ghost buttons, row actions on hover or behind a "⋯" menu.
- **Modern sans for the interface:** page titles 24-32px semibold, body and table text 14-15px, labels 12-13px muted, sentence case. Mono only for small codes, IDs and timestamps, never headings or body text.
- **Layered surfaces:** canvas, raised panels, then floating layers (menus, dialogs) with a soft shadow; everything else flat.
- **Every interactive thing has a state:** hover, focus ring, pressed, selected, disabled.

The concept spine lives in **one signature component** (a coverage strip, a ring map, a status board), not in the whole interface. Around it, the product follows the baseline.

## What finished looks like

The bar is calm, precise and modern: clear and concise, with nothing decorative. These qualities are a toolbox, not a template; use the ones that fit the brief and the business's own brand, so two dashboards never look alike.

- **Quiet canvas, colour with meaning.** A near-white or near-black canvas, hairline borders or none, very little shadow. Colour appears only where it means something: status, the one series that matters, the primary action. A screen that is mostly neutral makes one red thing impossible to miss.
- **One big number per question.** The answer is large (often 28-40px) with its unit and its comparison right beside it ("$998,225 · Money in $1.9M"), labels small and muted above. Not a row of equal cards: the most important figure is visibly bigger.
- **Precise type.** A modern sans in two or three weights, tabular figures everywhere, right-aligned number columns, small muted labels, sentence case (see the baseline above for sizes and where mono belongs).
- **Tables are the workhorse.** Generous row height, quiet header, a status pill per row (small, tinted background, coloured text), the key column bold, numbers right-aligned, an inline sparkline or bar where a trend helps. Filters and saved views sit above in one quiet row.
- **Counts as filters.** A strip of status counts ("All 15,586 · Restricted 624 · In review 795") that filters the list below when clicked: the summary and the drill-down are the same control.
- **Words that explain the chart.** A short sentence beside a trend saying what changed and why ("Money out was $303k across 182 transactions, up 89% on the prior period") beats a second chart.
- **Maps that carry status.** A muted, desaturated base map; vehicles, stops and sites as clear coloured markers; small labels on the map itself ("+3 min", "15 min"); the route as one bold line. Never a default full-colour map with default pins.
- **Wall screens rank problems.** For a monitor read from across the room: a dark or light board with huge numerals, the worst items listed first with their figures, colour-coded markers on a map, a thin live ticker of what's happening, and the time and freshness shown. Healthy items come after the problems.
- **People-by-time grids** (rotas, schedules, bookings): names down the side, time across, blocks coloured by role or status with the detail inside the block, gaps and conflicts visibly different.
- **A signature moment.** Like a landing page's hero, every dashboard gets one beautiful thing that is also its most useful thing: a gorgeous live map, a custom-drawn status board, a striking big-number display, a timeline of the day. Name it in the design read and spend the extra care there.
- **Dark done properly** (when dark suits the context): deep, slightly tinted blacks (not flat #111 grey), surfaces separated by a step in lightness and a fine 1px border that catches light, a soft glow only on live and status elements, text in warm off-white rather than pure white.
- **Type with character on the numbers.** The big figures are the hero: a display face with distinctive, tabular numerals, set large and tight, chosen with `craft/type.md` like any brand font. Labels stay quiet.
- **Alive, not busy:** values roll to their new number, live items breathe with a slow pulse, lists slide into a new order, map markers glide between positions, a new alert slides in once. Nothing loops just to move.
- **Light depth:** layered panels, a subtle inner highlight on raised surfaces, soft light or grain on the canvas when the brand suits it. Never heavy drop-shadowed cards.
- **Small finish details:** a live dot with "Updated 12s ago", consistent 8px spacing steps, one radius, keyboard shortcuts shown in menus, an empty state with one helpful sentence and one action.

The template to avoid is also a look: a generic admin kit, bright gradients, every panel in a heavy card, rainbow charts.

## The template to avoid

- A row of identical KPI cards with tiny green arrows.
- Donut charts for everything, rainbow series colours, gradient area charts.
- Every panel with equal weight.
- Tiny text on a big screen.
- Fake round numbers.
- No sign of how fresh the data is.

## Build it with

- **One focal status:** an overall state that changes visibly when something is wrong (calm when fine, unmistakable when not).
- **Exceptions ranked by urgency,** each with what's wrong, where, and the next action.
- **Context next:** the map, list or table that locates the problem, then trends compared with normal.
- **Drill-down:** click any exception or entity for its details without losing your place.
- **Status colours reserved for status:** everything else neutral, plus one accent. Never encode meaning by colour alone; add an icon or label too.
- **Theme by context:** an all-day wall monitor or control room defaults to **dark done properly** (above), unless the brand or brief says otherwise; office tools usually light. Choose deliberately and say why.
- **Type for the distance:** tabular figures, and key figures large enough to read across the room. For wall screens, body text is at least 16px at 1920 width.
- **Data freshness:** "Updated 12s ago" and a visible stale-data state.
- **Every state:** normal, problem, loading, stale and empty.

## Believable live data

A dashboard demo is only convincing if the data behaves like the real thing. Build a small simulator (`lib/sim.ts`) rather than a static JSON file:
- **Seeded,** so the same page shows the same story every load and in screenshots; values drift from there.
- **Real shapes:** time-of-day patterns (quiet at 6am, a lunchtime peak), noise, and occasional outliers. Never round numbers or perfectly smooth lines.
- **From the brief:** real place names, routes, roles and units for this business. A delivery board in Leeds names Leeds streets.
- **A problem to find:** the default story contains one or two real issues (a van running 25 minutes late, a shift with no cover), so the five-second test has an answer.
- **States on demand:** `?state=normal|problem|stale|empty|loading` forces each state, so the review can capture all of them and the user can see them.
- Updates arrive at irregular intervals (every 3-12 s), and only changed values animate.

## Motion for this type

- Values tick to their new number.
- A new alert gets a brief pulse.
- Lists reorder smoothly.
- Map markers glide between positions; live items breathe with a slow pulse.
- Nothing loops for decoration.

## Checks

- Review every state as its own route: `review.mjs <url> "/?state=problem" "/?state=stale" "/?state=empty"` (the default `/` is normal). Normal and problem must look clearly different at a glance.
- Halve the 1920 screenshot (or view it at 50%): the overall status, the top problem and its location are still readable.
- A freshness label is visible, and the stale state is designed.
- **The 2026 test:** open `craft/product-references.png` next to your own 1440 screenshot. Does yours look as current and refined (corners, spacing, controls, type, surfaces)? If it looks older, plainer or more cramped, fix it before moving on. Compare finish, never copy layouts.
- The signature moment named in the design read was built, and it's the best-looking part of the screen.
- Every chart follows `craft/charts.md` (labelled axes or units, one highlighted series, no default library look).
