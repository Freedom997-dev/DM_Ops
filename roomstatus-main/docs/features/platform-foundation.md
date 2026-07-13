# Platform Foundation + Daily Cleanliness Inspection

The Foundation layer turns the app from a single-purpose PM checklist tool into an **Okta-style multi-service operations platform**. It introduces generic `Workflow*` models, role expansion (Manager, Housekeeper), a service catalog landing page, per-service settings, and one global settings area. The first service built on the new pattern is **Daily Cleanliness Inspection** — a matrix grid (rooms × ~18 items) with single cycling-checkbox cells and per-row notes + photos.

## Information architecture (Okta-style)

- **`/services`** — the service catalog. One tile per service the user can run. Each tile carries a ⚙ gear (admin only) to that service's own settings.
- **Each service is self-contained** under `/services/<slug>/…` with its own home, history, and `/settings`.
- **`/settings`** — one global settings area *outside* services, for org-wide concerns: staff & roles, access control, the service catalog admin, and the activity log.

## Status

| | |
|---|---|
| **Design spec** | [`docs/superpowers/specs/2026-06-30-foundation-daily-cleanliness-design.md`](../superpowers/specs/2026-06-30-foundation-daily-cleanliness-design.md) |
| **Implementation plan** | — (designed and implemented in `dev` branch directly) |
| **Branch** | `dev` |
| **Live URL path(s)** | `/services`, `/services/[slug]`, `/services/[slug]/history`, `/services/[slug]/settings`, `/services/pm/*`, `/settings`, `/settings/staff`, `/settings/access`, `/settings/services`, `/settings/activity` |

## Roles

| Role | What they can do |
|---|---|
| ADMIN | Everything: manage workflow definitions + items, all submissions, manage staff, view audit. Plus the existing PM checklist powers. |
| MANAGER | Run any workflow whose `rolesAllowed` includes MANAGER. Manage staff. View audit (read-only). Cannot edit workflow definitions or PM checklist questions. Cannot edit rooms. |
| INSPECTOR | Run services allowed by their role (currently Daily Cleanliness and PM). No settings access. |
| HOUSEKEEPER | Reserved for the future Room Cleaning service. Currently sees an empty services list. |

## Routes

| URL | Component / handler | Purpose |
|---|---|---|
| `/services` | `src/app/(app)/services/page.tsx` | Service catalog. Tiles for each service the user can run (PM built-in card + workflow services), plus a Settings button for admins |
| `/services/pm` | `src/app/(app)/services/pm/page.tsx` | PM (Room Condition) service home — the room-status dashboard |
| `/services/pm/rooms`, `/services/pm/rooms/[id]`, `/services/pm/inspect/[roomId]` | under `services/pm/…` | PM rooms list, room detail, run-inspection |
| `/services/pm/settings` | `src/app/(app)/services/pm/settings/page.tsx` | PM settings landing (checklist + rooms) |
| `/services/pm/settings/checklist` | `src/app/(app)/services/pm/settings/checklist/page.tsx` | PM checklist editor (sections + questions) |
| `/services/[slug]` | `src/app/(app)/services/[slug]/page.tsx` | Workflow service matrix (today, or a past date via `?date=YYYY-MM-DD`) |
| `/services/[slug]/history` | `src/app/(app)/services/[slug]/history/page.tsx` | Tabs: by date / by room |
| `/services/[slug]/settings` | `src/app/(app)/services/[slug]/settings/page.tsx` | Per-service settings (name, roles, item list). Looked up by **slug** |
| `/settings` | `src/app/(app)/settings/page.tsx` | Global settings landing (manager+) |
| `/settings/staff` | `src/app/(app)/settings/staff/page.tsx` | Staff & roles (manager+) |
| `/settings/access` | `src/app/(app)/settings/access/page.tsx` | Role × service access matrix (admin) |
| `/settings/services` | `src/app/(app)/settings/services/page.tsx` | Service catalog admin (admin) |
| `/settings/activity` | `src/app/(app)/settings/activity/page.tsx` | Activity log (manager+) |

> **Route resolution note:** `/services/pm` is a *static* segment and `/services/[slug]` is *dynamic*. Next.js prefers the static match, so `pm` resolves to the built-in PM pages and everything else (e.g. `daily-cleanliness`) resolves to the dynamic workflow pages.

## Data model touchpoints

- **Reads from:** WorkflowDefinition, WorkflowItem, WorkflowSubmission, WorkflowRow, WorkflowCell, WorkflowRowImage, Room, User
- **Writes to:** all `Workflow*` tables, AuditLog (extended entity union)

See [`docs/data-model.md`](../data-model.md) for full schema of the new tables.

## Key files

### New
- `src/lib/permissions.ts` — role matrix (`canAccessAdminSection`, `canRunWorkflow`, `parseRolesAllowed`, `isManager`)
- `src/lib/actions/workflows.ts` — submission flow: `getOrCreateTodaySubmission`, `updateCell`, `saveRow` (photos), `saveRowNote` (note-only), `markSubmissionComplete`, `reopenSubmission` (admin), `deleteRowImage`
- `src/components/WorkflowNoteCell.tsx` — inline note box for the sticky Notes column (save-on-blur)
- `src/lib/actions/workflowAdmin.ts` — admin CRUD on definitions and items
- `src/components/WorkflowMatrix.tsx` — main matrix UI; passes `ensureSubmission` to each cell so the first cell tap bootstraps the day's submission
- `src/components/WorkflowCellButton.tsx` — **single cycling checkbox** (blank → OK → Issue → blank) with optimistic updates
- `src/components/WorkflowMatrixRowPanel.tsx` — per-row note + photo panel
- `src/components/WorkflowHistory.tsx` — history tabs (by date / by room)
- `src/components/WorkflowDefinitionEditor.tsx` — admin form builder
- Pages under `src/app/(app)/services/*` and `src/app/(app)/settings/*` (see Routes table)
- `prisma/seedWorkflows.ts` — local seed script for Daily Cleanliness
- `prisma/manual-migrations/2026-06-30-add-foundation-workflow-tables.sql` — production schema migration (apply via Supabase MCP)
- `prisma/manual-migrations/2026-06-30-seed-daily-cleanliness.sql` — production seed (apply via Supabase MCP after the schema)

### Modified
- `prisma/schema.prisma` — 6 new models + User back-relations + Room back-relations + AuditLog comment update
- `src/lib/audit.ts` — extended `entity` union with the five new entities
- `src/lib/session.ts` — added `requireManager`, `requireWorkflowAccess`, `isManager`; admin/manager redirects now go to `/services`
- `src/lib/actions/users.ts` — role enum widened to `ADMIN | MANAGER | INSPECTOR | HOUSEKEEPER`
- `src/components/Nav.tsx` — Okta-style top bar: **Services** + **Settings** (admin/manager) only
- `src/components/UsersManager.tsx` — role badge + dropdown cover all four roles
- `middleware.ts` — protected matcher includes `/services` and `/settings`
- `src/app/page.tsx` — landing redirect sends authenticated users to `/services`
- All PM pages moved from `/dashboard`, `/rooms`, `/inspect`, `/admin/questions` into `/services/pm/*` and `/services/pm/settings/checklist`; all links/redirects/`revalidatePath`s updated

### Removed
- Old route folders: `app/(app)/dashboard`, `app/(app)/rooms`, `app/(app)/inspect`, `app/(app)/workflows`, `app/(app)/admin`

## Behavior notes

- **Single cycling checkbox per cell.** Each cell is one box that cycles on tap: **blank (N/A) → ✓ OK → ✗ Issue → blank**. Blank is the resting/default state and means "not applicable / not flagged".
- **Blank = no DB row.** Only OK and Issue are stored as `WorkflowCell` rows. Cycling a cell back to blank **deletes** its row (with a `DELETE` audit entry). So "unmarked" and "N/A" are the same visual/data state — a clean, sparse table.
- **First cell tap bootstraps the submission.** Cells are enabled immediately. The first interaction on any cell (or a room label) calls `getOrCreateTodaySubmission`, then applies the change in the same transition. `@@unique([workflowId, date])` guarantees one submission per workflow per UTC-date.
- **Per-cell last-write-wins.** Optimistic UI; server upserts (or deletes on blank); the audit log retains every cell change.
- **Per-row note is an always-visible column.** The rightmost **Notes** column is sticky to the right of the matrix; each room has an inline note box that saves on blur via `saveRowNote` (note-only; never touches photos).
- **Per-row photos** live in an expand panel: tap a room label on the left → panel opens (photos only, note is edited in the column) → add/delete photos, save.
- **Mark complete** locks the submission. Set on the matrix page (manager+). Once locked, cells become read-only. A new submission auto-creates for the next day.
- **Reopen (admin only).** A completed submission shows a **Reopen** button to admins. It flips status back to `IN_PROGRESS`, clears `completedAt`, and re-enables the cells for correction. Logged as an `UPDATE` on `WorkflowSubmission` with `status: "REOPENED"` in details.
- **History views answer Room+Date.** "By date" lists submissions; "By room" filters all submissions touching a given room.
- **Item text snapshot in cells.** `WorkflowCell.itemText` is copied at edit time so historical cells stay readable even if an admin edits or archives an item later.
- **Storage path:** `workflows/<slug>/<submissionId>/<rowId>/<uuid>.<ext>` in the same private `inspection-photos` bucket. Reuses `src/lib/storage.ts`.
- **Per-cell audit log entries are deliberately chatty.** Cell taps (and blank-clears) log on every change — this is the input the future per-room status timeline feature will consume.

## Auth gates

- `middleware.ts` requires authentication for `/services/*` and `/settings/*`.
- `(app)/layout.tsx` `requireUser()` re-checks server-side.
- `requireWorkflowAccess(slug)` in every action that mutates a submission: checks the workflow's `rolesAllowed` against the current user's role.
- `requireManager()` gates `/settings`, `/settings/staff`, `/settings/activity` (ADMIN or MANAGER).
- `requireAdmin()` gates `/settings/access`, `/settings/services`, per-service `/settings`, and every admin-only action (definition CRUD, item CRUD, photo delete, PM checklist).

## Storage / external services

- Bucket: `inspection-photos` (shared with the photo-evidence feature)
- Per-row photos only; per-cell photos not supported
- Signed URLs at page render (1 hour TTL)

## Out of scope (deferred)

- Migrating existing PM checklist to the generic Workflow models (parallel kept per Approach B)
- Real-time sync via Supabase Realtime (refresh-based for now)
- Auto-create submissions at midnight via cron (manual open)
- Per-cell notes / per-cell photos
- Form shapes other than MATRIX (e.g. PER_ROOM_DEEP)
- Workflow scheduling (recurring cron)
- Workflow-scoped rooms (currently all non-archived rooms)
- Export submissions to PDF/CSV
- Multi-tenancy

## Migration steps for production

In a **Supabase-management chat** (not this chat), apply in order:

1. `prisma/manual-migrations/2026-06-30-add-foundation-workflow-tables.sql` via `apply_migration` (name suggestion: `add_foundation_workflow_tables`)
2. `prisma/manual-migrations/2026-06-30-seed-daily-cleanliness.sql` via `execute_sql`
3. Verify with `list_tables` (should see 6 new tables) and a count query (should see 1 WorkflowDefinition and 18 WorkflowItem rows)

After production schema is in place, push `dev` → `main` to deploy.

## Change log

- 2026-06-30 · Initial design and implementation in `dev` branch
- 2026-07-01 · Restructured to Okta-style IA: `/services` catalog + per-service settings + global `/settings`. All PM routes moved under `/services/pm/*`. Old `/dashboard`, `/rooms`, `/inspect`, `/workflows`, `/admin` routes removed.
- 2026-07-01 · Matrix cell changed from three separate buttons to a **single cycling checkbox** (blank → OK → Issue → blank). Blank now means "no row" (deletes the cell). First cell tap bootstraps the submission (fixed a disabled-until-submission deadlock).
- 2026-07-01 · Added **admin Reopen** for completed submissions (`reopenSubmission` action + button). Previously deferred.
- 2026-07-01 · Notes moved to an **always-visible sticky Notes column** on the right (`WorkflowNoteCell` + `saveRowNote`); the row-expand panel is now photos-only.
- 2026-07-01 · **RBAC**: added `setUserRole` (admin-only, with last-admin guard) and a per-user role dropdown in Staff & access. Staff page now passes `isAdmin`.
- 2026-07-02 · Past-date submissions are now **editable** by managers+ (removed the `isToday` gate on Mark complete; edits auto-save, Mark complete finalizes). Banner reworded from "read-only" to reflect editability (completed submissions stay read-only until an admin reopens).
- 2026-07-02 · Matrix grid given a bounded height (`max-h-[70vh]`) so the horizontal scrollbar stays reachable without scrolling past all rooms; sticky Room (left), header (top), and Notes (right) hold in place.
- 2026-07-02 · Replaced the height cap with a **synced sticky horizontal scrollbar** (mirrors the grid) so vertical mouse-wheel scrolls the page normally while horizontal stays reachable.
- 2026-07-02 · **Print / Save as PDF**: a Print button on the matrix triggers `window.print()`. An `@media print` stylesheet (`globals.css`) renders the full grid landscape (✓/✗/blank + Notes), hides all UI chrome, un-sticks columns, and prints a header with date + counts. No server code or dependency — the browser's print dialog does the PDF. Works for today and any past date.
