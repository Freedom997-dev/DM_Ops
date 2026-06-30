# Foundation + Daily Cleanliness Inspection — Design Spec

**Date:** 2026-06-30
**Status:** Draft (awaiting user review)
**Branch:** `dev`
**Scope:** Introduce the Foundation layer (generic Workflow* models, role expansion, role-based home, admin workflow builder) and ship Daily Cleanliness Inspection as the first workflow on the new pattern. Existing PM Room Condition Inspection is left untouched.

## 1. Motivation

The app started as a single-purpose tool for monthly PM room inspections. The roadmap now calls for multiple workflows (Daily Cleanliness, Room Cleaning, others to come), each with different shapes and different roles. Building each workflow with its own bespoke data model and UI would entrench duplication. This spec introduces a generic platform pattern that:

- Lets admins define new workflows from a single admin UI.
- Stores all submissions through a consistent shape that supports per-room and per-date queries.
- Adds role differentiation (Manager, Housekeeper) so non-admin staff can run scoped workflows.
- Avoids touching the live PM checklist tables (zero migration risk).

Daily Cleanliness is the proof-of-concept workflow: a daily matrix grid of rooms × ~18 cleanliness items, three-state cells, collaboratively edited by multiple inspectors per day.

## 2. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Approach | **B** — parallel models, no PM migration | Zero risk to live PM data; Foundation pattern still real and tested by Daily Cleanliness |
| Workflow shape (Daily Cleanliness) | Matrix (rows = rooms, cols = items) | Matches Quality Inn-style portal; daily speed UX |
| Cell semantics | Three-state: `OK | ISSUE | NA` | Handles rooms without certain amenities (microwave, etc.) |
| Note granularity | Per row (per room × submission) | Matches typical motel ops: "what's wrong with this room" not "what's wrong with item X" |
| Photo granularity | Per row, reuse `PhotoPicker`/`PhotoLightbox` | Same pattern as inspection-photos; consistency reduces UX surprises |
| Collaboration model | Multiple inspectors share ONE submission per day | Realistic for a small motel; per-cell attribution preserves "who marked what" |
| Concurrency mechanism | Per-cell last-write-wins, manual refresh | No WebSockets/Realtime needed at motel scale; simpler and safer |
| Submission uniqueness | One submission per workflow per date | Enforced via `@@unique([workflowId, date])` |
| Checklist editability | Admin-editable via WorkflowItem | True Foundation generalization |
| New roles | `MANAGER`, `HOUSEKEEPER` added | Manager for ops oversight, Housekeeper reserved for future Room Cleaning workflow |
| Date storage | UTC midnight in `DateTime` field | Simpler than `@db.Date`; consistent with existing `DateTime` usage in schema |
| Untouched cells | No DB row exists | UI handles missing state; saves storage and audit noise |

## 3. Scope

### In scope
- 6 new Prisma models (additive)
- 2 new role values in `User.role` union (typed in TypeScript; column stays `String`)
- Role-based home page at `/workflows`
- New routes: `/workflows`, `/workflows/[slug]`, `/workflows/[slug]/history`, `/admin/workflows`
- Server actions for workflow CRUD (admin), submission flow, cell upsert, row note + photos
- Matrix UI component with sticky scroll on both axes
- Per-row photo upload reusing existing `PhotoPicker` and `PhotoLightbox`
- Daily Cleanliness Inspection seeded as the first WorkflowDefinition with the 18 items
- AuditLog entity union extended
- Nav restructure: workflows are first-class top-level entries
- `docs/features/platform-foundation.md` authored

### Out of scope
- Migrating existing PM Room Condition Inspection to the new Workflow models (parallel kept)
- Room Cleaning Workflow (own spec next)
- Real-time sync via Supabase Realtime or WebSockets
- Auto-creation of submissions at midnight via cron
- Per-cell notes or per-cell photos
- Edit history / undo at the cell level beyond last-write attribution
- Soft-delete of submissions (DELETE remains hard; audit log keeps the trace)
- Multi-tenancy (single motel assumed)
- Form shapes other than MATRIX (the `shape` field is reserved for future; only MATRIX implemented)

## 4. Data model

All new tables; no changes to existing tables in this spec.

### 4.1 New models (Prisma)

```prisma
model WorkflowDefinition {
  id           String   @id @default(cuid())
  slug         String   @unique
  name         String
  description  String?
  shape        String   // "MATRIX" only in this spec; reserved for future shapes
  rolesAllowed String   // JSON-encoded string array, e.g. '["ADMIN","MANAGER","INSPECTOR"]'
  archived     Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  items       WorkflowItem[]
  submissions WorkflowSubmission[]
}

model WorkflowItem {
  id           String   @id @default(cuid())
  workflowId   String
  workflow     WorkflowDefinition @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  text         String
  order        Int      @default(0)
  archived     Boolean  @default(false)
  createdAt    DateTime @default(now())

  cells WorkflowCell[]

  @@index([workflowId])
}

model WorkflowSubmission {
  id          String   @id @default(cuid())
  workflowId  String
  workflow    WorkflowDefinition @relation(fields: [workflowId], references: [id])
  date        DateTime // stored as UTC midnight (year-month-day component only matters)
  status      String   @default("IN_PROGRESS") // IN_PROGRESS | COMPLETED
  createdById String
  createdBy   User     @relation("WorkflowSubmissionCreated", fields: [createdById], references: [id])
  completedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  rows  WorkflowRow[]
  cells WorkflowCell[]

  @@unique([workflowId, date])
  @@index([date])
  @@index([workflowId, status])
}

model WorkflowRow {
  id              String   @id @default(cuid())
  submissionId    String
  submission      WorkflowSubmission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  roomId          String
  room            Room     @relation(fields: [roomId], references: [id])
  note            String?
  lastUpdatedById String?
  lastUpdatedBy   User?    @relation("WorkflowRowUpdated", fields: [lastUpdatedById], references: [id])
  lastUpdatedAt   DateTime?

  images WorkflowRowImage[]

  @@unique([submissionId, roomId])
  @@index([roomId])
}

model WorkflowCell {
  id              String   @id @default(cuid())
  submissionId    String
  submission      WorkflowSubmission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  itemId          String
  item            WorkflowItem @relation(fields: [itemId], references: [id])
  roomId          String
  room            Room     @relation(fields: [roomId], references: [id])
  itemText        String   // snapshot of item.text at time of edit
  status          String   // OK | ISSUE | NA
  lastUpdatedById String
  lastUpdatedBy   User     @relation("WorkflowCellUpdated", fields: [lastUpdatedById], references: [id])
  lastUpdatedAt   DateTime @default(now())

  @@unique([submissionId, roomId, itemId])
  @@index([submissionId])
  @@index([roomId])
  @@index([itemId])
}

model WorkflowRowImage {
  id           String   @id @default(cuid())
  rowId        String
  row          WorkflowRow @relation(fields: [rowId], references: [id], onDelete: Cascade)
  storagePath  String
  width        Int?
  height       Int?
  bytes        Int?
  uploadedById String
  uploadedBy   User     @relation("WorkflowRowImageUploaded", fields: [uploadedById], references: [id])
  createdAt    DateTime @default(now())

  @@index([rowId])
}
```

### 4.2 User relation additions

The existing `User` model gets four new back-relations:
```prisma
  workflowSubmissionsCreated WorkflowSubmission[] @relation("WorkflowSubmissionCreated")
  workflowRowUpdates         WorkflowRow[]        @relation("WorkflowRowUpdated")
  workflowCellUpdates        WorkflowCell[]       @relation("WorkflowCellUpdated")
  workflowRowImagesUploaded  WorkflowRowImage[]   @relation("WorkflowRowImageUploaded")
```

### 4.3 Cascade summary

| Delete | Cascades to |
|---|---|
| WorkflowDefinition | WorkflowItem (item rows). Submissions are NOT cascaded — definitions can't be deleted if submissions reference them; use `archived = true` instead |
| WorkflowSubmission | WorkflowRow → WorkflowRowImage (DB only; Storage handled separately) AND WorkflowCell |
| WorkflowRow | WorkflowRowImage |
| Room | NO cascade. Rooms with cells in any submission are protected from delete; use `archived = true` |
| User | NO cascade. Users with any updates referenced are protected from delete; deactivate via `active = false` instead |

### 4.4 Indexing rationale

- `WorkflowSubmission.@@index([date])` — answers "all submissions on date X"
- `WorkflowSubmission.@@unique([workflowId, date])` — enforces one matrix per workflow per day
- `WorkflowCell.@@index([roomId])` — answers "all cells for room X across all submissions"
- `WorkflowCell.@@unique([submissionId, roomId, itemId])` — prevents duplicate cells on upsert
- `WorkflowRow.@@unique([submissionId, roomId])` — one note/photo group per room per submission
- `WorkflowItem.@@index([workflowId])` — workflow's item list lookup
- `WorkflowRowImage.@@index([rowId])` — fast row image listing

## 5. Roles & permissions

### 5.1 Role expansion

`User.role` is a TypeScript-typed string column. The union goes from:
```ts
"ADMIN" | "INSPECTOR"
```
to:
```ts
"ADMIN" | "MANAGER" | "INSPECTOR" | "HOUSEKEEPER"
```

No DB migration needed (column is plain `String`). TypeScript types tighten in:
- `src/lib/auth.ts` (NextAuth callbacks)
- `src/lib/permissions.ts` (new file — the role matrix)
- `src/types/next-auth.d.ts` (Session augmentation)
- `src/lib/audit.ts` (no change — entity is for the target of the audit, not the actor)

### 5.2 Static role permissions (`src/lib/permissions.ts`)

A pure-function module exporting:
```ts
type Role = "ADMIN" | "MANAGER" | "INSPECTOR" | "HOUSEKEEPER";

export function canAccessAdminSection(role: Role, section: "rooms" | "users" | "questions" | "audit" | "workflows"): boolean
export function canRunWorkflow(role: Role, rolesAllowed: Role[]): boolean
```

| Role | rooms | users | questions | audit | workflows |
|---|:-:|:-:|:-:|:-:|:-:|
| ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ |
| MANAGER | ❌ | ✅ | ❌ | ✅ (view) | ❌ |
| INSPECTOR | ❌ | ❌ | ❌ | ❌ | ❌ |
| HOUSEKEEPER | ❌ | ❌ | ❌ | ❌ | ❌ |

Notes:
- **Rooms admin is ADMIN-only.** Rooms are static reference data; managers don't need to edit them. (Aligns with §13 Risks — keeping MANAGER out of `/rooms` admin reduces scope creep.)
- **MANAGER's "view audit" means read-only.** They can browse the activity log but cannot delete or amend entries (no UI offers that anyway — audit is append-only by design).
- **MANAGER's `users` access is write** — they can add staff (e.g. onboard a new inspector or housekeeper). They cannot change another user's role to ADMIN.
- Server-side actions enforce these gates regardless of UI visibility.

### 5.3 Per-workflow access (`WorkflowDefinition.rolesAllowed`)

JSON-string array of roles allowed to submit. For Daily Cleanliness:
```json
["ADMIN", "MANAGER", "INSPECTOR"]
```

Check happens at every server action that mutates a submission: `requireWorkflowAccess(workflowSlug)`.

### 5.4 Auth helpers (`src/lib/session.ts` extension)

Existing: `getCurrentUser`, `requireUser`, `requireAdmin`, `isAdmin`.

New:
```ts
export function requireManager()  // ADMIN or MANAGER
export function requireWorkflowAccess(workflowSlug: string)  // looks up the workflow's rolesAllowed
export function isManager(user)
```

## 6. UI shape

### 6.1 Landing — `/workflows`

After login, all users land at `/workflows`. Cards rendered:
- For each `WorkflowDefinition` where the user's role is in `rolesAllowed`
- PLUS a special "Room Condition (PM)" card linking to `/dashboard` (the legacy view, shown to ADMIN/INSPECTOR only)

Each card shows:
- Workflow name + 1-line description
- Today's submission state ("Not started", "X of Y rooms touched", "Completed at HH:MM by [name]")
- Last activity ("Updated by [name] · Y minutes ago")
- Primary action button ("Open today's matrix" or similar)

### 6.2 Daily Cleanliness matrix — `/workflows/daily-cleanliness`

Top bar:
- Workflow name + date selector (today by default; can pick past date for read-only view)
- Refresh button (re-fetches all cells, shows others' edits)
- Status badge: "In progress" / "Completed at HH:MM"
- "Mark complete" button (visible only if status = IN_PROGRESS and user has access)

Matrix body:
- Left column **sticky on horizontal scroll**: room number + name (one row per non-archived Room).
- Top row **sticky on vertical scroll**: item names rotated -45° (Quality Inn style). One column per non-archived WorkflowItem.
- Top-left intersection is doubly sticky.
- Body cells: tri-button toggle (OK / Issue / NA). Active button colored (green / red / gray). Tap toggles status, fires `updateCell` server action immediately.
- Hover/long-press: tooltip "Last updated by [initials] [Hmm] ago".

Row expansion panel:
- Tap a room cell on the left → expand a panel below that row.
- Panel contains:
  - Note input (free-text up to 1000 chars)
  - PhotoPicker for that row
  - Save button (commits note + uploaded photos)
- Only one row expanded at a time; tapping another row collapses the previous.

Bottom bar (mobile):
- Counts: "X OK · Y Issues · Z N/A · W unmarked"
- "Mark complete" button (when applicable)

### 6.3 History — `/workflows/daily-cleanliness/history`

Tabs:
1. **By date** (default) — list of submissions newest first; each row: date, creator, X rooms touched, Y issues, status. Click → read-only matrix view for that date.
2. **By room** — room picker dropdown; selecting a room shows a chronological list of submissions where that room had any cell touched. Each entry: date, who updated, summary, issues count.

### 6.4 Admin workflow builder — `/admin/workflows`

Admin-only. Lists `WorkflowDefinition`s with archived toggle. Click a workflow → editor:
- Edit name, description, rolesAllowed (multi-select chips)
- Item list editor: add/remove/reorder/archive items (similar pattern to existing `ChecklistManager`)
- Cannot delete a WorkflowDefinition if any WorkflowSubmissions exist (UI shows "Archive" instead)

### 6.5 Nav

`src/components/Nav.tsx` updated:
- "Workflows" replaces the existing "Dashboard" link as the primary nav entry
- The existing "Dashboard" link moves under "Room Condition (PM)" subnav (still accessible at `/dashboard`)
- Admin/Manager-specific links remain (`/admin/users`, `/admin/audit`, `/admin/workflows`)

## 7. Concurrency model

### 7.1 Per-cell last-write-wins

When an inspector taps a cell to change its status:
1. UI optimistically updates the cell's local state
2. Client calls server action `updateCell(submissionId, roomId, itemId, status)`
3. Server action upserts the `WorkflowCell` row (`@@unique([submissionId, roomId, itemId])` makes this safe)
4. `lastUpdatedById = currentUser.id`, `lastUpdatedAt = now()`
5. Server returns the new lastUpdatedById + timestamp for the tooltip

If two clients write the same cell at near-simultaneous moments, both writes happen sequentially and the last wins. The audit log retains both events.

### 7.2 Why not real-time

Considered Supabase Realtime on the WorkflowCell table. Decided against because:
- Motel scale: 1-2 inspectors per day. Same-cell races extremely rare.
- Latency: refresh button is faster to implement, no message ordering bugs.
- If we ever need it, swap-in is bounded to `WorkflowMatrix.tsx` (subscribe to channel, apply incoming changes to local state).

### 7.3 Refresh UX

The Refresh button in the top bar refetches all cells, rows, and row images for the current submission. Cells visible on screen update instantly via React state. Inspector sees others' progress without page reload.

A subtle "Updated by [X] [Y]m ago" indicator on each cell helps inspectors know whose work they're seeing.

### 7.4 Submission completion

Anyone with workflow access can hit "Mark complete":
- Sets `status = COMPLETED`, `completedAt = now()`
- Logs audit event
- Submission becomes read-only (no further cell upserts allowed)
- The next day's submission is created fresh (separate date, separate row)

If a manager wants to reopen a completed submission, they (a) start a new one for tomorrow, or (b) an admin re-runs an action to flip status back (not exposed in UI for this spec; addable later).

## 8. History query patterns

The "Room and Date wise" requirement decomposes into four primary queries. All run in <50ms with the indexes in §4.4.

### 8.1 All submissions on a given date

```ts
prisma.workflowSubmission.findMany({
  where: { date: dateAtMidnight },
  include: { createdBy: true, workflow: true },
  orderBy: { workflow: { name: "asc" } }
})
```

Used by `/workflows/[slug]/history` "By date" tab.

### 8.2 All submissions touching a specific room

```ts
prisma.workflowCell.findMany({
  where: { roomId },
  distinct: ["submissionId"],
  include: { submission: { include: { workflow: true, createdBy: true } } },
  orderBy: { submission: { date: "desc" } }
})
```

Used by `/workflows/[slug]/history` "By room" tab.

### 8.3 Who marked Room X on Date Y

```ts
prisma.workflowCell.findMany({
  where: {
    roomId,
    submission: { date: dateAtMidnight, workflow: { slug } }
  },
  select: {
    itemText: true,
    status: true,
    lastUpdatedAt: true,
    lastUpdatedBy: { select: { name: true } }
  }
})
```

Surfaces in the read-only matrix view of a past submission.

### 8.4 Today's matrix (for the main editing UI)

Single query loads:
- Workflow definition (with non-archived items, sorted by `order`)
- All non-archived rooms
- Existing submission for today (or null)
- All cells + rows + row images for that submission

```ts
// pseudo
const [workflow, rooms, submission] = await Promise.all([
  prisma.workflowDefinition.findUnique({
    where: { slug },
    include: { items: { where: { archived: false }, orderBy: { order: "asc" } } }
  }),
  prisma.room.findMany({ where: { archived: false }, orderBy: { number: "asc" } }),
  prisma.workflowSubmission.findFirst({
    where: { workflow: { slug }, date: dateAtMidnight },
    include: {
      cells: { include: { lastUpdatedBy: { select: { name: true } } } },
      rows: { include: { images: true, lastUpdatedBy: { select: { name: true } } } }
    }
  })
])
```

If `submission` is null, the UI shows an "empty" matrix and creates a submission on first cell tap.

## 9. Photo storage

Reuses existing infrastructure verbatim.

- **Bucket:** `inspection-photos` (same private bucket as PM checklist photos)
- **Path convention:** `workflows/<workflowSlug>/<submissionId>/<rowId>/<uuid>.<ext>`
- **MIME validation:** same as inspection-photos (`image/jpeg`, `image/png`, `image/webp`, `image/heic`)
- **Max file size:** 10 MB
- **Signed URL TTL:** 3600 seconds (1 hour)
- **Components:** `src/components/PhotoPicker.tsx` and `src/components/PhotoLightbox.tsx` are reused as-is. They take generic props (file array, change handler) and don't know which feature they're embedded in.

The `saveRow` server action accepts FormData containing the note + any newly attached files. Upload-then-transact pattern (same as `saveInspection`).

## 10. Audit log

Extend `src/lib/audit.ts` `entity` union:
```ts
entity: "Room" | "Question" | "Section" | "User" | "Inspection"
      | "InspectionItemImage"  // existing
      | "WorkflowDefinition" | "WorkflowItem" | "WorkflowSubmission"
      | "WorkflowRow" | "WorkflowCell";  // new
```

When events log:
- `CREATE` WorkflowDefinition / WorkflowItem (admin)
- `UPDATE` WorkflowDefinition / WorkflowItem (admin) including archive/restore
- `CREATE` WorkflowSubmission (first cell tap)
- `UPDATE` WorkflowSubmission (status flip to COMPLETED)
- `UPDATE` WorkflowCell on every cell tap (chatty but valuable for the timeline feature later)
- `UPDATE` WorkflowRow on note save or photo add
- `DELETE` WorkflowRowImage on photo delete

Cell upsert events include `{ roomId, itemId, oldStatus, newStatus }` in `details`. This is the input the future per-room status timeline feature will consume.

## 11. Files affected

### New

| Path | Purpose |
|---|---|
| `src/lib/actions/workflows.ts` | Server actions for the workflow submission flow |
| `src/lib/actions/workflowAdmin.ts` | Admin CRUD for definitions + items |
| `src/lib/permissions.ts` | Role matrix + can* helpers |
| `src/components/WorkflowMatrix.tsx` | The matrix (client component) |
| `src/components/WorkflowMatrixRowPanel.tsx` | Per-row expanded panel (note + photos) |
| `src/components/WorkflowCellButton.tsx` | Three-state cell toggle button |
| `src/components/WorkflowHistory.tsx` | History list (by date / by room tabs) |
| `src/app/(app)/workflows/page.tsx` | Workflow index (role-based) |
| `src/app/(app)/workflows/[slug]/page.tsx` | Matrix submission view |
| `src/app/(app)/workflows/[slug]/history/page.tsx` | History page |
| `src/app/(app)/admin/workflows/page.tsx` | Admin builder index |
| `src/app/(app)/admin/workflows/[id]/page.tsx` | Single workflow editor |
| `prisma/seedWorkflows.ts` | Seeds Daily Cleanliness WorkflowDefinition + 18 items |
| `docs/features/platform-foundation.md` | Living feature doc |

### Modified

| Path | Why |
|---|---|
| `prisma/schema.prisma` | Add 6 new models, add User back-relations |
| `src/lib/audit.ts` | Extend entity union |
| `src/lib/session.ts` | Add `requireManager`, `requireWorkflowAccess`, `isManager` |
| `src/lib/auth.ts` | Update role types in JWT callback |
| `src/types/next-auth.d.ts` | Tighten role string union |
| `src/components/Nav.tsx` | Workflows as primary nav, role-based links |
| `middleware.ts` | Matcher includes `/workflows`, `/admin/workflows` |
| `src/app/(app)/layout.tsx` | Pass role for nav personalization |
| `docs/data-model.md` | Add the 6 new models |
| `docs/architecture.md` | Note the Foundation pattern, link to feature doc |
| `docs/features/README.md` | Mark Foundation as In Design → Live when shipped |

### Untouched

- Existing PM checklist code paths: `src/app/(app)/dashboard/`, `src/app/(app)/inspect/[roomId]/`, `src/app/(app)/rooms/`, `src/lib/actions/inspections.ts`, `src/lib/actions/rooms.ts`, `src/lib/actions/checklist.ts`, `src/lib/actions/users.ts`, `src/lib/actions/photos.ts`, `src/components/InspectForm.tsx`, `src/components/InspectionHistory.tsx`, `src/components/ChecklistManager.tsx`, `src/components/RoomsManager.tsx`, `src/components/UsersManager.tsx`, `src/components/PhotoPicker.tsx`, `src/components/PhotoLightbox.tsx`, `src/components/StatusBadge.tsx`
- Storage layer: `src/lib/storage.ts` (reused)
- DB connection: `src/lib/db.ts`
- Status helpers: `src/lib/status.ts` (PM-specific, kept separate)

## 12. Testing strategy

Manual end-to-end. No automated tests added (matching existing project conventions).

### Test checklist

1. **Migration:** schema applies cleanly via Supabase MCP (in a Supabase-management chat).
2. **Seed:** `seedWorkflows.ts` populates Daily Cleanliness with 18 items.
3. **Login as ADMIN:** lands at `/workflows`, sees Daily Cleanliness card + PM card.
4. **Login as INSPECTOR:** lands at `/workflows`, sees same cards but no admin links.
5. **Login as MANAGER (new role):** lands at `/workflows`, sees workflow cards + `users` admin link but not `questions` or `workflows` admin.
6. **First cell tap creates submission:** opening today's matrix and tapping one cell creates the WorkflowSubmission row and the WorkflowCell row.
7. **Subsequent cell taps update existing:** unique constraint on `(submissionId, roomId, itemId)` enforced.
8. **Per-cell attribution:** `lastUpdatedBy` populated correctly per tap; tooltip shows name.
9. **Per-row note save:** expanding a row, typing a note, saving creates/updates the WorkflowRow.
10. **Per-row photo upload:** PhotoPicker → save row → photos uploaded to Storage at the new path → WorkflowRowImage row created → admin lightbox delete works.
11. **Refresh button:** simulates another inspector by writing a cell via direct SQL → click refresh → see updated cell.
12. **Mark complete:** flips status, locks UI, audit logs the event.
13. **History by date:** see all dates with submissions, click one, view read-only matrix.
14. **History by room:** pick a room, see chronological submissions touching it.
15. **Existing PM checklist:** dashboard, inspect flow, history all still work untouched.
16. **Audit:** new events visible at `/admin/audit`.

## 13. Risks & open questions

| Risk | Mitigation |
|---|---|
| Matrix performance with 30+ rooms × 18 items = 540 cells | Each cell is a small button; virtualization not needed at this size. Test on mobile, set ceiling if needed |
| Sticky scroll across browsers (esp. iOS Safari) | Use `position: sticky` with `z-index` layering; manual smoke test on iPhone before sign-off |
| Daily date boundaries when motel ops span midnight | Date stored as UTC midnight; submissions auto-create at first tap. A late-night inspector starting at 11:55 PM and tapping at 12:05 AM creates Tuesday's submission, not Monday's. Acceptable for now — flag if this becomes a real problem |
| Audit log explosion from per-cell logging | 540 cells × 1 inspection/day × 30 days = 16,200 logs/month for one workflow. Manageable. Set retention policy (out of scope) if volumes grow |
| The reusable PhotoPicker/PhotoLightbox might need light refactor for the new feature's photo paths | Components already take props; should drop in. Verify during implementation |
| Role MANAGER's "read-only rooms" semantic adds complexity to existing rooms admin | Keep MANAGER out of `/rooms` admin route for now (only ADMIN). Reduce scope creep; revisit later |

## 14. Migration approach (Supabase)

Per existing pattern: schema applied via Supabase MCP `apply_migration` in a Supabase-management chat, NOT via Prisma migrations. The migration name: `add_foundation_workflow_tables`.

Sequence (executed in Supabase-management chat):
1. Apply migration to add 6 new tables + indexes + FKs.
2. Run a seed via `execute_sql` to insert the Daily Cleanliness `WorkflowDefinition` and 18 `WorkflowItem`s.
3. Verify via `list_tables` and a count query.

After Supabase work, this project chat runs `npx prisma generate` to refresh client types.

## 15. Future work (explicitly deferred)

- Room Cleaning Workflow (separate spec)
- Migrating PM Room Condition Inspection to the generic Workflow models (parallel kept for now)
- Real-time sync (Supabase Realtime on WorkflowCell)
- Auto-create submissions at midnight via cron
- Per-cell notes and per-cell photos
- Soft-delete + reopen completed submissions via admin UI
- Multi-tenancy
- Form shapes beyond MATRIX (e.g. PER_ROOM_DEEP could be used to migrate PM later)
- Cell-level undo and timeline view
- Workflow scheduling (recurring auto-create per cron pattern)
- Workflow-scoped rooms (e.g. "Daily Cleanliness applies only to occupied rooms" — currently all non-archived rooms)
- Export to PDF/CSV for a given submission
- Mobile-native experience beyond responsive web

---

**Reviewer:** Read end-to-end. Flag any section that disagrees with what you want, especially §4 (data model), §5 (role expansion), §7 (concurrency), §8 (history queries). Once approved, this spec drives the implementation plan generated by the `writing-plans` skill.
