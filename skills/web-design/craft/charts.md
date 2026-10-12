# Charts

A chart answers one question. If you can't say the question in a sentence ("are deliveries later than normal today?"), it's decoration: cut it or replace it with a number and a sentence.

## Pick the form from the question

- **Change over time:** a line (one or two series), or bars for counts per day or hour.
- **Compare a few things:** horizontal bars, sorted, labelled at the bar end. Not a donut.
- **Part of a whole:** a single stacked bar or a short ranked list with percentages. A donut only for 2-3 parts, never as decoration.
- **Against a target or normal:** the line plus a shaded "normal range" band or a dashed target line.
- **Distribution or ranges:** a histogram (thin bars, small gaps).
- **Many items over time** (rows of routes, staff, accounts): a table with an inline sparkline or bar per row, not a spaghetti chart.
- **Position and movement:** a map (see `types/dashboard.md`).

## Make it look finished

- **One colour carries the meaning.** The series that matters gets the accent; comparison series are a muted grey or a lighter tint of it; status colours only where they mean status. Never a rainbow palette.
- **Thin and quiet:** 1.5-2px lines, no markers except the latest point or the one being discussed, light or no gridlines (3-5 horizontal hairlines at most), no chart border, no drop shadows, no 3D.
- **Fills:** a flat, very light tint under a single line at most. No bright gradients.
- **Labels:** axis ticks small and muted, with units ("12k", "45 min", "£"). Few ticks, round values. Dates in the locale (UK: 14 Oct). Label lines directly at their end instead of a legend when there are 2-3 series.
- **Say the point:** the headline number and its comparison sit above the chart, and the one interesting moment is annotated on it ("Storm closed the M62 · 14:20"). A dashed segment shows partial or forecast data.
- **Numbers:** tabular figures, sensible precision (no "45.2381%"), and the same format everywhere.
- **Hover:** a crosshair and one compact tooltip with exact values and the date. Charts stay readable without hovering.
- **Empty and loading:** a skeleton at the chart's real size while loading; an empty chart says why ("No deliveries yet today. The first run leaves at 07:00").

## Building them

- Use a chart library for the drawing (Recharts or visx in React, or hand-written SVG for a sparkline), then **override its defaults**: colours, fonts, gridlines, tooltip and axis styles. A recognisable default library look is a tell.
- Round SVG coordinates and keep server and client data identical (seeded), or Next.js hydration breaks.
- Animate only on first appearance or on a real data change, quickly (300-500 ms). No looping motion.
- Check contrast: muted labels still need to be readable (4.5:1 for text).
