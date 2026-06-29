# Room Condition Inspection

The original feature — a digital replacement for the paper "Preventive Maintenance / Guest Room Checklist." Staff inspect rooms on a phone or computer; a live dashboard shows the current condition of every room. Every inspection is stored permanently and every change to the checklist is logged.

## Status

| | |
|---|---|
| **Shipped on** | 2026-06-23 (initial app) |
| **Design spec** | n/a — pre-spec-discipline |
| **Implementation plan** | n/a |
| **Live URL path(s)** | `/dashboard`, `/rooms`, `/inspect/[roomId]`, `/admin/*` |

## Roles

| Role | What they can do |
|---|---|
| ADMIN | Everything: add/edit/archive rooms, edit checklist sections/questions, manage staff, view activity log, run inspections, delete inspections |
| INSPECTOR | Run inspections, view dashboard and history |

## Routes

| URL | Component / handler | Purpose |
|---|---|---|
| `/dashboard` | `src/app/(app)/dashboard/page.tsx` | Color-coded grid of every non-archived room with summary stats |
| `/rooms` | `src/app/(app)/rooms/page.tsx` | Admin room manager (add/edit/archive); list view for inspectors |
| `/rooms/[id]` | `src/app/(app)/rooms/[id]/page.tsx` | Room detail + inspection history |
| `/inspect/[roomId]` | `src/app/(app)/inspect/[roomId]/page.tsx` | Run a new inspection |
| `/admin/questions` | `src/app/(app)/admin/questions/page.tsx` | Edit checklist sections + questions |
| `/admin/users` | `src/app/(app)/admin/users/page.tsx` | Manage staff accounts |
| `/admin/audit` | `src/app/(app)/admin/audit/page.tsx` | Activity log viewer |
| `/login` | `src/app/login/page.tsx` | Sign-in form |

## Data model touchpoints

- **Reads from:** Room, Section, Question, User, Inspection, InspectionItem, AuditLog
- **Writes to:** Room (admin only), Section (admin), Question (admin), Inspection, InspectionItem, AuditLog

See [`docs/data-model.md`](../data-model.md) for full schema.

## Key files

- `src/lib/actions/inspections.ts` — `saveInspection` server action (FormData input; also handles photos — see [inspection-photos.md](inspection-photos.md))
- `src/lib/actions/rooms.ts` — room CRUD
- `src/lib/actions/checklist.ts` — section/question CRUD
- `src/lib/actions/users.ts` — staff management
- `src/components/InspectForm.tsx` — inspection form (client component)
- `src/components/InspectionHistory.tsx` — expandable inspection history list
- `src/components/RoomsManager.tsx`, `ChecklistManager.tsx`, `UsersManager.tsx` — admin UIs
- `src/lib/status.ts` — color/label tables; `summaryFromItems`, `roomStatusFromSummary`

## Behavior notes

- **Default everything to OK on the form.** Inspector flips the exceptions. With ~95 checklist items, forcing tap-per-item would be brutal. Tradeoff: a rushed inspector could save without looking. Acceptable for current scale.
- **Snapshot question text on save.** `InspectionItem.questionText` and `sectionName` are copied at save time so historical inspections stay accurate even if a question is later edited or archived. See [architecture.md → snapshot-on-write](../architecture.md).
- **Cascade only at Inspection level.** Deleting an Inspection cascades to InspectionItem (and through to InspectionItemImage). Deleting a Room or Question is BLOCKED if inspections reference them — use `archived` instead.
- **Dashboard derives status from latest completed inspection.** `roomStatusFromSummary(latestInspection.summary)` returns `OK | NEEDS_REPAIR | NOT_INSPECTED`.
- **Force-dynamic on dashboard and room detail.** `export const dynamic = "force-dynamic"` so changes are immediately visible after `revalidatePath`.

## Auth gates

1. `middleware.ts` matches `/dashboard|/rooms|/inspect|/admin` and redirects unauthenticated users to `/login`.
2. `(app)/layout.tsx` calls `requireUser()` — re-checks server-side.
3. Admin pages and admin server actions call `requireAdmin()` for role enforcement.

## Storage / external services

None at the moment (photos are documented in [inspection-photos.md](inspection-photos.md)).

## Out of scope (deferred)

- Scheduled / recurring inspection reminders
- Per-room SLAs or repair tracking beyond `REPAIR_COMPLETED` flag
- Inspection assignment to specific inspector
- Print/export of inspection results (planned as a separate feature)
- Per-room status timeline (planned as a separate feature)

## Change log

- 2026-06-23 · Initial ship · `e985a3f`
- 2026-06-24 · Added per-item photo evidence (see [inspection-photos.md](inspection-photos.md)) · `971f341`
