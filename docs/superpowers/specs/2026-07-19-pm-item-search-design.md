# PM Inspect Form — Item Search Design

**Date:** 2026-07-19
**Status:** Approved (build)
**Scope:** Add a "find on page" item search to the PM (Room Condition) inspection form only.

## Problem

The PM inspect form (`InspectForm.tsx`) lists **95 checklist items across 3 sections**. Finding
a specific item (e.g. "Smoke Alarm", "Shower Head") means scrolling a long list, which is slow
on a phone during a walkthrough.

## Goal

A Ctrl+F-style search that lets the inspector jump to items fast **without hiding any items** —
the full checklist stays intact and accountable.

## Behavior (decided with user)

- **Highlight + scroll**, never filter/hide. All 95 items stay on screen.
- **Ctrl+F style** for multiple matches: a match count (`2 / 9`), prev/next arrows, Enter/Shift+Enter.
- **PM form only.** No changes to the Daily Cleanliness matrix.

## UI

A compact **sticky bar** pinned at `top-[60px]` (just under the `sticky` app header), full width,
one row on mobile:

```
🔍  [ Search items…            ]   2 / 9   ▲  ▼   ✕
```

- Empty query → counter + arrows hidden.
- 0 matches → greyed `0 / 0`, arrows disabled.
- Sits between the page title and the first section card; stays visible while scrolling.

## Matching rules

- **Case-insensitive substring** match on item text (`q.text`), trimmed.
- Runs across all sections/items in **document order** (section order → item order); that order
  defines the prev/next sequence.
- Matches item text only — not section names, notes, or status.

## Highlighting (mirrors browser find)

- Every match: matched substring wrapped in `<mark>` (soft yellow `bg-yellow-200`).
- **Active** match additionally: `ring-2 ring-inset ring-brand-500` on the row + scrolled to
  **center** of viewport (`scrollIntoView({ block: "center", behavior: "smooth" })`).
- Blue (brand) for search vs. amber for carried-repair rows — the two never visually collide;
  the ring composes over the existing amber background without changing it.

## Keyboard & interaction

| Action | Result |
|---|---|
| Type | Live match update; active resets to first match, scrolls to it |
| Enter / ▼ | Next match (wraps) |
| Shift+Enter / ▲ | Previous match (wraps) |
| Escape / ✕ | Clear search |

## Components (client-only)

- **`useItemSearch(items)`** hook (`src/components/useItemSearch.ts`) — owns matching, active
  index, next/prev/clear. Returns `{ query, setQuery, matchIds, matchSet, activeId, activeIndex,
  total, next, prev, clear }`.
- **`InspectSearchBar`** (`src/components/InspectSearchBar.tsx`) — presentational sticky bar,
  driven by the hook's return value; owns the input keydown handling.
- **`HighlightedText`** (`src/components/HighlightedText.tsx`) — renders text with `<mark>` around
  every occurrence of the query.
- **`InspectForm`** (modified) — instantiates the hook, renders the bar, registers each row in a
  `Map<questionId, HTMLElement>` ref, and runs one effect that scrolls `activeId` into view.

## Out of scope (YAGNI)

No server/DB/schema changes, no new dependencies, no filtering, no matrix changes, no
regex/fuzzy matching, no search of notes or section names.

## Verification (repo convention: type-check + manual)

- `npx tsc --noEmit` clean.
- Manual smoke on `/services/pm/inspect/<roomId>`:
  - Search "door" → count correct; ▲▼/Enter/Shift+Enter cycle and center each match.
  - `<mark>` renders on matched substrings; active row shows the brand ring.
  - Escape / ✕ clears; no items ever hidden.
  - Status buttons, per-row notes, and photo pickers still work.
  - Mobile viewport shows one tidy row; bar stays pinned under the header while scrolling.
