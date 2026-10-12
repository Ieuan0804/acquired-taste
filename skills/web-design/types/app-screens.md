# Web app screens

**Success:** the user finishes their task quickly without having to think, and the screens feel like a real, considered product rather than an admin template.

**Starting dials:** layout variance 3, motion 3 (functional only), density 6.

## The template to avoid

- A generic admin template where everything sits in a bordered card.
- Several equally loud buttons with no clear primary action.
- Grey placeholder data.
- Only the happy path designed.

## Build it with

- **The look:** read "The modern product baseline" and "What finished looks like" in `types/dashboard.md`; both apply to every app screen. Run its 2026 test in review.

- **One clear primary action per screen,** visually dominant. Secondary actions stay quiet.
- **Realistic sample data** from the brief (names, times, amounts) that shows the interesting cases: conflicts, gaps, long names, empty days.
- **Every state designed:** empty (with a helpful next step), loading, error (what happened and how to fix it), success and confirmation.
- **Consequences shown before they happen:** previews of what approving or deleting will change.
- **Consistent navigation** and page structure across screens.
- **Keyboard and focus:** visible focus rings, logical tab order, Enter and Escape behaving as expected.
- **Mobile:** if the brief says it's used on a phone, each screen gets a real mobile layout. Tables become lists, and actions sit within thumb reach. Don't just shrink it.
- **Numbers** use tabular figures. Times and dates follow the locale (UK: 24-hour times or am/pm consistently, DD Month).

## Motion for this type

Functional only: state transitions, list reordering, a brief confirmation. Nothing decorative that slows a repeat task.

## Checks

- Each screen has exactly one primary action.
- Empty, loading and error states exist for every screen with data.
- Each requested screen works at 390px when phone use is mentioned.
- Every flow that ends on a screen is walked end to end with `try.mjs --journeys .acquired-taste/journeys.txt` (create, save, book, check out; see `craft/review.md` step 3, never your own script), and what opens at the end is checked, on the production build too. Panels and dialogs opened by a flow can differ from the same screen opened directly.
- Tablet widths (768-1180px) checked if the app is used at a counter or on the move: navigation often overflows there first.
