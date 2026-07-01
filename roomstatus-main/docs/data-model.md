# Data Model

Authoritative reference: `prisma/schema.prisma`. This file explains the *why* alongside the *what*.

## Models

### User
Authentication and role assignment.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | App-generated cuid |
| `name` | `String` | Display name |
| `email` | `String @unique` | Lowercase-normalized at login lookup |
| `passwordHash` | `String` | bcrypt(12) hash; never log or return |
| `role` | `String @default("INSPECTOR")` | `ADMIN | INSPECTOR` (more roles coming with Foundation refactor) |
| `active` | `Boolean @default(true)` | Soft deactivation; inactive users can't log in |
| `createdAt` | `DateTime @default(now())` | |

**Relations:** `inspections Inspection[]`, `auditLogs AuditLog[]`

### Room
Physical rooms in the motel.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `number` | `String @unique` | Room number as displayed (`"101"`, `"203"`) |
| `name` | `String?` | Optional descriptive name (`"Standard Queen"`) |
| `floor` | `String?` | |
| `notes` | `String?` | Free-text admin notes |
| `archived` | `Boolean @default(false)` | Soft delete |
| `createdAt` | `DateTime @default(now())` | |
| `updatedAt` | `DateTime @updatedAt` | Prisma-managed |

**Relations:** `inspections Inspection[]`

### Section
Top-level grouping in the checklist. Editable by admins.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `name` | `String` | Display name (`"Bathroom & Vanity Area(s)"`) |
| `order` | `Int @default(0)` | Sort order within the checklist |
| `archived` | `Boolean @default(false)` | |

**Relations:** `questions Question[]`

### Question
Individual checklist line items.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `sectionId` | `String` | FK → Section |
| `text` | `String` | Question text |
| `order` | `Int @default(0)` | Sort order within section |
| `archived` | `Boolean @default(false)` | |
| `createdAt` | `DateTime @default(now())` | |

**Relations:** `section Section`, `responses InspectionItem[]`

### Inspection
Immutable record of a single inspection run.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | App-generated up-front so we know it before DB write |
| `roomId` | `String` | FK → Room |
| `inspectorId` | `String` | FK → User |
| `status` | `String @default("IN_PROGRESS")` | `IN_PROGRESS | COMPLETED` |
| `summary` | `String @default("OK")` | `OK | NEEDS_REPAIR` — derived at completion |
| `notes` | `String?` | Overall notes for the inspection |
| `startedAt` | `DateTime @default(now())` | |
| `completedAt` | `DateTime?` | Set when status flips to COMPLETED |

**Relations:** `room Room`, `inspector User`, `items InspectionItem[]`

### InspectionItem
Per-question response inside one inspection. **Cascading delete** from Inspection.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `inspectionId` | `String` | FK → Inspection, ON DELETE CASCADE |
| `questionId` | `String` | FK → Question |
| `questionText` | `String` | **Snapshot** of question text at inspection time |
| `sectionName` | `String` | **Snapshot** of section name at inspection time |
| `status` | `String @default("NA")` | `OK | NEEDS_REPAIR | REPAIR_COMPLETED | NA` |
| `note` | `String?` | Per-item note |

**Why the snapshot fields:** if admin later edits or archives a question, historical inspections still show the wording the inspector saw. See `architecture.md → snapshot-on-write`.

**Relations:** `inspection Inspection`, `question Question`, `images InspectionItemImage[]`

### InspectionItemImage
Photo evidence attached to an inspection item. **Cascading delete** from InspectionItem.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `inspectionItemId` | `String` | FK → InspectionItem, ON DELETE CASCADE |
| `storagePath` | `String` | `inspections/<inspId>/<itemId>/<uuid>.<ext>` in `inspection-photos` bucket |
| `width` | `Int?` | Best-effort metadata |
| `height` | `Int?` | Best-effort metadata |
| `bytes` | `Int?` | File size at upload |
| `createdAt` | `DateTime @default(now())` | |

**Indexed on** `inspectionItemId` for fast lookup when rendering history.

**Storage cleanup note:** DB cascade does NOT touch Supabase Storage. `deleteInspection` and `deletePhoto` in `src/lib/actions/photos.ts` handle Storage delete explicitly before the DB delete.

### AuditLog
Append-only activity log. Never updated, never deleted.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `userId` | `String?` | FK → User; nullable so LOGIN events don't break if user is deleted later |
| `action` | `String` | TypeScript-typed union: `CREATE | UPDATE | DELETE | ARCHIVE | RESTORE | LOGIN` |
| `entity` | `String` | TypeScript-typed union: `Room | Question | Section | User | Inspection | InspectionItemImage | WorkflowDefinition | WorkflowItem | WorkflowSubmission | WorkflowRow | WorkflowCell` |
| `entityId` | `String?` | ID of the entity acted on |
| `details` | `String?` | JSON-stringified context |
| `createdAt` | `DateTime @default(now())` | |

The DB column types are plain `String` (no enums) to keep migrations cheap. TypeScript unions in `src/lib/audit.ts` constrain values at write time.

---

## Foundation models (generic workflows)

Added by the Foundation refactor — see [`features/platform-foundation.md`](features/platform-foundation.md). The existing PM checklist tables (Section / Question / Inspection / InspectionItem) are NOT migrated; they coexist.

### WorkflowDefinition
A workflow type (e.g. Daily Cleanliness Inspection). Editable by admins.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `slug` | `String @unique` | URL slug (e.g. `daily-cleanliness`) |
| `name` | `String` | Display name |
| `description` | `String?` | Optional description for the workflows index card |
| `shape` | `String` | Currently only `MATRIX`. Reserved for future shapes (e.g. `PER_ROOM_DEEP`) |
| `rolesAllowed` | `String` | JSON-encoded array of role strings, e.g. `["ADMIN","MANAGER","INSPECTOR"]` |
| `archived` | `Boolean @default(false)` | Soft delete |
| `createdAt` | `DateTime @default(now())` | |
| `updatedAt` | `DateTime @updatedAt` | Prisma-managed |

**Relations:** `items WorkflowItem[]`, `submissions WorkflowSubmission[]`

### WorkflowItem
A column in the matrix (e.g. "Window & Glass"). Cascades from WorkflowDefinition.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `workflowId` | `String` | FK → WorkflowDefinition, ON DELETE CASCADE |
| `text` | `String` | Item label |
| `order` | `Int @default(0)` | Sort order |
| `archived` | `Boolean @default(false)` | |
| `createdAt` | `DateTime @default(now())` | |

**Relations:** `workflow WorkflowDefinition`, `cells WorkflowCell[]`
**Indexed on** `workflowId`.

### WorkflowSubmission
One inspection session, exactly one per workflow per date. Multiple inspectors collaborate on the same row.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | App-generated up-front for storage paths |
| `workflowId` | `String` | FK → WorkflowDefinition (no cascade — submissions block definition delete) |
| `date` | `DateTime` | Stored as UTC midnight; the calendar date is what matters |
| `status` | `String @default("IN_PROGRESS")` | `IN_PROGRESS | COMPLETED` |
| `createdById` | `String` | FK → User; the inspector who opened the form |
| `completedAt` | `DateTime?` | Set when status flips to COMPLETED |
| `createdAt` | `DateTime @default(now())` | |
| `updatedAt` | `DateTime @updatedAt` | |

**Relations:** `workflow`, `createdBy`, `rows WorkflowRow[]`, `cells WorkflowCell[]`
**Constraints:** `@@unique([workflowId, date])`. Indexes on `date` and `(workflowId, status)`.

### WorkflowRow
Per-room note + photos for a submission. **Cascading delete** from WorkflowSubmission.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `submissionId` | `String` | FK → WorkflowSubmission, ON DELETE CASCADE |
| `roomId` | `String` | FK → Room |
| `note` | `String?` | Free text up to 1000 chars |
| `lastUpdatedById` | `String?` | FK → User (SET NULL on user delete) |
| `lastUpdatedAt` | `DateTime?` | |

**Relations:** `submission`, `room`, `lastUpdatedBy`, `images WorkflowRowImage[]`
**Constraints:** `@@unique([submissionId, roomId])`. Index on `roomId`.

### WorkflowCell
One inspection result for (submission, room, item). **Sparse** — a row exists only when a cell is marked **OK** or **Issue**. Blank / N/A cells have **no row** (the UI's cycling checkbox deletes the row when cycled back to blank). **Cascading delete** from WorkflowSubmission.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `submissionId` | `String` | FK → WorkflowSubmission, ON DELETE CASCADE |
| `itemId` | `String` | FK → WorkflowItem |
| `roomId` | `String` | FK → Room |
| `itemText` | `String` | **Snapshot** of item.text at edit time |
| `status` | `String` | Stored values are only `OK` or `ISSUE`. (`NA` is the client's "clear" signal — the server deletes the row rather than storing `NA`.) |
| `lastUpdatedById` | `String` | FK → User; who last touched this cell |
| `lastUpdatedAt` | `DateTime @default(now())` | |

**Relations:** `submission`, `item`, `room`, `lastUpdatedBy`
**Constraints:** `@@unique([submissionId, roomId, itemId])`. Indexes on `submissionId`, `roomId`, `itemId`.
**UI mapping:** single cycling checkbox — blank (no row) → `OK` (✓) → `ISSUE` (✗) → blank (row deleted). See [`features/platform-foundation.md`](features/platform-foundation.md).

### WorkflowRowImage
Photo attached to a WorkflowRow. **Cascading delete** from WorkflowRow.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `rowId` | `String` | FK → WorkflowRow, ON DELETE CASCADE |
| `storagePath` | `String` | `workflows/<slug>/<submissionId>/<rowId>/<uuid>.<ext>` |
| `width`, `height`, `bytes` | `Int?` | Best-effort metadata |
| `uploadedById` | `String` | FK → User |
| `createdAt` | `DateTime @default(now())` | |

**Storage cleanup:** like InspectionItemImage, DB cascade does NOT touch Supabase Storage. The `deleteRowImage` server action handles Storage delete before DB delete.

## Cascade summary

| Delete | Cascades to |
|---|---|
| Inspection | InspectionItem → InspectionItemImage (DB only; Storage handled separately) |
| InspectionItem | InspectionItemImage |
| Room | (NO cascade — referenced inspections/workflow cells block deletion) |
| User | (NO cascade — referenced inspections/workflow updates block deletion) |
| Question | (NO cascade — referenced items block deletion; question is `archived` instead) |
| WorkflowDefinition | WorkflowItem. Submissions are NOT cascaded — definition can't be deleted while submissions exist; use `archived = true` |
| WorkflowSubmission | WorkflowRow → WorkflowRowImage AND WorkflowCell (DB only; Storage handled separately) |
| WorkflowRow | WorkflowRowImage (DB only; Storage handled separately) |

## Migration approach

The production schema was created via **Supabase MCP `apply_migration`** (raw SQL), not via Prisma's migrations folder. This means:
- `prisma/migrations/` does NOT exist in this repo.
- If you ever need `prisma migrate dev` to work locally, run `prisma migrate resolve --applied init_room_inspection_schema` first to align Prisma's view of migrations history.
- Future schema changes should be applied via Supabase MCP (in a Supabase-management chat) AND mirrored in `prisma/schema.prisma` so the Prisma client types stay in sync.
