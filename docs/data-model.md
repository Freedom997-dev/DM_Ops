# Data Model

Authoritative source: [`prisma/schema.prisma`](../prisma/schema.prisma). This doc
explains the *why*, the allowed values of string "enums", relations, cascade
behaviour, and the rules for changing the schema safely.

All IDs are `String @id @default(cuid())` unless noted. Status/kind fields are
plain `String` columns (no Postgres enums) — the allowed values are enforced in
application code and listed below.

## Domain map

```
                         ┌──────────── User ────────────┐
                         │  (UserRole) ⇄ Role ─ RolePermission
                         │  LoginAttempt (by email, no FK)
                         │  AuditLog.userId
 ┌───────────────────────┼──────────────────────────────┼──────────────────────┐
 │ PM V1                 │ Workflows                     │ Housekeeping         │ PM V2
 │ Section─Question      │ WorkflowDefinition─Item       │ HousekeepingTask     │ PmV2Checklist─Section─Item
 │ Inspection─Item─Image │ Submission─Row─RowImage       │  ├ TaskItem          │ PmV2Area ─(opt)→ Room
 │        │              │          └Cell                │  └ Photo             │ PmV2Inspection─Result
 │        └──── Room ◄───┴──────────── Room ◄────────────┴── Room               │ PmV2Setting (singleton)
 │                                                         Setting (singleton)  │
 │                                                         StatusAction         │
 │                                                         TaskTemplate─ChecklistItem
 └──────────────────────────────────────────────────────────────────────────────┘
```

`Room` and `User` are the only tables shared across domains. Each service
otherwise owns its tables outright.

---

## Users & access control

### User
| Field | Type | Notes |
|---|---|---|
| `name` | String | Display name |
| `email` | String **unique** | Stored lower-case; login normalizes input |
| `passwordHash` | String | bcrypt cost 12. Never log/return |
| `role` | String, default `"INSPECTOR"` | **DEPRECATED** — legacy single role. Kept so the RBAC migration was non-destructive. **Not read by the app**; use `UserRole`. Seed uses it only to migrate users without roles |
| `active` | Boolean, default true | `false` = cannot sign in; existing sessions stop resolving on next request |
| `createdAt` | DateTime | |

Back-relations to every domain (inspections, workflow rows/cells/images, HK
assigned/assignedBy/created/submitted/reviewed/photos, PM V2 inspections updated).

### Role
| Field | Notes |
|---|---|
| `key` unique | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `INSPECTOR`, `HOUSEKEEPER`, or a custom key slugged from the label (e.g. `NIGHT_AUDIT`) |
| `label`, `description?` | UI text |
| `isSystem` | Built-in roles cannot be deleted |

### RolePermission
`(roleId, permission)` unique; `permission` is an `app:feature:action` string
validated against `src/lib/rbac/catalog.ts` (`sanitizePermissions` drops unknown
keys). Cascades on role delete. **SUPER_ADMIN has no rows** — it's a wildcard.

### UserRole
Composite PK `(userId, roleId)`; cascades from both sides. A user may hold many roles;
effective permissions = union.

### LoginAttempt
One row per **failed** sign-in: `email` (as typed, lower-cased — even for
non-existent accounts), `ip?`, `createdAt`. Index `(email, createdAt)`. Deleted on
successful sign-in. Drives lockout (5 in 15 min). Not FK-linked to `User` by design.

### AuditLog
| Field | Notes |
|---|---|
| `userId?` | Actor (nullable FK) |
| `action` | `CREATE \| UPDATE \| DELETE \| ARCHIVE \| RESTORE \| LOGIN` |
| `entity` | One of the union in `src/lib/audit.ts` (Room, Question, Section, User, Inspection, InspectionItemImage, Workflow*, Housekeeping*, Role, UserRole, PmV2*) |
| `entityId?` | Affected row id (sometimes `"bulk"` or the first id of a batch) |
| `details?` | JSON string — context / before-after |

Append-only; viewed at `/settings/activity`. No retention policy (grows forever).

---

## Shared

### Room
| Field | Notes |
|---|---|
| `number` **unique** | As displayed (`"101"`). Sorted numerically in reports (`byRoomNumber`) |
| `name?`, `floor?`, `notes?` | |
| `archived` | Soft delete — hides from boards; history keeps working |
| `createdAt`, `updatedAt` | |

Created from Settings → Rooms (`/settings/rooms`), PM V1 rooms page, or
Housekeeping settings (`hkCreateRoom`). PM V2 areas may *link* to a room but V2
never writes `Room`.

---

## PM V1 — Room Condition (hidden from portal)

### Section / Question
The single global checklist (seed: 3 sections, 95 questions). `order` for display,
`archived` for soft delete. `Question.sectionId` → Section (no cascade).

### Inspection
| Field | Values / notes |
|---|---|
| `roomId` → Room, `inspectorId` → User | No cascade (deleting a room with inspections is blocked) |
| `status` | `IN_PROGRESS \| COMPLETED` — app only ever writes `COMPLETED` |
| `summary` | `OK \| NEEDS_REPAIR` — derived: any item `NEEDS_REPAIR` → `NEEDS_REPAIR` |
| `notes?`, `startedAt`, `completedAt?` | |

Immutable history: a new inspection is a new row.

### InspectionItem
`inspectionId` (cascade), `questionId` → Question, **snapshot** `questionText`,
`sectionName`, `status` = `OK | NEEDS_REPAIR | REPAIR_COMPLETED | NA`, `note?`.

### InspectionItemImage
`inspectionItemId` (cascade), `storagePath`, `width?`, `height?`, `bytes?`.

**Derived room status** (`src/lib/status.ts`): latest completed inspection →
`NOT_INSPECTED` (none) / `NEEDS_REPAIR` (summary) / `FIXED` ("Fixed – verify":
any `REPAIR_COMPLETED` items) / `OK`.

---

## Workflows (generic services; Daily Cleanliness)

### WorkflowDefinition
| Field | Notes |
|---|---|
| `slug` **unique** | URL segment (`daily-cleanliness`). Must not collide with `pm`, `pm-v2`, `housekeeping` |
| `name`, `description?` | |
| `shape` | `"MATRIX"` (only shape implemented) |
| `rolesAllowed` | **JSON string** array of role keys, e.g. `'["ADMIN","MANAGER","INSPECTOR"]'`. Parse with `parseRolesAllowed` |
| `archived` | Hidden from catalog; access denied |

### WorkflowItem
Columns of the matrix. `workflowId` (cascade), `text`, `order`, `archived`.

### WorkflowSubmission
One run per workflow per day. `date` is **UTC midnight** (`@@unique([workflowId, date])`).
`status` = `IN_PROGRESS | COMPLETED`; `createdById`; `completedAt?`. Created lazily
on first interaction (`getOrCreateTodaySubmission`).

### WorkflowRow
Per (submission, room) — `@@unique([submissionId, roomId])`. `note?`,
`lastUpdatedById?`, `lastUpdatedAt?`. Cascade from submission.

### WorkflowCell
Per (submission, room, item) — unique. `itemText` **snapshot**, `status` =
`OK | ISSUE` stored (blank/N/A = **no row**; cycling to blank deletes it).
Cascade from submission.

### WorkflowRowImage
`rowId` (cascade), `storagePath`, dims/bytes, `uploadedById`.

---

## Housekeeping (HKT)

### HousekeepingTask
| Field | Notes |
|---|---|
| `kind` | `ROOM_CLEANING` (default) \| `GENERAL` |
| `title?` | GENERAL only |
| `recurring` | GENERAL only — nightly reset to `TODO`, unassigned, checklist `PENDING` |
| `roomId?` → Room | ROOM_CLEANING only |
| `status` | ROOM_CLEANING: `READY_TO_CLEAN → IN_PROGRESS → READY_FOR_INSPECTION → READY_TO_RENT` (reject → `READY_TO_CLEAN`). GENERAL: `TODO → IN_PROGRESS → DONE` |
| `requestReason?` | Status-action label that created it ("Checkout") |
| `assignedHousekeeperId?`, `assignedById?`, `assignedAt?` | Assignment |
| `startedAt?` | Set on start (or on submit if start was skipped) |
| `createdById` | Who checked out / created |
| `submittedById?`, `submittedAt?` | Submit for inspection / mark done |
| `reviewedById?`, `reviewedAt?`, `reviewNote?` | Approve/reject (note required on reject) |
| `closedAt?` | Set on `READY_TO_RENT` / `DONE` |

Indexes: `roomId`, `status`. Invariant (app-enforced): at most one **open**
ROOM_CLEANING task per room (`checkOutRooms` skips busy rooms). Rows are never
deleted except by `deleteHousekeepingTask` (manager).

### HousekeepingTaskItem
Per-task checklist snapshot. `label` (snapshot), `order`, `status` =
`PENDING | DONE | NOT_DONE | NA`, `note?`. Cascade from task. Submitting a room
requires every item `DONE` or `NA`.

### HousekeepingPhoto
Task media (images **and** videos — table name kept for stability). `mediaType` =
`IMAGE | VIDEO`, `storagePath`, dims/bytes, `uploadedById`. Cascade from task.
Kept until a manager deletes it (single photo or whole task) — never auto-deleted
since 2026-10-02, so it stays in the room history. `createdAt` also separates a
sent-back submission's media from the latest one in the task panel.

### HousekeepingSetting (singleton, `id = "singleton"`)
`instructions?`. `deleteOnApproval` and `retentionDays` still exist as columns but
are **unused** since 2026-10-02 (media is kept until deleted).

### HousekeepingStatusAction
Check-out panel options: `label`, `order`, `archived`. At least one must remain active.

### HousekeepingTaskTemplate / HousekeepingChecklistItem
Templates = quick-pick titles for GENERAL tasks. Checklist items belong to a
template (`templateId`, cascade) or, when `templateId` is **null**, to the
**room-cleaning** checklist. Snapshotted into `HousekeepingTaskItem` at task creation.

---

## PM V2 — Room Condition (quarterly)

### PmV2Setting (singleton)
`hotelName` (used in reports/messages).

### PmV2Checklist → PmV2Section → PmV2Item
Named checklists ("Guest room", "Common area"). Each level has `order` and
`archived`; sections/items cascade from their parent. "Removing" in the UI
**archives**, so past results keep their label. Seed/import keep artifact ids
(e.g. `gr01`) as primary keys.

### PmV2Area
Anything inspected. `name`, `group` (e.g. "Floor 2"), `type` = `ROOM | AREA`,
`checklistId?`, `roomId?` → Room (optional link), `order`, `archived`.

### PmV2Inspection
One per area per quarter — `@@unique([areaId, quarter])`. Edited in place
(auto-save), not immutable.

| Field | Notes |
|---|---|
| `quarter` | `"YYYY-Qn"` |
| `date` | `"YYYY-MM-DD"` string — browser-local walk-through date |
| `initials`, `notes` | Free text |
| `done`, `completedOn?` | Mark complete / reopen |
| `updatedById?` | Last editor |

Cascade from area.

### PmV2Result
| Field | Notes |
|---|---|
| `itemId?` | Checklist item; **null** = one-off "added for this room" extra (then `label` is set) |
| `status?` | `OK \| REPAIR \| REPLACE \| MISSING \| FIXED \| NA`; **null** = not checked |
| `note`, `fixedOn?` | `fixedOn` set when status becomes `FIXED` |

`@@unique([inspectionId, itemId])` (Postgres allows many null `itemId` extras).
"Issue" statuses = `REPAIR | REPLACE | MISSING`.

---

## Cascade summary

| Deleting… | Cascades to | Blocked by |
|---|---|---|
| Role | RolePermission, UserRole | — (system roles blocked in code) |
| User | UserRole | Any history FK (inspections, tasks, audit…) — deactivate instead |
| Room | — | Inspections, workflow rows/cells, HK tasks, PM V2 areas — archive instead |
| Inspection | InspectionItem → InspectionItemImage | — |
| WorkflowDefinition | WorkflowItem | Submissions (archive instead) |
| WorkflowSubmission | Rows → RowImages, Cells | — |
| HousekeepingTask | TaskItems, Photos | — |
| HousekeepingTaskTemplate | its ChecklistItems | — |
| PmV2Checklist | Sections → Items | Areas referencing it, Results referencing items |
| PmV2Area | Inspections → Results | — |

Storage objects are **never** removed by DB cascades — code deletes them first.

---

## Schema change rules

Production syncs with **`prisma db push`** on every deploy to `main` (there is no
`prisma/migrations/`). Therefore:

1. **Additive only** — new models, new nullable or defaulted columns, new indexes.
2. **Never rename** a field/model in place (push sees drop + add → data loss). Add
   the new field, backfill, switch code, leave the old one (mark `DEPRECATED`).
3. **Never drop** in the same deploy that stops using something. Dropping is a
   separate, deliberate, backed-up operation (see [operations.md](operations.md#backups)).
4. New required columns need a `@default(...)`, or push fails on existing rows.
5. Changing string "enum" values: support both old and new values in code first.
6. After any change locally: `npx prisma db push`, then **restart the dev server**.
7. Update this doc, and add the model to the `entity` union in `src/lib/audit.ts`
   if it will be audited.

`prisma/manual-migrations/*.sql` are historical (applied by hand in June 2026 before
the push-on-deploy pipeline). Don't add new ones; don't re-run them.

If the team grows, move to `prisma migrate` with committed migrations and remove
`db push` from `scripts/provision-db.mjs`.
