# Platform Foundation + Daily Cleanliness Inspection

The Foundation layer turned the app from a single-purpose PM checklist into an
**Okta-style multi-service platform**: a `/services` catalog, self-contained
services with their own settings, one global `/settings` area, and generic
`Workflow*` models so simple checklist services can be added as **data**. The
first (and so far only) workflow service is **Daily Cleanliness Inspection** — a
matrix of rooms × 18 items with single cycling-checkbox cells, a notes column,
and per-row photos.

## Information architecture

- **`/services`** — catalog. One tile per service the user can open: built-in
  services (PM V2, Housekeeping; PM V1 hidden) gated by RBAC permissions, plus one
  tile per `WorkflowDefinition` the user's roles allow. Tiles show a ⚙ gear to the
  service's settings when permitted, live status lines (HK counts; workflow
  "Today: In progress · N rooms touched · Started by …"), and "View history".
- **`/services/<slug>/…`** — each service is self-contained (home, history, settings).
- **`/settings`** — org-wide: Staff, Roles & permissions, Rooms, Services, Activity.

## Status

| | |
|---|---|
| **Design spec** | [`superpowers/specs/2026-06-30-foundation-daily-cleanliness-design.md`](../superpowers/specs/2026-06-30-foundation-daily-cleanliness-design.md) (frozen) |
| **Shipped** | 2026-06-30 → 2026-07-14 (iterated); live on production |
| **Routes** | `/services`, `/services/[slug]`, `/services/[slug]/history`, `/services/[slug]/settings`, `/settings/*` |
| **Slug** | `daily-cleanliness` (seeded by `prisma/seedWorkflows.ts`, called from `seed.ts` on every prod deploy) |

## Access

- **Running a workflow** is governed by `WorkflowDefinition.rolesAllowed` (JSON
  array of role keys), checked by `requireWorkflowAccess(slug)` on every page and
  submission action. Daily Cleanliness default: `["ADMIN","MANAGER","INSPECTOR"]`.
  Super Admin always passes.
- **Mark complete** button: shown to `isManager` (Admin/Manager role keys). Server
  side only checks workflow access — see known-issues TD-3.
- **Reopen** a completed submission and **delete a row photo**: `requireAdmin()`.
- **Edit the definition/items** (`/services/[slug]/settings`, `workflowAdmin.ts`):
  `admin:services:manage`.
- **Service catalog admin** (`/settings/services`): `isAdmin`.

Global settings pages and their permissions are listed in
[routes.md](../routes.md#pages); RBAC is described in
[roles-and-permissions.md](../roles-and-permissions.md).

## Routes

| URL | File | Purpose |
|---|---|---|
| `/services` | `src/app/(app)/services/page.tsx` | Catalog |
| `/services/[slug]` | `src/app/(app)/services/[slug]/page.tsx` | Matrix for today or `?date=YYYY-MM-DD` |
| `/services/[slug]/history` | `…/[slug]/history/page.tsx` | Tabs: by date / by room |
| `/services/[slug]/settings` | `…/[slug]/settings/page.tsx` | Name, description, allowed roles, items |
| `/settings` | `src/app/(app)/settings/page.tsx` | Hub (cards per permission) |
| `/settings/staff` | `…/settings/staff/page.tsx` | Users & role assignment |
| `/settings/access` | `…/settings/access/page.tsx` | Roles × permissions matrix |
| `/settings/rooms` | `…/settings/rooms/page.tsx` | Shared rooms (since 2026-09-30) |
| `/settings/services` | `…/settings/services/page.tsx` | Workflow service catalog admin |
| `/settings/activity` | `…/settings/activity/page.tsx` | Audit log |

Static segments `pm`, `pm-v2`, `housekeeping` win over `[slug]`.

## Data model

`WorkflowDefinition`, `WorkflowItem`, `WorkflowSubmission` (unique per workflow +
UTC date), `WorkflowRow` (per room: note), `WorkflowCell` (per room × item:
`OK | ISSUE`, blank = no row), `WorkflowRowImage`. See
[data-model.md](../data-model.md#workflows-generic-services-daily-cleanliness).

## Key files

- `src/lib/actions/workflows.ts` — `getOrCreateTodaySubmission`, `updateCell`, `saveRow` (photos), `saveRowNote`, `markSubmissionComplete`, `reopenSubmission`, `deleteRowImage`
- `src/lib/actions/workflowAdmin.ts` — definition/item editing
- `src/lib/permissions.ts` — `parseRolesAllowed`, `canRunWorkflow`
- `src/components/WorkflowMatrix.tsx` — grid; `ensureSubmission` bootstraps the day on first tap
- `src/components/WorkflowCellButton.tsx` — cycling checkbox with optimistic update
- `src/components/WorkflowNoteCell.tsx` — notes column (save on blur)
- `src/components/WorkflowMatrixRowPanel.tsx` — per-row photo panel (uses `PhotoPicker`)
- `src/components/WorkflowHistory.tsx`, `WorkflowDefinitionEditor.tsx`
- `prisma/seedWorkflows.ts` — Daily Cleanliness definition + 18 items
- `prisma/manual-migrations/2026-06-30-*.sql` — historical; superseded by `db push` + seed

## Behavior notes

- **Single cycling checkbox per cell.** Each cell is one box that cycles on tap: **blank (N/A) → ✓ OK → ✗ Issue → blank**. Blank is the resting/default state and means "not applicable / not flagged".
- **Blank = no DB row.** Only OK and Issue are stored as `WorkflowCell` rows. Cycling a cell back to blank **deletes** its row (with a `DELETE` audit entry). So "unmarked" and "N/A" are the same visual/data state — a clean, sparse table.
- **First cell tap bootstraps the submission.** Cells are enabled immediately. The first interaction on any cell (or a room label) calls `getOrCreateTodaySubmission`, then applies the change in the same transition. `@@unique([workflowId, date])` guarantees one submission per workflow per UTC-date.
- **Per-cell last-write-wins.** Optimistic UI; server upserts (or deletes on blank); the audit log retains every cell change.
- **Per-row note is an always-visible column.** The **Notes** column is the last (far-right) column of the matrix — a normal, non-sticky column reached by scrolling right past the items. Each room has an inline note box that saves on blur via `saveRowNote` (note-only; never touches photos).
- **Per-row photos** live in an expand panel: tap a room label on the left → panel opens (photos only, note is edited in the column) → add/delete photos, save.
- **Grid scroll behavior.** The matrix sits in a bounded scroll box (`max-h-[75vh] overflow-auto`) so the **header row** (item names) and the **Room column** (left) stay pinned while you scroll rooms up/down or items left/right. The Notes column is NOT pinned — it's the natural far-right column. (Rationale: on mobile, pinning both Room-left and Notes-right left no room for item columns; only the header + Room stay fixed now.)
- **Print / Save as PDF.** A **Print** button on the matrix calls `window.print()`. An `@media print` stylesheet in `globals.css` reformats the grid for paper: landscape, full grid (✓/✗/blank + Notes), a print-only header (workflow name · date · counts), all interactive chrome hidden, columns un-stuck, header row repeated per page. No dependency or server code — the browser dialog produces the PDF. Works for today and any past date.
- **Mark complete** locks the submission. Set on the matrix page (manager+), any date. Once locked, cells become read-only. A new submission auto-creates for the next day.
- **Reopen (admin only).** A completed submission shows a **Reopen** button to admins. It flips status back to `IN_PROGRESS`, clears `completedAt`, and re-enables the cells for correction. Logged as an `UPDATE` on `WorkflowSubmission` with `status: "REOPENED"` in details.
- **History views answer Room+Date.** "By date" lists submissions; "By room" filters all submissions touching a given room.
- **Item text snapshot in cells.** `WorkflowCell.itemText` is copied at edit time so historical cells stay readable even if an admin edits or archives an item later.
- **Storage path:** `workflows/<slug>/<submissionId>/<rowId>/<uuid>.<ext>` in the same private `inspection-photos` bucket. Reuses `src/lib/storage.ts`.
- **Per-cell audit log entries are deliberately chatty.** Cell taps (and blank-clears) log on every change — this is the input the future per-room status timeline feature will consume.


**Dates:** a submission's `date` is UTC midnight of the server clock — after
~8 PM US Eastern, "today" is already tomorrow's submission ([known-issues](../known-issues.md) TZ-1).

## Storage

Row photos: `workflows/<slug>/<submissionId>/<rowId>/<cuid>.<ext>` in the shared
private `inspection-photos` bucket; images only, ≤ 10 MB; signed URLs (1 h).

## Out of scope (deferred)

- Creating new workflow definitions from the UI (seed-only today)
- Shapes other than `MATRIX`; per-cell notes/photos
- Workflow-scoped room lists (all non-archived rooms are rows)
- Scheduled auto-creation, reminders, realtime sync
- CSV/Excel export (print-to-PDF exists)
- Migrating PM onto the generic models (PM stayed bespoke; PM V2 is bespoke too)

## Change log

- 2026-06-30 · Initial design and implementation in `dev` branch
- 2026-07-01 · Restructured to Okta-style IA: `/services` catalog + per-service settings + global `/settings`. All PM routes moved under `/services/pm/*`. Old `/dashboard`, `/rooms`, `/inspect`, `/workflows`, `/admin` routes removed.
- 2026-07-01 · Matrix cell changed from three separate buttons to a **single cycling checkbox** (blank → OK → Issue → blank). Blank now means "no row" (deletes the cell). First cell tap bootstraps the submission (fixed a disabled-until-submission deadlock).
- 2026-07-01 · Added **admin Reopen** for completed submissions (`reopenSubmission` action + button). Previously deferred.
- 2026-07-01 · Notes moved to an **always-visible sticky Notes column** on the right (`WorkflowNoteCell` + `saveRowNote`); the row-expand panel is now photos-only.
- 2026-07-01 · **RBAC**: added `setUserRole` (admin-only, with last-admin guard) and a per-user role dropdown in Staff & access. Staff page now passes `isAdmin`.
- 2026-07-02 · Past-date submissions are now **editable** by managers+ (removed the `isToday` gate on Mark complete; edits auto-save, Mark complete finalizes). Banner reworded from "read-only" to reflect editability (completed submissions stay read-only until an admin reopens).
- 2026-07-02 · **Print / Save as PDF**: a Print button on the matrix triggers `window.print()`. An `@media print` stylesheet (`globals.css`) renders the full grid landscape (✓/✗/blank + Notes), hides all UI chrome, un-sticks columns, and prints a header with date + counts. No server code or dependency — the browser's print dialog does the PDF. Works for today and any past date.
- 2026-07-14 · **Scroll behavior settled** (after iterating through a `max-h-70vh` box and a synced-scrollbar experiment): the grid uses a bounded scroll box (`max-h-[75vh] overflow-auto`) so the **header row and Room column stay pinned** while scrolling. The **Notes column is un-pinned** (normal far-right column) — pinning both Room-left and Notes-right left no room for items on mobile. The synced-scrollbar strip was removed.
- 2026-08-05 · Access moved to DB-backed RBAC; `rolesAllowed` now references role keys (multi-role users pass if any role matches).
- 2026-09-29 · Daily Cleanliness created by the deploy seed (the 2026-06-30 manual SQL had never been applied to the new Supabase DB).
- 2026-09-30 · Shared `/settings/rooms` page; Next 16 async params.
