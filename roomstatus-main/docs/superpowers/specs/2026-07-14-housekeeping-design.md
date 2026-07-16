# Housekeeping (HK) — Design & Plan Spec

**Date:** 2026-07-14
**Status:** Draft (awaiting user review)
**Branch:** `HK`
**Scope:** A new **Housekeeping service** — a per-room cleaning *status lifecycle* where housekeepers clean rooms and upload photo evidence, and inspectors review the photos and approve or bounce them back. Photos live in Supabase Storage with an admin-editable retention policy so the app stays on the free tier.

## 1. Motivation

The motel needs to track room turnover cleaning as a workflow with accountability:
- Housekeepers know which rooms need cleaning and record proof (photos) of the work.
- Inspectors verify the work before a room is declared rentable.
- Everything is logged so "who cleaned / who approved / when" is answerable later.

This is the first feature for the `HOUSEKEEPER` role (previously reserved). It is **not** a rooms×items matrix like Daily Cleanliness — it is a **status board** where each room moves through a lifecycle.

## 2. The lifecycle (state machine)

```
            checkout (manager, bulk)
                   │
                   ▼
          ┌─ READY_TO_CLEAN ─┐
          │        │          │  reject + note (inspector)
          │        │ submit   │
          │        │ (housekeeper, uploads photos)
          │        ▼          │
          │  READY_FOR_INSPECTION
          │        │          │
          │        │ approve (inspector)
          │        ▼          │
          │   READY_TO_RENT (terminal for this task)
          └──────────────────┘
```

- A **`HousekeepingTask`** represents one cleaning cycle for one room.
- `READY_TO_RENT` is terminal — the task is closed. The room can later be "checked out" again, creating a **new** task.
- A room's *current housekeeping status* = the status of its latest task (or "—" if never cleaned).

### Transitions & who may perform them

| From → To | Actor | Required input | Side effects |
|---|---|---|---|
| (new) → `READY_TO_CLEAN` | Manager/Admin (**bulk**) | one or more room IDs | Creates a task per room that has no open task |
| `READY_TO_CLEAN` → `READY_FOR_INSPECTION` | Housekeeper | ≥1 photo | Uploads photos, sets `submittedAt` |
| `READY_FOR_INSPECTION` → `READY_TO_RENT` | Inspector | — | Sets `closedAt`; photos deleted per retention policy |
| `READY_FOR_INSPECTION` → `READY_TO_CLEAN` | Inspector | **note (required)** | Sets `reviewNote`; photos retained; housekeeper re-cleans |

The server enforces every rule: a housekeeper cannot self-approve, an inspector cannot skip a state, only managers/admins can check out.

## 3. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Data shape | Per-room **status lifecycle** (own tables), NOT the Workflow matrix | It is a state machine, not a daily grid |
| Photo storage | **Supabase Storage** (reuse existing bucket + wrapper) | Free, already integrated; no Google Drive OAuth complexity |
| Photo path | `housekeeping/YYYY-MM/YYYY-MM-DD/room-<number>/<uuid>.<ext>` | Mirrors the user's Month → Date → Room folder idea |
| Retention | **Admin-editable**: `deleteOnApproval` toggle + `retentionDays` number (default: on, 7) | Keeps free tier from filling; user controls the window |
| Cleanup mechanism | Delete-on-approval (primary) + a daily **cron safety sweep** | Rolling storage stays tiny; sweep catches rejected/abandoned cycles |
| Room entry to pipeline | **Bulk "Check out"** action (manager selects many rooms at once) | User asked for multi-select bulk operations, not manual per-room |
| Service placement | Built-in service at `/services/housekeeping` (like PM, not a WorkflowDefinition) | Doesn't fit the generic matrix pattern |
| Permanent record | Status history + notes kept in DB forever; only photos are transient | Text is effectively free; pixels are the expensive part |
| Google Drive | Deferred (15 GB archive option for later) | Heavy OAuth/API integration; not needed for the core flow |

## 4. Scope

### In scope (v1 — this build)
- 3-state lifecycle with server-enforced transitions
- Housekeeping **board** grouped by status, with room cards
- **Bulk multi-select** + bulk actions (check out; inspector bulk approve/reject)
- Housekeeper photo upload (reuse `PhotoPicker`) + submit for inspection
- Inspector review: view photos (reuse `PhotoLightbox`), approve, or reject-with-note
- **Editable retention settings** page (delete-on-approval toggle, retention days, cleaning instructions text)
- **Auto-delete**: on approval (if enabled) + daily cron safety sweep
- Role gating (Housekeeper / Inspector / Manager / Admin), audit logging
- New service tile on `/services`; HOUSEKEEPER role gets a populated service list
- Supabase migration (new tables) + local seed of the singleton settings row

### Out of scope (deferred — the "sophisticated" layer)
- Required-photo checklists per room (e.g. must photograph bed, bathroom, floor)
- Assigning specific housekeepers to specific rooms (v1 has an optional `assignedHousekeeperId` field but no assignment UI)
- Per-room cleaning instructions/templates beyond one global instructions text
- SLA timers / overdue flags ("cleaned within X hours of checkout")
- A per-room status **timeline** view (the audit log already captures the data)
- Google Drive archive export
- Real booking/checkout/occupancy integration (the "Check out" button is the minimal stand-in)
- Notifications (push/email when a room is ready for inspection)
- CSV export

## 5. Data model (new tables — additive, no changes to existing tables except back-relations)

```prisma
model HousekeepingTask {
  id                    String    @id @default(cuid())
  roomId                String
  room                  Room      @relation(fields: [roomId], references: [id])
  status                String    // READY_TO_CLEAN | READY_FOR_INSPECTION | READY_TO_RENT
  assignedHousekeeperId String?
  assignedHousekeeper   User?     @relation("HKAssigned", fields: [assignedHousekeeperId], references: [id])
  createdById           String    // who checked out / created the task
  createdBy             User      @relation("HKCreated", fields: [createdById], references: [id])
  submittedById         String?   // housekeeper who submitted for inspection
  submittedBy           User?     @relation("HKSubmitted", fields: [submittedById], references: [id])
  submittedAt           DateTime?
  reviewedById          String?
  reviewedBy            User?     @relation("HKReviewed", fields: [reviewedById], references: [id])
  reviewedAt            DateTime?
  reviewNote            String?
  closedAt              DateTime? // set when → READY_TO_RENT
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  photos HousekeepingPhoto[]

  @@index([roomId])
  @@index([status])
}

model HousekeepingPhoto {
  id           String   @id @default(cuid())
  taskId       String
  task         HousekeepingTask @relation(fields: [taskId], references: [id], onDelete: Cascade)
  storagePath  String
  width        Int?
  height       Int?
  bytes        Int?
  uploadedById String
  uploadedBy   User     @relation("HKPhotoUploaded", fields: [uploadedById], references: [id])
  createdAt    DateTime @default(now())

  @@index([taskId])
  @@index([createdAt])   // for the retention sweep
}

model HousekeepingSetting {
  id               String   @id @default("singleton") // one row only
  deleteOnApproval Boolean  @default(true)
  retentionDays    Int      @default(7)
  instructions     String?  // cleaning instructions shown to housekeepers
  updatedAt        DateTime @updatedAt
}
```

**`User` back-relations added:** `hkAssigned`, `hkCreated`, `hkSubmitted`, `hkReviewed`, `hkPhotosUploaded`.
**`Room` back-relation added:** `housekeepingTasks HousekeepingTask[]`.

### Invariants
- **One open task per room.** "Open" = status in (`READY_TO_CLEAN`, `READY_FOR_INSPECTION`). Enforced in `checkOutRooms` — a room with an open task is skipped (reported back).
- `reviewNote` is required when rejecting (server-validated).
- Photos belong to a task; task deletion cascades to photo rows (DB); Storage objects are removed explicitly by the actions/sweep.

## 6. UI

### 6.1 Board — `/services/housekeeping`
- Grouped by status into three sections/columns: **Ready to Clean · Ready for Inspection · Ready to Rent**. On mobile, stack the sections (or a status filter dropdown).
- Each **room card** shows: room number + name, status, assigned housekeeper (if any), timestamps (checked out / submitted / reviewed), photo count, and the reject note if it was bounced back.
- **Checkboxes** on cards → a bulk action bar appears with role-appropriate actions.

### 6.2 Role-specific actions on the board
| Role | Sees | Can do |
|---|---|---|
| MANAGER / ADMIN | All statuses | Bulk **Check out** (creates Ready-to-Clean tasks); open settings; override |
| HOUSEKEEPER | Ready to Clean (+ their submitted) | Open a room → upload photos → **Submit for inspection** |
| INSPECTOR | Ready for Inspection (+ all, read) | Open a room → view photos → **Approve** or **Reject (note)**; bulk approve/reject |

### 6.3 Room detail / action panel
- Opening a card shows the room's current task: photos (thumbnails → lightbox), note, timestamps, and the action buttons valid for the viewer's role and the task's state.
- Housekeeper upload uses the existing `PhotoPicker`; inspector viewing uses `PhotoLightbox`.

### 6.4 Settings — `/services/housekeeping/settings` (admin)
- Toggle **delete photos on approval**.
- Number **retention days** (safety sweep window).
- Text area **cleaning instructions** (shown to housekeepers on the board).

## 7. Photos, storage & retention

- **Bucket:** reuse `inspection-photos` (private). Path: `housekeeping/<YYYY-MM>/<YYYY-MM-DD>/room-<number>/<uuid>.<ext>` using the upload date.
- **Upload flow:** housekeeper attaches photos and submits → upload to Storage (before DB write, same upload-then-transact pattern as inspections) → create `HousekeepingPhoto` rows → set task `READY_FOR_INSPECTION`.
- **Delete-on-approval:** when an inspector approves and `deleteOnApproval` is true, remove all of the task's Storage objects + photo rows.
- **Safety sweep (cron):** a protected route `/api/cron/housekeeping-cleanup` runs daily; deletes any `HousekeepingPhoto` older than `retentionDays` (Storage + DB). Configured via Vercel Cron (`vercel.json`), guarded by a `CRON_SECRET` header.
- **Result:** rolling storage stays small; the free tier never fills. The task record (status, who, when, note) is permanent.

### Vercel Cron note
Vercel Hobby supports scheduled functions (daily cadence is sufficient). Add:
```json
// vercel.json
{ "crons": [{ "path": "/api/cron/housekeeping-cleanup", "schedule": "0 3 * * *" }] }
```
The route verifies `Authorization: Bearer <CRON_SECRET>` (new env var) before running.

## 8. Server actions (`src/lib/actions/housekeeping.ts`)

- `checkOutRooms(roomIds: string[])` — Manager+. Creates `READY_TO_CLEAN` tasks for rooms without an open task; returns how many created/skipped.
- `submitForInspection(form: FormData)` — Housekeeper. FormData: `taskId` + `image-<i>` files. Uploads photos, sets `READY_FOR_INSPECTION`, `submittedAt`, `submittedById`. Requires ≥1 photo.
- `reviewTask(taskId, outcome: "APPROVE" | "REJECT", note?: string)` — Inspector. APPROVE → `READY_TO_RENT`, `closedAt`, delete photos if `deleteOnApproval`. REJECT → `READY_TO_CLEAN`, `reviewNote` (required, else error).
- `bulkReview(taskIds: string[], outcome, note?)` — Inspector. Applies review to many (reject requires a shared note).
- `deleteHousekeepingPhoto(photoId)` — Admin. Storage + DB.
- `updateHousekeepingSettings({ deleteOnApproval, retentionDays, instructions })` — Admin.
- `sweepExpiredHousekeepingPhotos()` — internal; called by the cron route.

All mutating actions: role check first (`requireManager` / `requireWorkflowAccess`-style HK helper / `requireAdmin`), then `logAudit`, then `revalidatePath("/services/housekeeping")`.

## 9. Roles & permissions

- HK is a **built-in service** (hardcoded role logic, like PM — not a `WorkflowDefinition`).
- Add to `src/lib/permissions.ts`: `canAccessHousekeeping(role)` = ADMIN | MANAGER | INSPECTOR | HOUSEKEEPER, plus per-action helpers (`canCheckOut` = manager+, `canSubmit` = housekeeper+manager+admin, `canReview` = inspector+manager+admin, `canConfigure` = admin).
- `middleware.ts` already protects `/services/*`, so no matcher change.
- `HOUSEKEEPER` finally sees a service on `/services`.

## 10. Audit log

Extend `src/lib/audit.ts` `entity` union with `HousekeepingTask` and `HousekeepingPhoto`. Log:
- `CREATE HousekeepingTask` (check out)
- `UPDATE HousekeepingTask` (submit / approve / reject — with outcome + note in details)
- `DELETE HousekeepingPhoto` (admin delete or sweep — details note the reason)
- `UPDATE` on settings changes (entity `HousekeepingSetting` — add to union too, or log as a generic settings change)

## 11. Files affected

### New
- `prisma/schema.prisma` — 3 new models + back-relations
- `prisma/manual-migrations/2026-07-14-add-housekeeping-tables.sql` — production migration (apply via Supabase MCP)
- `prisma/seedHousekeeping.ts` — inserts the singleton `HousekeepingSetting` row (local dev)
- `src/lib/actions/housekeeping.ts` — all HK server actions
- `src/lib/housekeeping.ts` — small helpers (status labels/colors, storage-path builder, permission helpers if not in permissions.ts)
- `src/components/HousekeepingBoard.tsx` — the status board + multi-select + bulk bar (client)
- `src/components/HousekeepingRoomCard.tsx` — a room card (client)
- `src/components/HousekeepingTaskPanel.tsx` — room detail/action panel (upload / review) (client)
- `src/components/HousekeepingSettingsForm.tsx` — settings editor (client)
- `src/app/(app)/services/housekeeping/page.tsx` — board page
- `src/app/(app)/services/housekeeping/settings/page.tsx` — settings page
- `src/app/api/cron/housekeeping-cleanup/route.ts` — daily sweep endpoint
- `vercel.json` — cron schedule
- `docs/features/housekeeping.md` — feature doc

### Modified
- `src/lib/audit.ts` — extend entity union
- `src/lib/permissions.ts` — HK access helpers
- `src/app/(app)/services/page.tsx` — add the Housekeeping service card (role-gated)
- `docs/features/README.md` — move HK to Shipped when done
- `docs/data-model.md` — document the 3 new models
- `docs/architecture.md` — note the cron + retention pattern

### Reused (no change)
- `src/lib/storage.ts` (upload / signed URL / delete)
- `src/components/PhotoPicker.tsx`, `src/components/PhotoLightbox.tsx`
- `src/lib/db.ts`, `src/lib/session.ts`, `src/lib/audit.ts` writer

## 12. Testing strategy (manual, matching project convention)

1. Migration applies cleanly (local Docker + prod Supabase).
2. Settings singleton seeds; settings page edits persist.
3. As Manager: multi-select rooms → Check out → they appear under Ready to Clean; skips rooms with an open task.
4. As Housekeeper: open a Ready-to-Clean room → upload photos → Submit → moves to Ready for Inspection; blocked if no photo.
5. As Inspector: open a Ready-for-Inspection room → view photos in lightbox → Approve → moves to Ready to Rent; if `deleteOnApproval`, Storage objects gone.
6. As Inspector: Reject without a note → blocked; Reject with note → back to Ready to Clean, note visible to housekeeper.
7. Bulk approve/reject several rooms at once.
8. Retention: set `retentionDays` low; run the cron route with the secret → old photos deleted; task records remain.
9. Role gating: Housekeeper can't approve; Inspector can't check out; non-admin can't open settings.
10. Photo storage path matches `housekeeping/YYYY-MM/YYYY-MM-DD/room-<number>/…`.
11. Audit log shows check-out / submit / approve / reject / deletes.

## 13. Risks & open questions

| Risk | Mitigation |
|---|---|
| Supabase free tier fills with photos | Delete-on-approval + daily sweep + editable retention keep it bounded |
| Vercel Hobby cron limits | Daily cadence is within limits; delete-on-approval does most of the work even if cron is delayed |
| Cron endpoint abuse | Guard with `CRON_SECRET` bearer check |
| A room "stuck" in Ready for Inspection forever | Sweep still deletes its photos after `retentionDays`; task stays visible for a manager to act |
| Upload timeout on many photos (mobile) | Vercel function timeout is 300s (2026); realistic photo counts are fine |
| Bulk operations on large selections | Cap batch size if needed; wrap in a transaction where practical |

## 14. Migration (Supabase)

Apply via Supabase MCP in a Supabase-management chat (per project convention):
1. `prisma/manual-migrations/2026-07-14-add-housekeeping-tables.sql` (3 tables + indexes + FKs) via `apply_migration`.
2. Insert the singleton `HousekeepingSetting` row via `execute_sql`.
3. Add the `CRON_SECRET` env var in Vercel.
4. Verify with `list_tables`.

## 15. Future work (the advanced/sophisticated layer)

- Required-photo checklist per room (bed / bathroom / floor / amenities).
- Assign specific housekeepers; a "my rooms" view.
- Per-room-type cleaning templates and instructions.
- SLA timers and overdue flags.
- Per-room status **timeline** (built from the audit log).
- Google Drive archive export (15 GB free, permanent).
- Booking/checkout integration so rooms auto-enter Ready to Clean.
- Notifications (ready-for-inspection, rejected).
- CSV/Excel export of housekeeping activity.

---

**Reviewer:** Read end-to-end. Flag anything to change — especially §2 (states/transitions), §5 (data model), §7 (retention/cron), and §6 (board UI). Once approved, this drives the implementation (via the writing-plans skill or a direct build on the `HK` branch).
