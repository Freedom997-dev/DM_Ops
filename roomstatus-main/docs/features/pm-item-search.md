# PM Inspect — Item Search ("find on page")

A Ctrl+F-style search on the PM inspection form so an inspector can jump to any of the
95 checklist items fast, without hiding the rest.

## Purpose

The inspect form lists 95 items across 3 sections. Finding one (e.g. "Smoke Alarm") by
scrolling is slow on a phone during a walkthrough. This adds highlight-and-scroll search
that keeps the full, accountable checklist on screen.

## Behaviour

- **Highlight + scroll, never filter.** All items stay visible; matches are highlighted
  and the view scrolls to the current one.
- **Ctrl+F style** for multiple matches: a live count (`2 / 9`), prev/next arrows,
  `Enter` / `Shift+Enter` to step through.
- Empty query → counter + arrows hidden. Zero matches → greyed `0 / 0`, arrows disabled.
- **PM inspect form only** — the Daily Cleanliness matrix is unchanged.

## Matching

Case-insensitive substring match on each item's text, evaluated in document order
(section order → item order). The current match scrolls into view and is emphasised;
other matches get a lighter highlight.

## UI

A compact **sticky bar** pinned just under the app header, full width, one row on mobile:

```
🔍  [ Search items… ]   2 / 9   ▲  ▼   ✕
```

Sits between the page title and the first section card; stays visible while scrolling.

## Key files

- `src/components/InspectSearchBar.tsx` — the sticky search bar (query, count, nav).
- `src/components/HighlightedText.tsx` — wraps matched substrings in a highlight span.
- `src/components/InspectForm.tsx` — hosts the bar and coordinates match state + scroll.

## Scope

PM inspect form only. No data model, server, or API changes — this is a pure client-side
UX enhancement.

## Change log

- **2026-07-19** — Shipped (spec: `docs/superpowers/specs/2026-07-19-pm-item-search-design.md`).
