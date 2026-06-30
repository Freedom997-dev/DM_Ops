# Platform Foundation + Daily Cleanliness Inspection

The Foundation layer turns the app from a single-purpose PM checklist tool into a multi-workflow operations platform. It introduces generic `Workflow*` models, role expansion (Manager, Housekeeper), and a role-based landing page. The first workflow built on the new pattern is **Daily Cleanliness Inspection** — a matrix grid (rooms × ~18 items) with three-state cells and per-row notes + photos.

## Status

| | |
|---|---|
| **Design spec** | [`docs/superpowers/specs/2026-06-30-foundation-daily-cleanliness-design.md`](../superpowers/specs/2026-06-30-foundation-daily-cleanliness-design.md) |
| **Implementation plan** | — (designed and implemented in `dev` branch directly) |
| **Branch** | `dev` |
| **Live URL path(s)** | `/workflows`, `/workflows/[slug]`, `/workflows/[slug]/history`, `/admin/workflows`, `/admin/workflows/[id]` |

## Roles

| Role | What they can do |
|---|---|
| ADMIN | Everything: manage workflow definitions + items, all submissions, manage staff, view audit. Plus the existing PM checklist powers. |
| MANAGER | Run any workflow whose `rolesAllowed` includes MANAGER. Manage staff. View audit (read-only). Cannot edit workflow definitions or PM checklist questions. Cannot edit rooms. |
| INSPECTOR | Run workflows allowed by their role (currently Daily Cleanliness and existing PM checklist). No admin powers. |
| HOUSEKEEPER | Reserved for the future Room Cleaning workflow. Currently sees an empty workflows list. |

## Routes

| URL | Component / handler | Purpose |
|---|---|---|
| `/workflows` | `src/app/(app)/workflows/page.tsx` | Role-based landing. Cards for each workflow the user can run, plus a legacy PM card for ADMIN/INSPECTOR |
| `/workflows/[slug]` | `src/app/(app)/workflows/[slug]/page.tsx` | Today's matrix submission (or a past date via `?date=YYYY-MM-DD`) |
| `/workflows/[slug]/history` | `src/app/(app)/workflows/[slug]/history/page.tsx` | Tabs: by date / by room |
| `/admin/workflows` | `src/app/(app)/admin/workflows/page.tsx` | Admin index of all WorkflowDefinitions |
| `/admin/workflows/[id]` | `src/app/(app)/admin/workflows/[id]/page.tsx` | Edit a definition + its items |

## Data model touchpoints

- **Reads from:** WorkflowDefinition, WorkflowItem, WorkflowSubmission, WorkflowRow, WorkflowCell, WorkflowRowImage, Room, User
- **Writes to:** all `Workflow*` tables, AuditLog (extended entity union)

See [`docs/data-model.md`](../data-model.md) for full schema of the new tables.

## Key files

### New
- `src/lib/permissions.ts` — role matrix (`canAccessAdminSection`, `canRunWorkflow`, `parseRolesAllowed`, `isManager`)
- `src/lib/actions/workflows.ts` — submission flow: `getOrCreateTodaySubmission`, `updateCell`, `saveRow`, `markSubmissionComplete`, `deleteRowImage`
- `src/lib/actions/workflowAdmin.ts` — admin CRUD on definitions and items
- `src/components/WorkflowMatrix.tsx` — main matrix UI
- `src/components/WorkflowCellButton.tsx` — three-state cell button with optimistic updates
- `src/components/WorkflowMatrixRowPanel.tsx` — per-row note + photo panel
- `src/components/WorkflowHistory.tsx` — history tabs (by date / by room)
- `src/components/WorkflowDefinitionEditor.tsx` — admin form builder
- `prisma/seedWorkflows.ts` — local seed script for Daily Cleanliness
- `prisma/manual-migrations/2026-06-30-add-foundation-workflow-tables.sql` — production schema migration (apply via Supabase MCP)
- `prisma/manual-migrations/2026-06-30-seed-daily-cleanliness.sql` — production seed (apply via Supabase MCP after the schema)

### Modified
- `prisma/schema.prisma` — 6 new models + User back-relations + Room back-relations + AuditLog comment update
- `src/lib/audit.ts` — extended `entity` union with the five new entities
- `src/lib/session.ts` — added `requireManager`, `requireWorkflowAccess`, `isManager`
- `src/components/Nav.tsx` — workflows-first navigation, role-aware links
- `middleware.ts` — added `/workflows` to the protected matcher
- `src/app/page.tsx` — landing redirect now sends authenticated users to `/workflows`

## Behavior notes

- **Submission per (workflow, date).** `@@unique([workflowId, date])` enforces exactly one submission row per workflow per UTC-date. First cell tap creates it; subsequent users append to the same submission.
- **Untouched cells have no DB row.** A cell exists only when an inspector taps a button. Missing cell = unmarked (UI handles this).
- **Per-cell last-write-wins.** Optimistic UI; server upserts; the audit log retains every cell change.
- **Per-row note + photos.** Tap a room label on the left → expand the panel → edit note, add photos, save.
- **Mark complete** locks the submission. Set on the main matrix page. Once locked, cells become read-only. A new submission auto-creates for the next day.
- **History views answer Room+Date.** "By date" lists submissions; "By room" filters all submissions touching a given room.
- **Item text snapshot in cells.** `WorkflowCell.itemText` is copied at edit time so historical cells stay readable even if an admin edits or archives an item later.
- **Storage path:** `workflows/<slug>/<submissionId>/<rowId>/<uuid>.<ext>` in the same private `inspection-photos` bucket. Reuses `src/lib/storage.ts`.
- **Per-cell audit log entries are deliberately chatty.** Cell taps log on every change — this is the input the future per-room status timeline feature will consume.

## Auth gates

- `middleware.ts` requires authentication for `/workflows/*` and `/admin/workflows/*`.
- `(app)/layout.tsx` `requireUser()` re-checks server-side.
- `requireWorkflowAccess(slug)` in every action that mutates a submission: checks the workflow's `rolesAllowed` against the current user's role.
- `requireAdmin()` in every admin-only action (definition CRUD, item CRUD, photo delete).

## Storage / external services

- Bucket: `inspection-photos` (shared with the photo-evidence feature)
- Per-row photos only; per-cell photos not supported
- Signed URLs at page render (1 hour TTL)

## Out of scope (deferred)

- Migrating existing PM checklist to the generic Workflow models (parallel kept per Approach B)
- Real-time sync via Supabase Realtime (refresh-based for now)
- Auto-create submissions at midnight via cron (manual open)
- Per-cell notes / per-cell photos
- Reopening completed submissions via UI (admin can flip via direct DB action)
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

- 2026-06-30 · Initial design and implementation in `dev` branch · pending commit
