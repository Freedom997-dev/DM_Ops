# Room Condition Inspection (PM V1)

The original feature — a digital replacement for the paper *Preventive
Maintenance / Guest Room Checklist*. Inspectors walk a room with a 95-item
checklist; each save creates an **immutable** inspection; a dashboard shows every
room's current condition.

> **Status: retired from the portal (2026-09-30).** The tile is hidden
> (`PM_V1_ON_PORTAL = false` in `src/app/(app)/services/page.tsx`) in favour of
> [PM V2](pm-v2.md). Routes, code and data remain and are reachable by URL for
> anyone with `pm:*` permissions. Plan: remove once V2 is proven.

## Status

| | |
|---|---|
| **Shipped** | 2026-06-23 (initial app); photos 2026-06-24; filters/exports/carry-forward 2026-07-18; search 2026-07-19 |
| **Routes** | `/services/pm`, `/services/pm/rooms`, `/services/pm/rooms/[id]`, `/services/pm/inspect/[roomId]`, `/services/pm/settings`, `/services/pm/settings/checklist`, `/api/exports/repairs`, `/api/exports/status-report` |

## Permissions (`pm` app)

| Permission | Allows | Default roles |
|---|---|---|
| `pm:dashboard:view` | Dashboard | Admin, Inspector |
| `pm:rooms:view` / `add` / `update` / `delete` | Room list/detail; create, edit, archive rooms (also `/settings/rooms`) | view: Admin, Inspector · edit: Admin |
| `pm:checklist:view` / `add` / `update` / `delete` | Checklist editor (sections & questions) | Admin |
| `pm:inspections:view` | Inspect page, history, Excel exports | Admin, Inspector |
| `pm:inspections:add` | Save an inspection | Admin, Inspector |
| `pm:inspections:update` | Delete a photo after save | Admin |
| `pm:inspections:delete` | Delete an inspection (action exists, no UI) | Admin |

## Pages

| URL | Purpose |
|---|---|
| `/services/pm` | Colour-coded room grid with stat cards that act as filters (`?view=`), repair breakdown per room, Excel export buttons |
| `/services/pm/rooms` | Room list; admins add/edit/archive (`?add`, `?edit=`) |
| `/services/pm/rooms/[id]` | Room detail + expandable inspection history with photo thumbnails/lightbox |
| `/services/pm/inspect/[roomId]` | New inspection form (carry-forward, sticky item search, per-item photos) |
| `/services/pm/settings`, `/settings/checklist` | Checklist editor |

## Room status

Derived from the **latest completed inspection** (`src/lib/status.ts`):

| Status | Colour | Rule |
|---|---|---|
| Not inspected | grey | No completed inspection |
| Needs repair | red | Latest summary = `NEEDS_REPAIR` (any item needs repair) |
| Fixed – verify | amber | No open repairs, but ≥1 item `REPAIR_COMPLETED` not yet re-checked |
| OK | green | Otherwise |

Item statuses: `OK`, `NEEDS_REPAIR`, `REPAIR_COMPLETED` ("Fixed"), `NA`.

## Behavior notes

- **Default OK.** Every item starts at OK; the inspector flips exceptions (95 items
  make tap-every-item impractical). Trade-off: a rushed save looks clean.
- **Carry-forward.** `NEEDS_REPAIR`, `REPAIR_COMPLETED` and `NA` from the last
  completed inspection pre-fill the new one (skipping archived questions), so an
  open repair can't silently "heal". The header shows how many repairs carried over.
- **Snapshot on save.** `questionText` / `sectionName` are copied into each
  `InspectionItem`; editing/archiving questions never changes history.
- **One save = one transaction.** Photos upload first, then inspection + items +
  image rows are written atomically; uploaded files are removed on failure.
- **Item search** — see [pm-item-search.md](pm-item-search.md).
- **Exports** (`src/lib/reports.ts` is the single source, matching the dashboard):
  - `/api/exports/repairs` → `divya-motel-repairs-<stamp>.xlsx` (open repairs)
  - `/api/exports/status-report` → Summary, Rooms, Repairs, Awaiting verification sheets
- Rooms and questions are **archived**, never deleted (inspections reference them).

## Data model

`Section`, `Question`, `Inspection`, `InspectionItem`, `InspectionItemImage`, plus
shared `Room`. See [data-model.md](../data-model.md#pm-v1--room-condition-hidden-from-portal).

## Key files

- `src/lib/actions/inspections.ts` — `saveInspection(FormData)` (JSON payload + `image-<questionId>-<n>` files)
- `src/lib/actions/photos.ts` — `deletePhoto`, `deleteInspection`
- `src/lib/actions/checklist.ts`, `rooms.ts`
- `src/lib/status.ts` — status meta + derivation; `src/lib/reports.ts` — report data
- `src/components/InspectForm.tsx`, `InspectSearchBar.tsx`, `HighlightedText.tsx`, `PhotoPicker.tsx`, `InspectionHistory.tsx`, `PhotoLightbox.tsx`, `ChecklistManager.tsx`, `RoomsManager.tsx`, `StatusBadge.tsx`
- `prisma/seed.ts` — the 3-section / 95-question checklist and 6 sample rooms

## Change log

- 2026-06-23 · Initial ship.
- 2026-06-24 · Per-item photo evidence ([inspection-photos.md](inspection-photos.md)).
- 2026-07-01 · Moved under `/services/pm/*` (Okta-style IA).
- 2026-07-18 · Stat-card filters, "Fixed – verify" status, carry-forward, Excel exports, local storage driver.
- 2026-07-19 · Item search.
- 2026-08-05 · Permissions moved to RBAC `pm:*`.
- 2026-09-30 · Hidden from the portal in favour of PM V2.
