# Housekeeping (HK) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Housekeeping service where housekeepers clean rooms and upload photo evidence, inspectors approve or reject-with-note, rooms move through a status lifecycle, and photos auto-delete under an admin-editable retention policy so the app stays on the Supabase free tier.

**Architecture:** A per-room **status state machine** (`READY_TO_CLEAN → READY_FOR_INSPECTION → READY_TO_RENT`, with reject looping back). It uses its own tables (not the generic Workflow matrix), a built-in service at `/services/housekeeping`, the existing Supabase storage wrapper + PhotoPicker/PhotoLightbox, and a daily Vercel Cron sweep for retention.

**Tech Stack:** Next.js 14 App Router, Prisma 5, NextAuth, Supabase Storage, Tailwind, lucide-react, `cuid`. Reference spec: [`docs/superpowers/specs/2026-07-14-housekeeping-design.md`](../specs/2026-07-14-housekeeping-design.md).

## Global Constraints

- **No automated test framework.** Verify each task with `npx tsc --noEmit` (must be clean) + the manual checks in the task. This matches every prior feature in this repo.
- **Never commit/push automatically.** Commit steps are shown for whoever executes, but in this project the **user** runs all `git commit`/`git push`. When an agent executes, stop at "ready to commit" and let the user commit.
- **Branch:** `HK` (already created off `main`).
- **DB migrations:** applied to production **Supabase via MCP in a separate Supabase-management chat** — never from this project chat. Locally, use `prisma db push` against the Docker Postgres (`postgresql://postgres:devpass@localhost:5433/divya`).
- **Roles:** `ADMIN | MANAGER | INSPECTOR | HOUSEKEEPER` (already in `User.role`).
- **Storage bucket:** reuse `inspection-photos` (private). HK path: `housekeeping/<YYYY-MM>/<YYYY-MM-DD>/room-<number>/<uuid>.<ext>`.
- **Status values (exact strings):** `READY_TO_CLEAN`, `READY_FOR_INSPECTION`, `READY_TO_RENT`.

---

## File map

**New**
- `prisma/manual-migrations/2026-07-14-add-housekeeping-tables.sql` — prod migration
- `prisma/seedHousekeeping.ts` — seeds the settings singleton (local)
- `src/lib/housekeeping.ts` — status meta, storage-path builder, permission helpers
- `src/lib/actions/housekeeping.ts` — all server actions
- `src/components/HousekeepingBoard.tsx` — board + multi-select + bulk bar (client)
- `src/components/HousekeepingRoomCard.tsx` — one room card (client)
- `src/components/HousekeepingTaskPanel.tsx` — upload / review panel (client)
- `src/components/HousekeepingSettingsForm.tsx` — settings editor (client)
- `src/app/(app)/services/housekeeping/page.tsx` — board page
- `src/app/(app)/services/housekeeping/settings/page.tsx` — settings page
- `src/app/api/cron/housekeeping-cleanup/route.ts` — daily retention sweep
- `vercel.json` — cron schedule
- `docs/features/housekeeping.md` — feature doc

**Modified**
- `prisma/schema.prisma` — 3 models + back-relations
- `src/lib/audit.ts` — entity union
- `src/app/(app)/services/page.tsx` — HK service card
- `docs/features/README.md`, `docs/data-model.md`, `docs/architecture.md`

**Reused (no change):** `src/lib/storage.ts`, `src/components/PhotoPicker.tsx`, `src/components/PhotoLightbox.tsx`, `src/lib/db.ts`, `src/lib/session.ts`.

---

## Task 1: Data model + migration + settings seed

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/manual-migrations/2026-07-14-add-housekeeping-tables.sql`
- Create: `prisma/seedHousekeeping.ts`

**Interfaces:**
- Produces: Prisma models `HousekeepingTask`, `HousekeepingPhoto`, `HousekeepingSetting` with the fields below; the client accessors `prisma.housekeepingTask`, `prisma.housekeepingPhoto`, `prisma.housekeepingSetting`.

- [ ] **Step 1: Add the three models + back-relations to `prisma/schema.prisma`.**

Append these models at the end of the file:

```prisma
model HousekeepingTask {
  id                    String    @id @default(cuid())
  roomId                String
  room                  Room      @relation(fields: [roomId], references: [id])
  status                String    // READY_TO_CLEAN | READY_FOR_INSPECTION | READY_TO_RENT
  assignedHousekeeperId String?
  assignedHousekeeper   User?     @relation("HKAssigned", fields: [assignedHousekeeperId], references: [id])
  createdById           String
  createdBy             User      @relation("HKCreated", fields: [createdById], references: [id])
  submittedById         String?
  submittedBy           User?     @relation("HKSubmitted", fields: [submittedById], references: [id])
  submittedAt           DateTime?
  reviewedById          String?
  reviewedBy            User?     @relation("HKReviewed", fields: [reviewedById], references: [id])
  reviewedAt            DateTime?
  reviewNote            String?
  closedAt              DateTime?
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
  @@index([createdAt])
}

model HousekeepingSetting {
  id               String   @id @default("singleton")
  deleteOnApproval Boolean  @default(true)
  retentionDays    Int      @default(7)
  instructions     String?
  updatedAt        DateTime @updatedAt
}
```

Then add these back-relation lines inside the existing `model User { … }` block (with the other back-relations):

```prisma
  hkAssigned        HousekeepingTask[]  @relation("HKAssigned")
  hkCreated         HousekeepingTask[]  @relation("HKCreated")
  hkSubmitted       HousekeepingTask[]  @relation("HKSubmitted")
  hkReviewed        HousekeepingTask[]  @relation("HKReviewed")
  hkPhotosUploaded  HousekeepingPhoto[] @relation("HKPhotoUploaded")
```

And add this back-relation inside the existing `model Room { … }` block:

```prisma
  housekeepingTasks HousekeepingTask[]
```

- [ ] **Step 2: Regenerate the Prisma client + push to local Docker DB.**

```bash
cd "roomstatus-main"
export DATABASE_URL="postgresql://postgres:devpass@localhost:5433/divya?sslmode=disable"
npx prisma generate
npx prisma db push --skip-generate
```
Expected: `Your database is now in sync with your Prisma schema.` and `prisma.housekeepingTask` etc. now exist.

- [ ] **Step 3: Write the production SQL migration** at `prisma/manual-migrations/2026-07-14-add-housekeeping-tables.sql`:

```sql
-- Housekeeping tables. Apply via Supabase MCP `apply_migration` in a Supabase-management chat.

CREATE TABLE "HousekeepingTask" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "assignedHousekeeperId" TEXT,
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HousekeepingTask_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HousekeepingTask_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HousekeepingTask_assignedHousekeeperId_fkey" FOREIGN KEY ("assignedHousekeeperId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "HousekeepingTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HousekeepingTask_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "HousekeepingTask_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "HousekeepingTask_roomId_idx" ON "HousekeepingTask"("roomId");
CREATE INDEX "HousekeepingTask_status_idx" ON "HousekeepingTask"("status");

CREATE TABLE "HousekeepingPhoto" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HousekeepingPhoto_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HousekeepingPhoto_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HousekeepingTask"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HousekeepingPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "HousekeepingPhoto_taskId_idx" ON "HousekeepingPhoto"("taskId");
CREATE INDEX "HousekeepingPhoto_createdAt_idx" ON "HousekeepingPhoto"("createdAt");

CREATE TABLE "HousekeepingSetting" (
    "id" TEXT NOT NULL,
    "deleteOnApproval" BOOLEAN NOT NULL DEFAULT true,
    "retentionDays" INTEGER NOT NULL DEFAULT 7,
    "instructions" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HousekeepingSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "HousekeepingSetting" ("id", "deleteOnApproval", "retentionDays") VALUES ('singleton', true, 7);
```

- [ ] **Step 4: Write the local settings seed** at `prisma/seedHousekeeping.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.housekeepingSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", deleteOnApproval: true, retentionDays: 7 },
    update: {},
  });
  console.log("✓ Housekeeping settings singleton ensured");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 5: Seed locally + verify.**

```bash
export DATABASE_URL="postgresql://postgres:devpass@localhost:5433/divya?sslmode=disable"
npx tsx prisma/seedHousekeeping.ts
docker exec divya-pg psql -U postgres -d divya -tc "SELECT id, \"deleteOnApproval\", \"retentionDays\" FROM \"HousekeepingSetting\";"
```
Expected: one row `singleton | t | 7`.

- [ ] **Step 6: Type-check.**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 7: Ready to commit** (user runs):
```bash
git add roomstatus-main/prisma/schema.prisma roomstatus-main/prisma/manual-migrations/2026-07-14-add-housekeeping-tables.sql roomstatus-main/prisma/seedHousekeeping.ts
git commit -m "feat(hk): add Housekeeping data model + migration + settings seed"
```

---

## Task 2: Helpers (status meta, storage path, permissions) + audit union

**Files:**
- Create: `src/lib/housekeeping.ts`
- Modify: `src/lib/audit.ts`

**Interfaces:**
- Produces:
  - `HK_STATUS` = `["READY_TO_CLEAN","READY_FOR_INSPECTION","READY_TO_RENT"] as const`; `type HkStatus`.
  - `HK_STATUS_META: Record<HkStatus, { label: string; chip: string; dot: string }>`.
  - `hkPhotoPath(roomNumber: string, ext: string): string`.
  - `canAccessHousekeeping(role)`, `canCheckOut(role)`, `canSubmitCleaning(role)`, `canReviewCleaning(role)`, `canConfigureHousekeeping(role)` — all `(role: string | null | undefined) => boolean`.
  - `audit` entity union includes `"HousekeepingTask" | "HousekeepingPhoto" | "HousekeepingSetting"`.

- [ ] **Step 1: Create `src/lib/housekeeping.ts`:**

```ts
import cuid from "cuid";

export const HK_STATUS = [
  "READY_TO_CLEAN",
  "READY_FOR_INSPECTION",
  "READY_TO_RENT",
] as const;
export type HkStatus = (typeof HK_STATUS)[number];

export const HK_STATUS_META: Record<
  HkStatus,
  { label: string; chip: string; dot: string }
> = {
  READY_TO_CLEAN: {
    label: "Ready to Clean",
    chip: "bg-amber-100 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
  },
  READY_FOR_INSPECTION: {
    label: "Ready for Inspection",
    chip: "bg-blue-100 text-blue-800 border-blue-200",
    dot: "bg-blue-500",
  },
  READY_TO_RENT: {
    label: "Ready to Rent",
    chip: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dot: "bg-emerald-500",
  },
};

export function isHkStatus(s: string): s is HkStatus {
  return (HK_STATUS as readonly string[]).includes(s);
}

// housekeeping/<YYYY-MM>/<YYYY-MM-DD>/room-<number>/<uuid>.<ext>
export function hkPhotoPath(roomNumber: string, ext: string): string {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const ymd = `${ym}-${String(now.getUTCDate()).padStart(2, "0")}`;
  const safeRoom = roomNumber.replace(/[^A-Za-z0-9_-]/g, "");
  return `housekeeping/${ym}/${ymd}/room-${safeRoom}/${cuid()}.${ext}`;
}

// --- Role helpers (HK is a built-in service; roles hardcoded like PM) ---
export function canAccessHousekeeping(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "INSPECTOR" || role === "HOUSEKEEPER";
}
export function canCheckOut(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER";
}
export function canSubmitCleaning(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "HOUSEKEEPER";
}
export function canReviewCleaning(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "INSPECTOR";
}
export function canConfigureHousekeeping(role: string | null | undefined): boolean {
  return role === "ADMIN";
}
```

- [ ] **Step 2: Extend the audit entity union in `src/lib/audit.ts`.** Find the `entity:` union and add the three HK entities. The union should read:

```ts
  entity:
    | "Room"
    | "Question"
    | "Section"
    | "User"
    | "Inspection"
    | "InspectionItemImage"
    | "WorkflowDefinition"
    | "WorkflowItem"
    | "WorkflowSubmission"
    | "WorkflowRow"
    | "WorkflowCell"
    | "HousekeepingTask"
    | "HousekeepingPhoto"
    | "HousekeepingSetting";
```

- [ ] **Step 3: Type-check.**
```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Ready to commit** (user runs):
```bash
git add roomstatus-main/src/lib/housekeeping.ts roomstatus-main/src/lib/audit.ts
git commit -m "feat(hk): status meta, storage-path + permission helpers, audit union"
```

---

## Task 3: Server actions

**Files:**
- Create: `src/lib/actions/housekeeping.ts`

**Interfaces:**
- Consumes: `hkPhotoPath`, role helpers (Task 2); `uploadImage`, `deleteImages`, `getSignedUrl` from `@/lib/storage`; `requireUser`, `getCurrentUser` from `@/lib/session`; `logAudit`; `prisma`.
- Produces (server actions):
  - `checkOutRooms(roomIds: string[]): Promise<{ ok: true; created: number; skipped: number } | { ok: false; error: string }>`
  - `submitForInspection(form: FormData): Promise<{ ok: true } | { ok: false; error: string }>` (FormData: `taskId`, `image-<i>` files)
  - `reviewTask(taskId: string, outcome: "APPROVE" | "REJECT", note?: string): Promise<{ ok: true } | { ok: false; error: string }>`
  - `bulkReview(taskIds: string[], outcome: "APPROVE" | "REJECT", note?: string): Promise<{ ok: true; count: number } | { ok: false; error: string }>`
  - `deleteHousekeepingPhoto(photoId: string): Promise<{ ok: true } | { ok: false; error: string }>`
  - `updateHousekeepingSettings(input: { deleteOnApproval: boolean; retentionDays: number; instructions: string }): Promise<{ ok: true } | { ok: false; error: string }>`
  - `sweepExpiredHousekeepingPhotos(): Promise<{ deleted: number }>`

- [ ] **Step 1: Create `src/lib/actions/housekeeping.ts`:**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { uploadImage, deleteImages } from "@/lib/storage";
import {
  hkPhotoPath,
  canCheckOut,
  canSubmitCleaning,
  canReviewCleaning,
  canConfigureHousekeeping,
} from "@/lib/housekeeping";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const OPEN_STATUSES = ["READY_TO_CLEAN", "READY_FOR_INSPECTION"];

type Result = { ok: true } | { ok: false; error: string };

function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  return "bin";
}

// --- Check out rooms → create READY_TO_CLEAN tasks (bulk) ---
export async function checkOutRooms(
  roomIds: string[],
): Promise<{ ok: true; created: number; skipped: number } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!canCheckOut(user.role)) return { ok: false, error: "Not allowed." };
  if (!Array.isArray(roomIds) || roomIds.length === 0) {
    return { ok: false, error: "No rooms selected." };
  }

  const rooms = await prisma.room.findMany({
    where: { id: { in: roomIds }, archived: false },
    select: { id: true, number: true },
  });

  // Rooms that already have an open task are skipped.
  const openTasks = await prisma.housekeepingTask.findMany({
    where: { roomId: { in: rooms.map((r) => r.id) }, status: { in: OPEN_STATUSES } },
    select: { roomId: true },
  });
  const busy = new Set(openTasks.map((t) => t.roomId));
  const toCreate = rooms.filter((r) => !busy.has(r.id));

  for (const room of toCreate) {
    const task = await prisma.housekeepingTask.create({
      data: { roomId: room.id, status: "READY_TO_CLEAN", createdById: user.id },
    });
    await logAudit({
      userId: user.id,
      action: "CREATE",
      entity: "HousekeepingTask",
      entityId: task.id,
      details: { roomNumber: room.number, status: "READY_TO_CLEAN" },
    });
  }

  revalidatePath("/services/housekeeping");
  return { ok: true, created: toCreate.length, skipped: rooms.length - toCreate.length };
}

// --- Housekeeper submits cleaned room for inspection (with photos) ---
export async function submitForInspection(form: FormData): Promise<Result> {
  const user = await requireUser();
  if (!canSubmitCleaning(user.role)) return { ok: false, error: "Not allowed." };

  const taskId = form.get("taskId");
  if (typeof taskId !== "string") return { ok: false, error: "Missing task." };

  const task = await prisma.housekeepingTask.findUnique({
    where: { id: taskId },
    include: { room: { select: { number: true } } },
  });
  if (!task) return { ok: false, error: "Task not found." };
  if (task.status !== "READY_TO_CLEAN") {
    return { ok: false, error: "This room is not awaiting cleaning." };
  }

  // Stage + validate files
  type Staged = { file: File; storagePath: string };
  const staged: Staged[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("image-")) continue;
    if (!(value instanceof File)) continue;
    if (!value.type.startsWith("image/")) return { ok: false, error: `Not an image: ${value.name}` };
    if (value.size > MAX_FILE_BYTES) return { ok: false, error: `${value.name} exceeds 10 MB.` };
    staged.push({ file: value, storagePath: hkPhotoPath(task.room.number, extFromMime(value.type)) });
  }
  if (staged.length === 0) return { ok: false, error: "Add at least one photo before submitting." };

  const uploaded: string[] = [];
  try {
    for (const s of staged) {
      await uploadImage(s.storagePath, s.file, s.file.type);
      uploaded.push(s.storagePath);
    }
  } catch (e) {
    await deleteImages(uploaded);
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.housekeepingPhoto.createMany({
        data: staged.map((s) => ({
          taskId,
          storagePath: s.storagePath,
          bytes: s.file.size,
          uploadedById: user.id,
        })),
      });
      await tx.housekeepingTask.update({
        where: { id: taskId },
        data: { status: "READY_FOR_INSPECTION", submittedById: user.id, submittedAt: new Date() },
      });
    });
  } catch (e) {
    await deleteImages(uploaded);
    return { ok: false, error: e instanceof Error ? e.message : "Could not submit." };
  }

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "HousekeepingTask",
    entityId: taskId,
    details: { roomNumber: task.room.number, status: "READY_FOR_INSPECTION", photos: uploaded.length },
  });

  revalidatePath("/services/housekeeping");
  return { ok: true };
}

// --- Inspector review: approve or reject-with-note ---
export async function reviewTask(
  taskId: string,
  outcome: "APPROVE" | "REJECT",
  note?: string,
): Promise<Result> {
  const user = await requireUser();
  if (!canReviewCleaning(user.role)) return { ok: false, error: "Not allowed." };

  const task = await prisma.housekeepingTask.findUnique({
    where: { id: taskId },
    include: { room: { select: { number: true } }, photos: { select: { id: true, storagePath: true } } },
  });
  if (!task) return { ok: false, error: "Task not found." };
  if (task.status !== "READY_FOR_INSPECTION") {
    return { ok: false, error: "This room is not awaiting inspection." };
  }

  if (outcome === "REJECT") {
    const trimmed = (note ?? "").trim();
    if (!trimmed) return { ok: false, error: "A note is required when rejecting." };
    await prisma.housekeepingTask.update({
      where: { id: taskId },
      data: {
        status: "READY_TO_CLEAN",
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote: trimmed.slice(0, 1000),
      },
    });
    await logAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "HousekeepingTask",
      entityId: taskId,
      details: { roomNumber: task.room.number, outcome: "REJECTED", note: trimmed.slice(0, 200) },
    });
    revalidatePath("/services/housekeeping");
    return { ok: true };
  }

  // APPROVE
  const setting = await prisma.housekeepingSetting.findUnique({ where: { id: "singleton" } });
  const deleteOnApproval = setting?.deleteOnApproval ?? true;

  await prisma.housekeepingTask.update({
    where: { id: taskId },
    data: {
      status: "READY_TO_RENT",
      reviewedById: user.id,
      reviewedAt: new Date(),
      reviewNote: (note ?? "").trim().slice(0, 1000) || null,
      closedAt: new Date(),
    },
  });

  if (deleteOnApproval && task.photos.length > 0) {
    await deleteImages(task.photos.map((p) => p.storagePath));
    await prisma.housekeepingPhoto.deleteMany({ where: { taskId } });
    await logAudit({
      userId: user.id,
      action: "DELETE",
      entity: "HousekeepingPhoto",
      entityId: taskId,
      details: { reason: "deleteOnApproval", count: task.photos.length },
    });
  }

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "HousekeepingTask",
    entityId: taskId,
    details: { roomNumber: task.room.number, outcome: "APPROVED" },
  });

  revalidatePath("/services/housekeeping");
  return { ok: true };
}

// --- Bulk review (approve or reject many) ---
export async function bulkReview(
  taskIds: string[],
  outcome: "APPROVE" | "REJECT",
  note?: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!Array.isArray(taskIds) || taskIds.length === 0) return { ok: false, error: "No rooms selected." };
  if (outcome === "REJECT" && !(note ?? "").trim()) {
    return { ok: false, error: "A note is required when rejecting." };
  }
  let count = 0;
  for (const id of taskIds) {
    const res = await reviewTask(id, outcome, note);
    if (res.ok) count++;
  }
  return { ok: true, count };
}

// --- Admin: delete a single photo ---
export async function deleteHousekeepingPhoto(photoId: string): Promise<Result> {
  const user = await requireUser();
  if (!canConfigureHousekeeping(user.role)) return { ok: false, error: "Not allowed." };

  const photo = await prisma.housekeepingPhoto.findUnique({ where: { id: photoId } });
  if (!photo) return { ok: false, error: "Photo not found." };

  await deleteImages([photo.storagePath]);
  await prisma.housekeepingPhoto.delete({ where: { id: photoId } });
  await logAudit({
    userId: user.id,
    action: "DELETE",
    entity: "HousekeepingPhoto",
    entityId: photoId,
    details: { storagePath: photo.storagePath },
  });
  revalidatePath("/services/housekeeping");
  return { ok: true };
}

// --- Admin: update retention/instructions settings ---
export async function updateHousekeepingSettings(input: {
  deleteOnApproval: boolean;
  retentionDays: number;
  instructions: string;
}): Promise<Result> {
  const user = await requireUser();
  if (!canConfigureHousekeeping(user.role)) return { ok: false, error: "Not allowed." };

  const days = Math.min(365, Math.max(1, Math.round(input.retentionDays)));
  await prisma.housekeepingSetting.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      deleteOnApproval: input.deleteOnApproval,
      retentionDays: days,
      instructions: input.instructions.trim().slice(0, 2000) || null,
    },
    update: {
      deleteOnApproval: input.deleteOnApproval,
      retentionDays: days,
      instructions: input.instructions.trim().slice(0, 2000) || null,
    },
  });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "HousekeepingSetting",
    entityId: "singleton",
    details: { deleteOnApproval: input.deleteOnApproval, retentionDays: days },
  });
  revalidatePath("/services/housekeeping");
  revalidatePath("/services/housekeeping/settings");
  return { ok: true };
}

// --- Retention sweep (called by the cron route; not a user action) ---
export async function sweepExpiredHousekeepingPhotos(): Promise<{ deleted: number }> {
  const setting = await prisma.housekeepingSetting.findUnique({ where: { id: "singleton" } });
  const retentionDays = setting?.retentionDays ?? 7;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const expired = await prisma.housekeepingPhoto.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, storagePath: true },
  });
  if (expired.length === 0) return { deleted: 0 };

  await deleteImages(expired.map((p) => p.storagePath));
  await prisma.housekeepingPhoto.deleteMany({ where: { id: { in: expired.map((p) => p.id) } } });
  return { deleted: expired.length };
}
```

- [ ] **Step 2: Type-check.**
```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Ready to commit** (user runs):
```bash
git add roomstatus-main/src/lib/actions/housekeeping.ts
git commit -m "feat(hk): server actions (checkout, submit, review, bulk, settings, sweep)"
```

---

## Task 4: Board UI (card + panel + board)

**Files:**
- Create: `src/components/HousekeepingRoomCard.tsx`
- Create: `src/components/HousekeepingTaskPanel.tsx`
- Create: `src/components/HousekeepingBoard.tsx`

**Interfaces:**
- Consumes: actions from Task 3; `HK_STATUS_META`, `HkStatus` from `@/lib/housekeeping`; `PhotoPicker`, `PhotoLightbox` components.
- Produces:
  - `type HkTaskView = { id: string; status: HkStatus; roomId: string; roomNumber: string; roomName: string | null; submittedBy: string | null; reviewNote: string | null; submittedAt: string | null; photos: { id: string; url: string }[] }`
  - `type HkRoomOption = { id: string; number: string; name: string | null }`
  - `<HousekeepingBoard tasks={HkTaskView[]} checkoutableRooms={HkRoomOption[]} caps={{ checkout: boolean; submit: boolean; review: boolean; admin: boolean }} />`

- [ ] **Step 1: Create `src/components/HousekeepingTaskPanel.tsx`** (upload for housekeeper, review for inspector):

```tsx
"use client";

import { useState, useTransition } from "react";
import { Loader2, Check, X, Send } from "lucide-react";
import { PhotoPicker } from "@/components/PhotoPicker";
import { submitForInspection, reviewTask } from "@/lib/actions/housekeeping";

export type PanelPhoto = { id: string; url: string };

type Props = {
  taskId: string;
  status: "READY_TO_CLEAN" | "READY_FOR_INSPECTION" | "READY_TO_RENT";
  roomId: string;
  photos: PanelPhoto[];
  reviewNote: string | null;
  caps: { submit: boolean; review: boolean };
  onDone: () => void;
};

export function HousekeepingTaskPanel({ taskId, status, roomId, photos, reviewNote, caps, onDone }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    if (files.length === 0) { setError("Add at least one photo."); return; }
    const form = new FormData();
    form.set("taskId", taskId);
    files.forEach((f, i) => form.append(`image-${i}`, f, f.name));
    start(async () => {
      const res = await submitForInspection(form);
      if (!res.ok) { setError(res.error); return; }
      onDone();
    });
  }

  function review(outcome: "APPROVE" | "REJECT") {
    setError(null);
    if (outcome === "REJECT" && !note.trim()) { setError("A note is required to reject."); return; }
    start(async () => {
      const res = await reviewTask(taskId, outcome, note);
      if (!res.ok) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      {reviewNote && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Inspector note: {reviewNote}
        </p>
      )}

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={p.url} alt="" className="h-16 w-16 rounded-md border border-slate-200 object-cover" />
          ))}
        </div>
      )}

      {status === "READY_TO_CLEAN" && caps.submit && (
        <>
          <span className="text-xs font-medium text-slate-500">Add photos of the cleaned room</span>
          <PhotoPicker questionId={roomId} files={files} onChange={setFiles} />
          {error && <p className="text-xs text-red-700">{error}</p>}
          <button type="button" onClick={submit} disabled={pending} className="btn-primary">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit for inspection
          </button>
        </>
      )}

      {status === "READY_FOR_INSPECTION" && caps.review && (
        <>
          <textarea
            className="input min-h-[56px] text-sm"
            placeholder="Note (required to reject)…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={pending}
          />
          {error && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => review("APPROVE")} disabled={pending} className="btn-primary">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Approve — Ready to Rent
            </button>
            <button type="button" onClick={() => review("REJECT")} disabled={pending}
              className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              <X className="mr-1 inline h-4 w-4" /> Reject
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/HousekeepingRoomCard.tsx`:**

```tsx
"use client";

import clsx from "clsx";
import { HK_STATUS_META, type HkStatus } from "@/lib/housekeeping";

type Props = {
  roomNumber: string;
  roomName: string | null;
  status: HkStatus;
  submittedBy: string | null;
  photoCount: number;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  open: boolean;
};

export function HousekeepingRoomCard({
  roomNumber, roomName, status, submittedBy, photoCount, selectable, selected, onToggleSelect, onOpen, open,
}: Props) {
  const meta = HK_STATUS_META[status];
  return (
    <div className={clsx("card p-3", open && "ring-2 ring-brand-300")}>
      <div className="flex items-start gap-2">
        {selectable && (
          <input type="checkbox" checked={selected} onChange={onToggleSelect} className="mt-1 h-4 w-4" aria-label={`Select room ${roomNumber}`} />
        )}
        <button type="button" onClick={onOpen} className="flex-1 text-left">
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">Room {roomNumber}</div>
            <span className={clsx("h-2.5 w-2.5 rounded-full", meta.dot)} />
          </div>
          {roomName && <div className="text-[11px] text-slate-500">{roomName}</div>}
          <span className={clsx("mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold", meta.chip)}>
            {meta.label}
          </span>
          <div className="mt-1 text-[11px] text-slate-400">
            {photoCount > 0 && <>{photoCount} photo{photoCount === 1 ? "" : "s"} · </>}
            {submittedBy ? `by ${submittedBy}` : "—"}
          </div>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/HousekeepingBoard.tsx`:**

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, DoorOpen } from "lucide-react";
import { HK_STATUS, HK_STATUS_META, type HkStatus } from "@/lib/housekeeping";
import { HousekeepingRoomCard } from "@/components/HousekeepingRoomCard";
import { HousekeepingTaskPanel, type PanelPhoto } from "@/components/HousekeepingTaskPanel";
import { checkOutRooms, bulkReview } from "@/lib/actions/housekeeping";

export type HkTaskView = {
  id: string;
  status: HkStatus;
  roomId: string;
  roomNumber: string;
  roomName: string | null;
  submittedBy: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  photos: PanelPhoto[];
};
export type HkRoomOption = { id: string; number: string; name: string | null };

type Props = {
  tasks: HkTaskView[];
  checkoutableRooms: HkRoomOption[];
  caps: { checkout: boolean; submit: boolean; review: boolean; admin: boolean };
};

export function HousekeepingBoard({ tasks, checkoutableRooms, caps }: Props) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checkoutSel, setCheckoutSel] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const byStatus = useMemo(() => {
    const m: Record<HkStatus, HkTaskView[]> = {
      READY_TO_CLEAN: [], READY_FOR_INSPECTION: [], READY_TO_RENT: [],
    };
    for (const t of tasks) m[t.status].push(t);
    return m;
  }, [tasks]);

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  }

  function doCheckout() {
    setError(null);
    start(async () => {
      const res = await checkOutRooms([...checkoutSel]);
      if (!res.ok) { setError(res.error); return; }
      setCheckoutSel(new Set());
      router.refresh();
    });
  }

  function doBulkReview(outcome: "APPROVE" | "REJECT") {
    setError(null);
    let note: string | undefined;
    if (outcome === "REJECT") {
      note = window.prompt("Reason for rejecting the selected rooms?") ?? "";
      if (!note.trim()) { setError("A note is required to reject."); return; }
    }
    start(async () => {
      const res = await bulkReview([...selected], outcome, note);
      if (!res.ok) { setError(res.error); return; }
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Check out rooms (manager+) */}
      {caps.checkout && (
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700">Check out rooms → Ready to Clean</h2>
            <button type="button" onClick={doCheckout} disabled={pending || checkoutSel.size === 0} className="btn-primary">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />}
              Check out {checkoutSel.size > 0 ? `(${checkoutSel.size})` : ""}
            </button>
          </div>
          {checkoutableRooms.length === 0 ? (
            <p className="text-xs text-slate-500">All rooms already have an open housekeeping task.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {checkoutableRooms.map((r) => {
                const on = checkoutSel.has(r.id);
                return (
                  <button key={r.id} type="button" onClick={() => toggle(checkoutSel, r.id, setCheckoutSel)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>
                    {r.number}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bulk review bar (inspector+) */}
      {caps.review && selected.size > 0 && (
        <div className="sticky top-[60px] z-20 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => doBulkReview("APPROVE")} disabled={pending} className="btn-primary">Approve</button>
            <button type="button" onClick={() => doBulkReview("REJECT")} disabled={pending}
              className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">Reject</button>
          </div>
        </div>
      )}

      {/* Status columns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {HK_STATUS.map((status) => (
          <div key={status} className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <span className={`h-2.5 w-2.5 rounded-full ${HK_STATUS_META[status].dot}`} />
              {HK_STATUS_META[status].label}
              <span className="text-xs font-normal text-slate-400">({byStatus[status].length})</span>
            </h3>
            {byStatus[status].length === 0 ? (
              <p className="text-xs text-slate-400">None.</p>
            ) : (
              byStatus[status].map((t) => (
                <div key={t.id}>
                  <HousekeepingRoomCard
                    roomNumber={t.roomNumber}
                    roomName={t.roomName}
                    status={t.status}
                    submittedBy={t.submittedBy}
                    photoCount={t.photos.length}
                    selectable={caps.review && t.status === "READY_FOR_INSPECTION"}
                    selected={selected.has(t.id)}
                    onToggleSelect={() => toggle(selected, t.id, setSelected)}
                    onOpen={() => setOpenId(openId === t.id ? null : t.id)}
                    open={openId === t.id}
                  />
                  {openId === t.id && (
                    <div className="mt-1">
                      <HousekeepingTaskPanel
                        taskId={t.id}
                        status={t.status}
                        roomId={t.roomId}
                        photos={t.photos}
                        reviewNote={t.reviewNote}
                        caps={{ submit: caps.submit, review: caps.review }}
                        onDone={() => { setOpenId(null); router.refresh(); }}
                      />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type-check.**
```bash
npx tsc --noEmit
```
Expected: errors only about `HousekeepingBoard`/pages not yet wired (the pages come in Task 6). Confirm no errors inside the three component files themselves.

- [ ] **Step 5: Ready to commit** (user runs):
```bash
git add roomstatus-main/src/components/HousekeepingRoomCard.tsx roomstatus-main/src/components/HousekeepingTaskPanel.tsx roomstatus-main/src/components/HousekeepingBoard.tsx
git commit -m "feat(hk): board, room card, and task panel components"
```

---

## Task 5: Settings form component

**Files:**
- Create: `src/components/HousekeepingSettingsForm.tsx`

**Interfaces:**
- Consumes: `updateHousekeepingSettings` (Task 3).
- Produces: `<HousekeepingSettingsForm initial={{ deleteOnApproval: boolean; retentionDays: number; instructions: string }} />`

- [ ] **Step 1: Create `src/components/HousekeepingSettingsForm.tsx`:**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { updateHousekeepingSettings } from "@/lib/actions/housekeeping";

type Props = {
  initial: { deleteOnApproval: boolean; retentionDays: number; instructions: string };
};

export function HousekeepingSettingsForm({ initial }: Props) {
  const [deleteOnApproval, setDeleteOnApproval] = useState(initial.deleteOnApproval);
  const [retentionDays, setRetentionDays] = useState(String(initial.retentionDays));
  const [instructions, setInstructions] = useState(initial.instructions);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null); setMsg(null);
    start(async () => {
      const res = await updateHousekeepingSettings({
        deleteOnApproval,
        retentionDays: parseInt(retentionDays, 10) || 7,
        instructions,
      });
      if (!res.ok) { setError(res.error); return; }
      setMsg("Saved.");
    });
  }

  return (
    <div className="card space-y-4 p-5">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={deleteOnApproval} onChange={(e) => setDeleteOnApproval(e.target.checked)} className="h-4 w-4" />
        Delete a room&rsquo;s photos as soon as it&rsquo;s approved (Ready to Rent)
      </label>

      <div>
        <label className="label">Delete photos older than (days)</label>
        <input type="number" min={1} max={365} className="input w-32" value={retentionDays}
          onChange={(e) => setRetentionDays(e.target.value)} />
        <p className="mt-1 text-xs text-slate-500">Safety sweep: photos past this age are removed daily to keep storage free.</p>
      </div>

      <div>
        <label className="label">Cleaning instructions (shown to housekeepers)</label>
        <textarea className="input min-h-[80px] text-sm" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}

      <button type="button" onClick={save} disabled={pending} className="btn-primary">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save settings
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check** (`npx tsc --noEmit`) — clean within this file.

- [ ] **Step 3: Ready to commit** (user runs):
```bash
git add roomstatus-main/src/components/HousekeepingSettingsForm.tsx
git commit -m "feat(hk): settings form component"
```

---

## Task 6: Pages + service card

**Files:**
- Create: `src/app/(app)/services/housekeeping/page.tsx`
- Create: `src/app/(app)/services/housekeeping/settings/page.tsx`
- Modify: `src/app/(app)/services/page.tsx`

**Interfaces:**
- Consumes: `HousekeepingBoard`, `HkTaskView`, `HkRoomOption` (Task 4); `HousekeepingSettingsForm` (Task 5); role helpers (Task 2); `getSignedUrl` from `@/lib/storage`.

- [ ] **Step 1: Create the board page** at `src/app/(app)/services/housekeeping/page.tsx`:

```tsx
import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getSignedUrl } from "@/lib/storage";
import {
  canAccessHousekeeping, canCheckOut, canSubmitCleaning, canReviewCleaning, canConfigureHousekeeping,
  type HkStatus,
} from "@/lib/housekeeping";
import { redirect } from "next/navigation";
import { HousekeepingBoard, type HkTaskView, type HkRoomOption } from "@/components/HousekeepingBoard";

export const dynamic = "force-dynamic";

export default async function HousekeepingPage() {
  const user = await requireUser();
  if (!canAccessHousekeeping(user.role)) redirect("/services");

  const [tasks, rooms, setting] = await Promise.all([
    prisma.housekeepingTask.findMany({
      where: { status: { in: ["READY_TO_CLEAN", "READY_FOR_INSPECTION", "READY_TO_RENT"] } },
      orderBy: { updatedAt: "desc" },
      include: {
        room: { select: { number: true, name: true } },
        submittedBy: { select: { name: true } },
        photos: { select: { id: true, storagePath: true } },
      },
    }),
    prisma.room.findMany({ where: { archived: false }, orderBy: { number: "asc" }, select: { id: true, number: true, name: true } }),
    prisma.housekeepingSetting.findUnique({ where: { id: "singleton" } }),
  ]);

  // Rooms available to check out = no open task
  const openRoomIds = new Set(
    tasks.filter((t) => t.status !== "READY_TO_RENT").map((t) => t.roomId),
  );
  const checkoutableRooms: HkRoomOption[] = rooms
    .filter((r) => !openRoomIds.has(r.id))
    .map((r) => ({ id: r.id, number: r.number, name: r.name }));

  const taskViews: HkTaskView[] = await Promise.all(
    tasks.map(async (t) => ({
      id: t.id,
      status: t.status as HkStatus,
      roomId: t.roomId,
      roomNumber: t.room.number,
      roomName: t.room.name,
      submittedBy: t.submittedBy?.name ?? null,
      reviewNote: t.reviewNote,
      submittedAt: t.submittedAt ? t.submittedAt.toISOString() : null,
      photos: await Promise.all(
        t.photos.map(async (p) => ({ id: p.id, url: await getSignedUrl(p.storagePath, 3600) })),
      ),
    })),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/services" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to services
        </Link>
        {canConfigureHousekeeping(user.role) && (
          <Link href="/services/housekeeping/settings" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
            <Settings className="h-4 w-4" /> Settings
          </Link>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Housekeeping</h1>
        <p className="text-sm text-slate-500">Clean → submit for inspection → approve or send back.</p>
      </div>

      {setting?.instructions && (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{setting.instructions}</p>
      )}

      <HousekeepingBoard
        tasks={taskViews}
        checkoutableRooms={checkoutableRooms}
        caps={{
          checkout: canCheckOut(user.role),
          submit: canSubmitCleaning(user.role),
          review: canReviewCleaning(user.role),
          admin: canConfigureHousekeeping(user.role),
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the settings page** at `src/app/(app)/services/housekeeping/settings/page.tsx`:

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canConfigureHousekeeping } from "@/lib/housekeeping";
import { HousekeepingSettingsForm } from "@/components/HousekeepingSettingsForm";

export const dynamic = "force-dynamic";

export default async function HousekeepingSettingsPage() {
  const user = await requireUser();
  if (!canConfigureHousekeeping(user.role)) redirect("/services/housekeeping");

  const setting = await prisma.housekeepingSetting.findUnique({ where: { id: "singleton" } });

  return (
    <div className="space-y-5">
      <Link href="/services/housekeeping" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Back to Housekeeping
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Housekeeping — Settings</h1>
        <p className="text-sm text-slate-500">Photo retention and cleaning instructions.</p>
      </div>
      <HousekeepingSettingsForm
        initial={{
          deleteOnApproval: setting?.deleteOnApproval ?? true,
          retentionDays: setting?.retentionDays ?? 7,
          instructions: setting?.instructions ?? "",
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Add the Housekeeping card to `src/app/(app)/services/page.tsx`.** Import the helper and render a card for users who can access HK. Add near the top imports:

```ts
import { canAccessHousekeeping } from "@/lib/housekeeping";
```

Then, inside the component after computing `admin`, add a `<ServiceCard>` for HK in the grid (alongside the PM + workflow cards). Use the existing `ServiceCard` component in that file:

```tsx
{canAccessHousekeeping(user.role) && (
  <ServiceCard
    href="/services/housekeeping"
    icon={<SprayCan className="h-5 w-5" />}
    name="Housekeeping"
    description="Clean rooms, upload photos, and get them inspected and approved for rent."
    settingsHref={admin ? "/services/housekeeping/settings" : undefined}
    statusLine="Room cleaning workflow"
  />
)}
```

Add `SprayCan` to the lucide-react import at the top of that file (e.g. `import { ChevronRight, ClipboardList, LayoutGrid, Settings, User2, SprayCan } from "lucide-react";`).

- [ ] **Step 4: Type-check + local run.**
```bash
npx tsc --noEmit
```
Expected: clean. Then start dev (`npm run dev` with Docker DB up) and verify `/services/housekeeping` renders (empty board) and `/services/housekeeping/settings` renders.

- [ ] **Step 5: Ready to commit** (user runs):
```bash
git add roomstatus-main/src/app/\(app\)/services/housekeeping roomstatus-main/src/app/\(app\)/services/page.tsx
git commit -m "feat(hk): board + settings pages and services catalog card"
```

---

## Task 7: Retention cron sweep

**Files:**
- Create: `src/app/api/cron/housekeeping-cleanup/route.ts`
- Create: `vercel.json`

**Interfaces:**
- Consumes: `sweepExpiredHousekeepingPhotos` (Task 3). Requires env var `CRON_SECRET`.

- [ ] **Step 1: Create the cron route** at `src/app/api/cron/housekeeping-cleanup/route.ts`:

```ts
import { NextResponse } from "next/server";
import { sweepExpiredHousekeepingPhotos } from "@/lib/actions/housekeeping";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { deleted } = await sweepExpiredHousekeepingPhotos();
  return NextResponse.json({ ok: true, deleted });
}
```

- [ ] **Step 2: Create `vercel.json`** at the repo-root of the app (`roomstatus-main/vercel.json`):

```json
{
  "crons": [
    { "path": "/api/cron/housekeeping-cleanup", "schedule": "0 3 * * *" }
  ]
}
```

- [ ] **Step 3: Document the env var.** In `DEPLOYMENT.md` add `CRON_SECRET` to the env-var table (a random string). Note: Vercel automatically sends `Authorization: Bearer $CRON_SECRET` to cron routes when `CRON_SECRET` is set in project env vars.

- [ ] **Step 4: Type-check + local test.**
```bash
npx tsc --noEmit
```
Local test (set a temp secret in `.env.local` as `CRON_SECRET=devsecret`, restart dev):
```bash
curl -s -H "Authorization: Bearer devsecret" http://localhost:3000/api/cron/housekeeping-cleanup
```
Expected: `{"ok":true,"deleted":0}` (0 with no expired photos). Without the header → 401.

- [ ] **Step 5: Ready to commit** (user runs):
```bash
git add roomstatus-main/src/app/api/cron/housekeeping-cleanup/route.ts roomstatus-main/vercel.json roomstatus-main/DEPLOYMENT.md
git commit -m "feat(hk): daily retention cron sweep + vercel cron config"
```

---

## Task 8: Docs + final verification

**Files:**
- Create: `docs/features/housekeeping.md`
- Modify: `docs/features/README.md`, `docs/data-model.md`, `docs/architecture.md`

- [ ] **Step 1: Write `docs/features/housekeeping.md`** using the `_template.md` structure: purpose, the 3-state lifecycle, roles table (Housekeeper/Inspector/Manager/Admin), routes (`/services/housekeeping`, `/settings`), data-model touchpoints (the 3 new tables), key files (actions + components + cron), behavior notes (state machine, one-open-task-per-room, bulk ops, retention/delete-on-approval + sweep, storage path), auth gates, storage section, out-of-scope (the deferred advanced layer), change log.

- [ ] **Step 2: Update `docs/features/README.md`** — add a row under "In development" → move to "Shipped" when deployed:
```
| Housekeeping | [housekeeping.md](housekeeping.md) | Built on `HK` — status lifecycle, photo evidence, inspector review, editable retention |
```

- [ ] **Step 3: Update `docs/data-model.md`** — add the three new models (fields, relations, cascade: `HousekeepingTask`→`HousekeepingPhoto` cascade; Room/User RESTRICT/SET NULL as in the migration).

- [ ] **Step 4: Update `docs/architecture.md`** — add a short "Scheduled cleanup (cron)" note describing the retention sweep + `CRON_SECRET`, and that HK is a built-in service (role logic in `housekeeping.ts`, not a WorkflowDefinition).

- [ ] **Step 5: Full type-check + manual smoke test** against Docker DB (dev server running). Walk §12 of the spec:
  1. Manager: bulk check out rooms → appear under Ready to Clean; rooms with open tasks skipped.
  2. Housekeeper: open a room, add photos, submit → moves to Ready for Inspection; blocked with no photo.
  3. Inspector: open, view photos, Approve → Ready to Rent (+ photos deleted if delete-on-approval); Reject w/o note blocked; with note → back to Ready to Clean, note shown.
  4. Bulk approve/reject.
  5. Admin: settings edit persists; toggle delete-on-approval.
  6. Cron route: 200 with secret, 401 without.
  7. Role gating: housekeeper can't approve; inspector can't check out; non-admin can't open settings.
```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 6: Ready to commit** (user runs):
```bash
git add roomstatus-main/docs
git commit -m "docs(hk): feature doc + data-model + architecture + README updates"
```

---

## Migration (production — separate Supabase chat)

After the code is committed and before/at deploy, in a **Supabase-management chat**:
1. Apply `prisma/manual-migrations/2026-07-14-add-housekeeping-tables.sql` via `apply_migration`.
2. Confirm the `HousekeepingSetting` singleton row exists (the SQL inserts it).
3. Verify `list_tables` shows the 3 new tables.
4. Add `CRON_SECRET` (random string) to Vercel env vars.
5. Push `HK` → merge to `main` → Vercel deploys (cron auto-registers from `vercel.json`).

## What's deliberately deferred (spec §15)

Required-photo checklists, per-room housekeeper assignment + "my rooms", cleaning templates, SLA/overdue timers, per-room status timeline, Google Drive archive, booking/checkout integration, notifications, CSV export. Each is its own future spec.
