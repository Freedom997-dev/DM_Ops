# Room Condition V2 (PM V2) — Beta

A second version of the Room Condition / Preventive Maintenance service, rebuilt from the "Room Condition PM" Claude artifact inside the DM Ops UI. It runs **side by side** with PM V1 (`/services/pm`); once V2 is proven, V1 is removed.

## Status

| | |
|---|---|
| **Branch** | `feature/pm-v2` |
| **Source design** | Claude artifact "Room Condition PM" (single-file prototype, data in the artifact DB) |
| **Live URL path(s)** | `/services/pm-v2`, `/services/pm-v2/inspect/[areaId]`, `/services/pm-v2/issues`, `/services/pm-v2/report`, `/services/pm-v2/setup`, `/api/exports/pm-v2` |

## How it differs from V1

| | V1 | V2 |
|---|---|---|
| Unit of work | Immutable inspection, many per room | **One inspection per area per quarter** (`2026-Q3`), edited in place, auto-saved |
| What's inspected | Rooms only | Rooms **and** other areas (lobby, pool, roof…) with groups |
| Checklists | One global checklist | **Many named checklists**; each area picks one |
| Statuses | OK / Needs repair / Repair completed / N/A | OK / Repair / Replace / Missing / Fixed / N/A |
| Extras | — | One-off items "added for this room" |
| Sharing | Excel exports | PDF (browser print), Excel (4 sheets), copyable WhatsApp message |
| Photos | Yes | Not yet (the artifact had none) |

## Roles

Separate RBAC app `pmv2` so the beta can be granted to a few people without touching V1 access.

| Permission | Allows |
|---|---|
| `pmv2:board:view` | See the board, inspections and repair list |
| `pmv2:inspections:submit` | Record results, notes, complete/reopen, mark fixed |
| `pmv2:reports:view` | Report tab + Excel export |
| `pmv2:setup:configure` | Checklists, rooms & areas, hotel name |

New installs: Admin gets all four; Inspector gets view/submit/reports. **Existing databases:** the seed never edits existing roles, so only Super Admin sees V2 until you grant `pmv2:*` in Settings → Roles.

## Data model

All tables are new and prefixed `PmV2*`: `PmV2Setting`, `PmV2Checklist` → `PmV2Section` → `PmV2Item`, `PmV2Area`, `PmV2Inspection` (unique per `areaId + quarter`) → `PmV2Result`. Shares nothing with V1 except an optional `PmV2Area.roomId → Room` link (lines V2 up with Housekeeping; V2 never writes to `Room`) and `User`.

- Removing a checklist item/section/area **archives** it, so past results keep their labels.
- `PmV2Result.itemId = null` + `label` = a one-off added item; `status = null` = not checked.
- Dates are plain `YYYY-MM-DD` strings sent from the browser, so "today" is the inspector's local day, not the server's UTC day.

## Data import from the artifact

- `prisma/pmv2-seed.json` — checklists, 66 rooms/areas and hotel name taken from the artifact. `prisma/seed.ts` loads it only when V2 has no checklists.
- `tsx prisma/pmv2Import.ts <export-dir>` — one-off import of config **and inspections** from an artifact DB export (`config/*.json`, `inspections/<quarter>__<areaId>.json`). Artifact ids are kept as primary keys, so it is safe to re-run; `resolveConflict()` decides what happens when V2 already has an inspection for that area+quarter.

## Key files

- `src/lib/pmv2.ts` — statuses, colours, quarter/date helpers (client-safe)
- `src/lib/pmv2-data.ts` — server loaders; single source for board, issues, report, Excel
- `src/lib/pmv2-messages.ts` — WhatsApp short/detailed message text (runs in the browser)
- `src/lib/actions/pmv2.ts` — all server actions (permission-checked)
- `src/components/pmv2/*` — nav, inspect form (optimistic + auto-save), report, setup
- `src/app/(app)/services/pm-v2/*` — pages; `src/app/api/exports/pm-v2/route.ts` — Excel

## Behavior notes

- **Auto-save.** Taps save immediately; typing saves after ~0.9 s; unsent typing is flushed when you leave the page. Individual taps are not audit-logged (they would flood the log); complete/reopen/mark-fixed and every setup change are.
- **Progress** = active checklist items + extras. Results for archived items still appear on the repair list as "Removed from checklist".
- **Tapping the selected status again clears it** (same as the artifact).

## Removing V1 later

Delete `src/app/(app)/services/pm/`, V1 components/actions (`InspectForm`, `inspections.ts`, `checklist.ts`, …), the `pm` RBAC app, V1 exports, and (after a data backup) the `Section/Question/Inspection*` models. Then optionally move V2 to `/services/pm`.
