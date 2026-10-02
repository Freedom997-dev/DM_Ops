# Room Condition V2 (PM V2) — Beta

The current Room Condition / Preventive Maintenance tool. Rebuilt from the "Room
Condition PM" Claude artifact inside DM Ops. Each **room or common area** gets
**one inspection per quarter**, edited in place with auto-save; open issues roll
up into a repair list and a shareable report.

PM V1 (`/services/pm`) still exists but its tile is hidden from the portal
(`PM_V1_ON_PORTAL = false` in `src/app/(app)/services/page.tsx`).

## Status

| | |
|---|---|
| **Shipped** | 2026-09-28 on `main` (`15066d6`); portal tile labelled "Room Condition V2 (Beta)" |
| **Source design** | Claude artifact "Room Condition PM" (single-file prototype with its own data store) |
| **Routes** | `/services/pm-v2`, `/services/pm-v2/inspect/[areaId]`, `/services/pm-v2/issues`, `/services/pm-v2/report`, `/services/pm-v2/setup`, `/api/exports/pm-v2` |
| **Quarter param** | Every page takes `?q=YYYY-Qn`; default = current quarter |

## How it differs from V1

| | V1 | V2 |
|---|---|---|
| Unit of work | Immutable inspection, many per room | **One inspection per area per quarter**, edited in place, auto-saved |
| What's inspected | Rooms only | Rooms **and** areas (lobby, pool, roof…) with groups |
| Checklists | One global checklist | **Many named checklists**; each area picks one |
| Statuses | OK / Needs repair / Repair completed / N/A | OK / Repair / Replace / Missing / Fixed / N/A |
| Extras | — | One-off items "added for this room" |
| Sharing | Excel | Print/PDF, Excel (4 sheets), WhatsApp short/detailed text |
| Photos | Yes | Not yet |

## Pages

| Page | What it does |
|---|---|
| **Board** `/services/pm-v2` | Quarter picker; areas grouped by `group` with per-group done counts; each tile shows Complete / `ans/total checked` / Not started and an issue count; filters |
| **Inspect** `/inspect/[areaId]` | Walk-through form: date, initials, general notes; sections with a segmented status control per item; per-item note; "mark section OK"; add extra items; **Mark complete / Reopen**. Read-only without `pmv2:inspections:submit` |
| **Issues** `/issues` | Every Repair/Replace/Missing (open) and Fixed result for the quarter, grouped by area; **Mark fixed** sets `FIXED` + today's date |
| **Report** `/report` | Totals, by-status counts, rooms table, open + fixed lists; browser print → PDF; Excel download; copy WhatsApp message (short or detailed) |
| **Setup** `/setup` | Hotel name; checklists → sections → items (add/rename/reorder/remove); rooms & areas (bulk-add a number range, add area, edit group/type/checklist, remove) |

## Permissions

Separate RBAC app `pmv2`, so the beta can be granted independently of V1.

| Permission | Allows | Default roles |
|---|---|---|
| `pmv2:board:view` | Board, inspect (read), issues | Admin, Inspector |
| `pmv2:inspections:submit` | Record results/notes/meta, complete/reopen, mark fixed | Admin, Inspector |
| `pmv2:reports:view` | Report tab + Excel export | Admin, Inspector |
| `pmv2:setup:configure` | Setup page and all setup actions | Admin |

⚠️ Existing databases: the seed never edits existing roles, so on production you
may need to grant `pmv2:*` in Settings → Roles & permissions.

## Data model

`PmV2Setting`, `PmV2Checklist → PmV2Section → PmV2Item`, `PmV2Area`,
`PmV2Inspection` (unique `areaId + quarter`) `→ PmV2Result`. Shares nothing with
V1 except `User` and an optional `PmV2Area.roomId → Room` link (lines V2 up with
Housekeeping; V2 never writes `Room`). Full detail: [data-model.md](../data-model.md#pm-v2--room-condition-quarterly).

- Removing a checklist/section/item/area **archives** it; past results keep labels.
  A checklist in use by active areas can't be removed.
- `PmV2Result.itemId = null` + `label` = extra item; `status = null` = not checked.
- Dates are `YYYY-MM-DD` strings from the **browser**, so "today" is the
  inspector's local day.

## Behavior notes

- **Auto-save.** Status taps save immediately; note/initials typing saves after
  ~0.9 s (date after 0.2 s). A save indicator shows *Saving… / All saved / Not
  saved*; leaving with unsaved changes triggers a `beforeunload` warning. The
  first save for an area+quarter upserts the inspection.
- **Tapping the selected status again clears it** (matches the artifact).
- **Progress** = active checklist items + extras; *answered* = any status set;
  *issues* = Repair/Replace/Missing. State: `done` (marked complete) → `prog`
  (any answer) → `todo`.
- Results for since-archived items still appear on the repair list as
  "Removed from checklist".
- **Audit:** per-tap edits are *not* logged (they'd flood the log); complete /
  reopen / mark fixed and every setup change are.
- One data loader (`src/lib/pmv2-data.ts` → `loadQuarter`, `issueLines`,
  `buildReport`) feeds board, issues, report and Excel, so numbers always agree.

## Data import from the artifact

- `prisma/pmv2-seed.json` — checklists, 66 rooms/areas and hotel name from the
  artifact. `prisma/seed.ts` loads it only when V2 has no checklists.
- `npx tsx prisma/pmv2Import.ts ../pmv2-artifact-export` — one-off import of config
  **and inspections** from an artifact export (`config/*.json`,
  `inspections/<quarter>__<areaId>.json`). Artifact ids are kept as primary keys,
  so re-running is safe; `resolveConflict()` decides what happens when V2 already
  has an inspection for that area+quarter.

## Key files

- `src/lib/pmv2.ts` — statuses, colours, quarter/date helpers (client-safe)
- `src/lib/pmv2-data.ts` — server loaders (single source for all views)
- `src/lib/pmv2-messages.ts` — WhatsApp short/detailed text (runs in the browser)
- `src/lib/actions/pmv2.ts` — all server actions
- `src/components/pmv2/*` — `PmV2Nav`, `PmV2InspectForm` (optimistic + auto-save), `PmV2Report`, `PmV2AreasSetup`, `PmV2ChecklistSetup`, `PmV2FixButton`, `ProgressBar`
- `src/app/(app)/services/pm-v2/*` — pages; `src/app/api/exports/pm-v2/route.ts` — Excel

## Not yet built

Photos per item, carry-forward of open issues into the next quarter, per-room
history across quarters, linking repairs to Housekeeping, "Beta" label removal.

## Removing V1 later

When V2 is proven:
1. Back up production.
2. Delete `src/app/(app)/services/pm/`, V1-only components (`InspectForm`,
   `InspectSearchBar`, `HighlightedText`, `InspectionHistory`, `ChecklistManager`),
   actions (`inspections.ts`, `photos.ts`, `checklist.ts`), `src/lib/reports.ts`,
   the V1 export routes (`repairs`, `status-report`) and the PM tile code in
   `services/page.tsx`.
3. **Keep shared pieces:** `PhotoPicker` (workflow row photos), `PhotoLightbox`,
   `rooms.ts` / `RoomsManager` / `StatusBadge` / `src/lib/status.ts`
   (`/settings/rooms` shows V1 room status — replace that column or drop it).
   Re-key `pm:rooms:*` to an `admin:rooms:*` feature first, and update the
   `local-images` route's default permission (`pm:inspections:view`), which also
   guards workflow photos.
4. Remove the `pm` app from the catalog and defaults.
5. In a separate deliberate release, drop `Section`, `Question`, `Inspection*`
   tables. Optionally move V2 to `/services/pm`.

## Change log

- **2026-09-28** · Initial V2: board, inspect, issues, report (PDF/Excel/WhatsApp), setup, artifact import, `pmv2` RBAC app.
- **2026-09-30** · Next 16 async params; V1 tile hidden from the portal.
