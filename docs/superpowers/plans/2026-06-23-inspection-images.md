# Inspection Photo Evidence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-item photo evidence to inspections (upload, view, admin-delete) and migrate the database from Neon Postgres to Supabase Postgres so Supabase Storage can host the photos.

**Architecture:** Photos live in a private Supabase Storage bucket (`inspection-photos`); paths are stored in a new `InspectionItemImage` table linked to `InspectionItem`. Uploads happen *before* the DB transaction in the `saveInspection` server action, with rollback on DB failure. Display uses 1-hour signed URLs generated server-side. Admin-only delete is exposed in a lightbox modal.

**Tech Stack:** Next.js 14 App Router, Prisma 5, NextAuth 4, Supabase Storage (`@supabase/supabase-js` v2), `cuid` for upfront ID generation, Tailwind, lucide-react icons. No automated test framework — feature is validated against the manual checklist in §12 of [the design spec](../specs/2026-06-23-inspection-images-design.md).

**Reference spec:** [`docs/superpowers/specs/2026-06-23-inspection-images-design.md`](../specs/2026-06-23-inspection-images-design.md). When in doubt about a decision, the spec wins.

---

## File map (what gets touched)

**New files:**
- `src/lib/storage.ts` — Supabase Storage wrapper (`uploadImage`, `getSignedUrl`, `deleteImages`)
- `src/lib/actions/photos.ts` — `deletePhoto` + `deleteInspection` server actions
- `src/components/PhotoPicker.tsx` — per-item file input + thumbnail strip (client)
- `src/components/PhotoLightbox.tsx` — fullscreen modal viewer with admin delete (client)

**Modified files:**
- `prisma/schema.prisma` — adds `InspectionItemImage` model
- `src/lib/audit.ts` — extends `action` and `entity` typed unions
- `src/lib/actions/inspections.ts` — accepts `FormData`, uploads to Storage, wraps DB writes in `$transaction`
- `src/components/InspectForm.tsx` — embeds `<PhotoPicker />` per item; submits as `FormData`
- `src/components/InspectionHistory.tsx` — renders thumbnail strip; opens `<PhotoLightbox />` on click
- `src/app/(app)/rooms/[id]/page.tsx` — extends Prisma include with `images`; generates signed URLs server-side; passes `isAdmin` flag
- `package.json` — adds `@supabase/supabase-js` and `cuid`
- `DEPLOYMENT.md` — documents new env vars and bucket creation

---

## Phase A — Supabase migration (precondition)

The app is currently on Neon Postgres (per the deployment we just did). Photos require Supabase Storage. Postgres lives next to Storage in a Supabase project, so we move the database too.

### Task A1: Create Supabase project and storage bucket

**Files:** None (operational task in the Supabase dashboard).

- [ ] **Step 1: Create the Supabase project.**

Open https://supabase.com and sign in. Click **New project**. Pick:
- **Name:** `divya-motel` (or your preference)
- **Region:** closest to where staff use the app (typically same region you picked for Neon)
- **Database password:** generate and save in your password manager
- **Plan:** Free

Wait ~2 minutes for provisioning.

- [ ] **Step 2: Capture the Postgres connection string.**

In the Supabase dashboard: **Project Settings → Database → Connection string → Transaction pooler** (the one with `pooler.supabase.com` in the host).

Looks like:
```
postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
```

Save this. Below it will be referenced as `$SUPABASE_DB_URL`.

- [ ] **Step 3: Capture the Supabase URL and service-role key.**

In the dashboard: **Project Settings → API**.

Copy two values:
- **Project URL** (e.g. `https://abcxyz123.supabase.co`) — this is `$SUPABASE_URL`
- **service_role secret key** (under "Project API keys", not the anon key) — this is `$SUPABASE_SERVICE_ROLE_KEY`

> Important: the **service_role** key bypasses Row-Level Security and must never be exposed to a browser. We only use it server-side.

- [ ] **Step 4: Create the storage bucket.**

In the Supabase dashboard sidebar: **Storage → New bucket**.
- **Name:** `inspection-photos`
- **Public bucket:** OFF (leave it private)
- Click **Save**.

No public read policy needed — we'll only read via signed URLs generated server-side.

- [ ] **Step 5: Save credentials for Vercel update later.**

Open a scratch file (do not commit). Record:
```
SUPABASE_URL=<from step 3>
SUPABASE_SERVICE_ROLE_KEY=<from step 3>
SUPABASE_DB_URL=<from step 2>
```

You'll paste these into Vercel in Task A3.

---

### Task A2: Move data from Neon to Supabase

**Files:** None (operational; uses your local terminal).

Two paths depending on whether `pg_dump`/`psql` are installed locally on your Windows machine.

**Path 1 — `pg_dump`/`psql` available (preferred):**

- [ ] **Step 1: Check tools.**

PowerShell:
```powershell
pg_dump --version
psql --version
```

If both print versions, continue. If "not recognized", jump to Path 2.

- [ ] **Step 2: Dump Neon to a SQL file.**

PowerShell:
```powershell
$env:NEON_URL = "paste-your-Neon-pooled-URL-here"
pg_dump $env:NEON_URL --no-owner --no-acl > backup.sql
```

The file `backup.sql` lands in your current directory. Should be tens of KB given a fresh seeded database.

- [ ] **Step 3: Restore into Supabase.**

PowerShell:
```powershell
$env:SUPABASE_DB_URL = "paste-Supabase-pooler-URL-here"
psql $env:SUPABASE_DB_URL -f backup.sql
```

Watch for errors. Expected to print `CREATE TABLE`, `CREATE INDEX` etc., then `COPY <table>` lines.

- [ ] **Step 4: Verify row counts match.**

PowerShell:
```powershell
psql $env:NEON_URL -c "SELECT 'User' AS t, COUNT(*) FROM \"User\" UNION ALL SELECT 'Room', COUNT(*) FROM \"Room\" UNION ALL SELECT 'Section', COUNT(*) FROM \"Section\" UNION ALL SELECT 'Question', COUNT(*) FROM \"Question\" UNION ALL SELECT 'Inspection', COUNT(*) FROM \"Inspection\" UNION ALL SELECT 'InspectionItem', COUNT(*) FROM \"InspectionItem\" UNION ALL SELECT 'AuditLog', COUNT(*) FROM \"AuditLog\";"
psql $env:SUPABASE_DB_URL -c "SELECT 'User' AS t, COUNT(*) FROM \"User\" UNION ALL SELECT 'Room', COUNT(*) FROM \"Room\" UNION ALL SELECT 'Section', COUNT(*) FROM \"Section\" UNION ALL SELECT 'Question', COUNT(*) FROM \"Question\" UNION ALL SELECT 'Inspection', COUNT(*) FROM \"Inspection\" UNION ALL SELECT 'InspectionItem', COUNT(*) FROM \"InspectionItem\" UNION ALL SELECT 'AuditLog', COUNT(*) FROM \"AuditLog\";"
```

Counts must match exactly. If they don't, STOP and investigate before continuing.

- [ ] **Step 5: Clean up local artifact.**

PowerShell:
```powershell
Remove-Item backup.sql
Remove-Item Env:NEON_URL
```

Skip ahead to **Task A3**.

**Path 2 — `pg_dump`/`psql` not installed (fallback):**

- [ ] **Step 1: Install Postgres client tools or use Docker.**

Easiest: install PostgreSQL 16 from https://www.postgresql.org/download/windows/. During install, ensure "Command Line Tools" is checked. Then restart your terminal and verify `pg_dump --version`.

Alternative: use Docker:
```bash
docker run --rm postgres:16 pg_dump "$NEON_URL" --no-owner --no-acl > backup.sql
```

Once installed, return to Path 1 from Step 2.

---

### Task A3: Swap Vercel env vars and verify the app still works on Supabase

**Files:** None (operational, uses Vercel dashboard).

- [ ] **Step 1: Update `DATABASE_URL` in Vercel.**

https://vercel.com → your project → **Settings → Environment Variables**.
- Edit `DATABASE_URL`. Replace with `$SUPABASE_DB_URL`.
- Save.

- [ ] **Step 2: Add new env vars.**

Add these (Production, Preview, and Development scopes all checked):
- `SUPABASE_URL` = `$SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` = `$SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Step 3: Trigger a redeploy.**

**Deployments → … → Redeploy** on the latest deployment. (No code change yet; we just need the new env vars in the runtime.)

- [ ] **Step 4: Smoke test on Supabase data.**

Open the production URL. Sign in. Verify:
- Dashboard shows the same rooms as before.
- Run one new inspection (no photos yet — the feature isn't built yet).
- Confirm it saves and shows up in history.

If anything fails, check Vercel function logs.

- [ ] **Step 5: Pause Neon.**

Once you've confirmed Supabase is serving everything correctly: in the Neon dashboard, **suspend** the project (don't delete yet — keep it as a safety net for 7 days).

---

### Task A4: Install new dependencies and update local env

**Files:** `package.json`, local `.env`.

- [ ] **Step 1: Install `@supabase/supabase-js` and `cuid`.**

PowerShell, in the project root:
```powershell
npm install @supabase/supabase-js cuid
npm install --save-dev @types/cuid
```

Confirm `package.json` now lists:
```json
"dependencies": {
  "@prisma/client": "5.22.0",
  "@supabase/supabase-js": "^2.45.0",
  "bcryptjs": "2.4.3",
  "clsx": "2.1.1",
  "cuid": "^3.0.0",
  "lucide-react": "0.456.0",
  ...
}
```

(Exact versions may differ; use whatever `npm install` installs.)

- [ ] **Step 2: Update local `.env`.**

If you have a local `.env` for development, add:
```
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres"
SUPABASE_URL="https://abcxyz123.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGc..."
```

Use the **same values** as Vercel (you're now developing against the live Supabase DB unless you want a separate dev project).

- [ ] **Step 3: Commit.**

```powershell
git add package.json package-lock.json
git commit -m "chore: add @supabase/supabase-js and cuid dependencies"
```

---

## Phase B — Database + storage foundation

### Task B1: Add the `InspectionItemImage` model to Prisma schema

**Files:** Modify `prisma/schema.prisma`.

- [ ] **Step 1: Add the new model and the back-relation.**

Open `prisma/schema.prisma`. After the existing `InspectionItem` model, add:

```prisma
model InspectionItemImage {
  id               String         @id @default(cuid())
  inspectionItemId String
  inspectionItem   InspectionItem @relation(fields: [inspectionItemId], references: [id], onDelete: Cascade)

  storagePath      String
  width            Int?
  height           Int?
  bytes            Int?
  createdAt        DateTime       @default(now())

  @@index([inspectionItemId])
}
```

Then in the existing `InspectionItem` model, add one line below the existing `note   String?`:

```prisma
  images InspectionItemImage[]
```

- [ ] **Step 2: Run the migration.**

PowerShell:
```powershell
npx prisma migrate dev --name add_inspection_item_images
```

Expected output ends with `Your database is now in sync with your schema.` and a new `prisma/migrations/<timestamp>_add_inspection_item_images/` directory appears.

- [ ] **Step 3: Verify in Supabase.**

In the Supabase dashboard: **Table Editor**. Confirm an `InspectionItemImage` table exists with the columns shown above.

- [ ] **Step 4: Commit.**

```powershell
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add InspectionItemImage model"
```

---

### Task B2: Create the Supabase Storage wrapper

**Files:** Create `src/lib/storage.ts`.

- [ ] **Step 1: Write the storage wrapper.**

Create `src/lib/storage.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment.",
  );
}

const BUCKET = "inspection-photos";

// Server-only client. Never import this file from a "use client" component.
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function uploadImage(
  path: string,
  file: File | Buffer,
  contentType: string,
) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`Upload failed for ${path}: ${error.message}`);
}

export async function getSignedUrl(path: string, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(`Could not sign ${path}: ${error?.message ?? "no URL"}`);
  }
  return data.signedUrl;
}

export async function deleteImages(paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) {
    // Best-effort. Log but do not throw — storage orphans are recoverable;
    // a thrown error here would block the DB cleanup the caller needs.
    console.error("Storage delete failed:", error.message, paths);
  }
}
```

- [ ] **Step 2: Verify it compiles.**

PowerShell:
```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit.**

```powershell
git add src/lib/storage.ts
git commit -m "feat(storage): add Supabase Storage wrapper"
```

---

## Phase C — Server-side logic

### Task C1: Extend the `AuditLog` typed unions

**Files:** Modify `src/lib/audit.ts`.

- [ ] **Step 1: Add `DELETE` to actions and `InspectionItemImage` to entities.**

Open `src/lib/audit.ts`. Change the `AuditInput` type definition:

```ts
type AuditInput = {
  userId?: string | null;
  action: "CREATE" | "UPDATE" | "DELETE" | "ARCHIVE" | "RESTORE" | "LOGIN";
  entity: "Room" | "Question" | "Section" | "User" | "Inspection" | "InspectionItemImage";
  entityId?: string | null;
  details?: Record<string, unknown> | string | null;
};
```

Everything else in this file stays the same.

- [ ] **Step 2: Verify it still type-checks.**

PowerShell:
```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit.**

```powershell
git add src/lib/audit.ts
git commit -m "feat(audit): extend action/entity unions for DELETE and InspectionItemImage"
```

---

### Task C2: Refactor `saveInspection` to handle uploads

**Files:** Modify `src/lib/actions/inspections.ts`.

This is the biggest task. Read the whole task before starting.

- [ ] **Step 1: Replace the file contents.**

Open `src/lib/actions/inspections.ts` and replace its entire contents with:

```ts
"use server";

import cuid from "cuid";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { summaryFromItems } from "@/lib/status";
import { uploadImage, deleteImages } from "@/lib/storage";

const responseSchema = z.object({
  questionId: z.string().min(1),
  status: z.enum(["OK", "NEEDS_REPAIR", "REPAIR_COMPLETED", "NA"]),
  note: z.string().trim().max(500).optional().nullable(),
});

const inspectionSchema = z.object({
  roomId: z.string().min(1),
  notes: z.string().trim().max(1000).optional().nullable(),
  responses: z.array(responseSchema).min(1),
});

type SaveInspectionResult =
  | { ok: true; inspectionId: string }
  | { ok: false; error: string };

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  return "bin";
}

export async function saveInspection(form: FormData): Promise<SaveInspectionResult> {
  const user = await requireUser();

  // --- 1. Parse and validate the JSON payload ---
  const payloadRaw = form.get("payload");
  if (typeof payloadRaw !== "string") {
    return { ok: false, error: "Missing payload." };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return { ok: false, error: "Payload is not valid JSON." };
  }
  const parsed = inspectionSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "Invalid inspection data." };
  }
  const { roomId, notes, responses } = parsed.data;

  // --- 2. Confirm the room exists ---
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return { ok: false, error: "Room not found." };

  // --- 3. Snapshot question text/section at inspection time ---
  const questions = await prisma.question.findMany({
    where: { id: { in: responses.map((r) => r.questionId) } },
    include: { section: true },
  });
  const qmap = new Map(questions.map((q) => [q.id, q]));

  const summary = summaryFromItems(responses.map((r) => r.status));

  // --- 4. Generate IDs up-front so storage paths are deterministic ---
  const inspectionId = cuid();
  const itemIds = new Map<string, string>();
  for (const r of responses) {
    itemIds.set(r.questionId, cuid());
  }

  // --- 5. Group photo files from FormData by question ID ---
  type StagedImage = { questionId: string; itemId: string; file: File; storagePath: string };
  const staged: StagedImage[] = [];

  for (const [key, value] of form.entries()) {
    if (!key.startsWith("image-")) continue;
    if (!(value instanceof File)) continue;
    // key format: image-<questionId>-<index>
    const m = key.match(/^image-(.+)-(\d+)$/);
    if (!m) continue;
    const questionId = m[1];
    if (!itemIds.has(questionId)) {
      return { ok: false, error: `Photo refers to unknown question ${questionId}.` };
    }
    if (!value.type.startsWith("image/")) {
      return { ok: false, error: `Rejected non-image file: ${value.name}` };
    }
    if (value.size > MAX_FILE_BYTES) {
      return { ok: false, error: `File ${value.name} exceeds 10 MB.` };
    }
    const itemId = itemIds.get(questionId)!;
    const ext = extFromMime(value.type);
    const storagePath = `inspections/${inspectionId}/${itemId}/${cuid()}.${ext}`;
    staged.push({ questionId, itemId, file: value, storagePath });
  }

  // --- 6. Upload all staged photos to Storage. Track for rollback. ---
  const uploadedPaths: string[] = [];
  try {
    for (const img of staged) {
      await uploadImage(img.storagePath, img.file, img.file.type);
      uploadedPaths.push(img.storagePath);
    }
  } catch (e) {
    await deleteImages(uploadedPaths);
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }

  // --- 7. Write Inspection + Items + ImageRows in one transaction ---
  try {
    const stagedByItem = new Map<string, StagedImage[]>();
    for (const img of staged) {
      const arr = stagedByItem.get(img.itemId) ?? [];
      arr.push(img);
      stagedByItem.set(img.itemId, arr);
    }

    await prisma.$transaction(async (tx) => {
      await tx.inspection.create({
        data: {
          id: inspectionId,
          roomId,
          inspectorId: user.id,
          status: "COMPLETED",
          summary,
          notes: notes || null,
          completedAt: new Date(),
          items: {
            create: responses.map((r) => {
              const q = qmap.get(r.questionId);
              const itemId = itemIds.get(r.questionId)!;
              const itemImages = stagedByItem.get(itemId) ?? [];
              return {
                id: itemId,
                questionId: r.questionId,
                questionText: q?.text ?? "(deleted question)",
                sectionName: q?.section.name ?? "—",
                status: r.status,
                note: r.note || null,
                images: {
                  create: itemImages.map((img) => ({
                    storagePath: img.storagePath,
                    bytes: img.file.size,
                  })),
                },
              };
            }),
          },
        },
      });
    });
  } catch (e) {
    await deleteImages(uploadedPaths);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not save inspection.",
    };
  }

  // --- 8. Audit + revalidate ---
  await logAudit({
    userId: user.id,
    action: "CREATE",
    entity: "Inspection",
    entityId: inspectionId,
    details: { roomNumber: room.number, summary, photoCount: uploadedPaths.length },
  });

  revalidatePath("/dashboard");
  revalidatePath("/rooms");
  revalidatePath(`/rooms/${roomId}`);
  return { ok: true, inspectionId };
}
```

- [ ] **Step 2: Verify it compiles.**

PowerShell:
```powershell
npx tsc --noEmit
```

Expected: no errors. (The InspectForm still calls the old signature — it'll be updated in Task D2. For now we just confirm `saveInspection` itself type-checks.)

- [ ] **Step 3: Commit.**

```powershell
git add src/lib/actions/inspections.ts
git commit -m "feat(inspections): accept FormData with photos; upload-then-transact"
```

---

### Task C3: Add `deletePhoto` and `deleteInspection` server actions

**Files:** Create `src/lib/actions/photos.ts`.

- [ ] **Step 1: Write the file.**

Create `src/lib/actions/photos.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { deleteImages } from "@/lib/storage";

type Result = { ok: true } | { ok: false; error: string };

export async function deletePhoto(imageId: string): Promise<Result> {
  const admin = await requireAdmin();

  const image = await prisma.inspectionItemImage.findUnique({
    where: { id: imageId },
    include: {
      inspectionItem: {
        include: { inspection: { select: { roomId: true } } },
      },
    },
  });
  if (!image) return { ok: false, error: "Photo not found." };

  await deleteImages([image.storagePath]);

  try {
    await prisma.inspectionItemImage.delete({ where: { id: imageId } });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not delete photo row.",
    };
  }

  await logAudit({
    userId: admin.id,
    action: "DELETE",
    entity: "InspectionItemImage",
    entityId: imageId,
    details: {
      storagePath: image.storagePath,
      inspectionItemId: image.inspectionItemId,
    },
  });

  revalidatePath(`/rooms/${image.inspectionItem.inspection.roomId}`);
  return { ok: true };
}

export async function deleteInspection(inspectionId: string): Promise<Result> {
  const admin = await requireAdmin();

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: {
      room: { select: { number: true } },
      items: { include: { images: { select: { storagePath: true } } } },
    },
  });
  if (!inspection) return { ok: false, error: "Inspection not found." };

  const paths = inspection.items.flatMap((it) => it.images.map((img) => img.storagePath));
  await deleteImages(paths);

  try {
    await prisma.inspection.delete({ where: { id: inspectionId } });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not delete inspection.",
    };
  }

  await logAudit({
    userId: admin.id,
    action: "DELETE",
    entity: "Inspection",
    entityId: inspectionId,
    details: { roomNumber: inspection.room.number, photosDeleted: paths.length },
  });

  revalidatePath("/dashboard");
  revalidatePath("/rooms");
  revalidatePath(`/rooms/${inspection.roomId}`);
  return { ok: true };
}
```

- [ ] **Step 2: Verify it compiles.**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit.**

```powershell
git add src/lib/actions/photos.ts
git commit -m "feat(photos): add deletePhoto and deleteInspection server actions"
```

---

## Phase D — Client components

### Task D1: Build the `PhotoPicker` component

**Files:** Create `src/components/PhotoPicker.tsx`.

- [ ] **Step 1: Write the component.**

Create `src/components/PhotoPicker.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X, AlertTriangle } from "lucide-react";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SOFT_WARN_AT = 20;

type Props = {
  questionId: string;
  files: File[];
  onChange: (files: File[]) => void;
};

export function PhotoPicker({ questionId, files, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Generate / revoke object URLs in step with files.
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;

    const accepted: File[] = [];
    for (const f of picked) {
      if (!f.type.startsWith("image/")) {
        setError(`Skipped ${f.name}: not an image.`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        setError(`Skipped ${f.name}: over 10 MB.`);
        continue;
      }
      accepted.push(f);
    }
    onChange([...files, ...accepted]);
    e.target.value = ""; // allow re-picking the same file
  }

  function remove(index: number) {
    const next = files.slice();
    next.splice(index, 1);
    onChange(next);
  }

  const showSoftWarning = files.length >= SOFT_WARN_AT;

  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {previews.map((url, i) => (
          <div key={url} className="relative h-12 w-12 overflow-hidden rounded-md border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl bg-black/60 text-white hover:bg-black/80"
              aria-label="Remove photo"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700"
          aria-label={`Add photo to ${questionId}`}
        >
          <Camera className="h-4 w-4" />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={handlePick}
        />
        {files.length > 0 && (
          <span className="text-xs text-slate-500">{files.length} photo{files.length === 1 ? "" : "s"}</span>
        )}
      </div>
      {showSoftWarning && (
        <p className="inline-flex items-center gap-1 text-xs text-amber-700">
          <AlertTriangle className="h-3 w-3" />
          That's a lot of photos for one item. Sure?
        </p>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles.**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit.**

```powershell
git add src/components/PhotoPicker.tsx
git commit -m "feat(photos): add PhotoPicker client component"
```

---

### Task D2: Wire `PhotoPicker` into `InspectForm` and change submit to `FormData`

**Files:** Modify `src/components/InspectForm.tsx`.

- [ ] **Step 1: Replace `InspectForm.tsx` contents.**

Open `src/components/InspectForm.tsx` and replace its entire contents with:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2, MessageSquarePlus, Save } from "lucide-react";
import { saveInspection } from "@/lib/actions/inspections";
import { ITEM_STATUS_META, type ItemStatus } from "@/lib/status";
import { PhotoPicker } from "@/components/PhotoPicker";

type Question = { id: string; text: string };
type Section = { id: string; name: string; questions: Question[] };

const CHOICES: ItemStatus[] = ["OK", "NEEDS_REPAIR", "REPAIR_COMPLETED", "NA"];

export function InspectForm({
  roomId,
  roomNumber,
  sections,
}: {
  roomId: string;
  roomNumber: string;
  sections: Section[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const allQuestions = useMemo(
    () => sections.flatMap((s) => s.questions),
    [sections],
  );

  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>(() =>
    Object.fromEntries(allQuestions.map((q) => [q.id, "OK" as ItemStatus])),
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [openNote, setOpenNote] = useState<Record<string, boolean>>({});
  const [generalNotes, setGeneralNotes] = useState("");
  const [photos, setPhotos] = useState<Record<string, File[]>>({});

  const counts = useMemo(() => {
    const c = { OK: 0, NEEDS_REPAIR: 0, REPAIR_COMPLETED: 0, NA: 0 } as Record<ItemStatus, number>;
    for (const q of allQuestions) c[statuses[q.id]]++;
    return c;
  }, [statuses, allQuestions]);

  const totalPhotos = useMemo(
    () => Object.values(photos).reduce((n, arr) => n + arr.length, 0),
    [photos],
  );

  function setStatus(id: string, status: ItemStatus) {
    setStatuses((prev) => ({ ...prev, [id]: status }));
    if (status !== "OK") setOpenNote((p) => ({ ...p, [id]: true }));
  }

  function submit() {
    setError(null);
    const payload = {
      roomId,
      notes: generalNotes || null,
      responses: allQuestions.map((q) => ({
        questionId: q.id,
        status: statuses[q.id],
        note: notes[q.id] || null,
      })),
    };

    const form = new FormData();
    form.set("payload", JSON.stringify(payload));
    for (const [questionId, files] of Object.entries(photos)) {
      files.forEach((file, i) => {
        form.append(`image-${questionId}-${i}`, file, file.name);
      });
    }

    startTransition(async () => {
      const res = await saveInspection(form);
      if (!res.ok) {
        setError(res.error ?? "Could not save inspection.");
        return;
      }
      router.push(`/rooms/${roomId}?saved=1`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5 pb-28">
      {sections.map((section) => (
        <div key={section.id} className="card overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">
              {section.name}
            </h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {section.questions.map((q) => {
              const current = statuses[q.id];
              const showNote = openNote[q.id];
              return (
                <li key={q.id} className="px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-slate-700">{q.text}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {CHOICES.map((choice) => {
                        const meta = ITEM_STATUS_META[choice];
                        const active = current === choice;
                        return (
                          <button
                            key={choice}
                            type="button"
                            onClick={() => setStatus(q.id, choice)}
                            className={clsx(
                              "rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
                              active
                                ? meta.activeBtn
                                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                            )}
                          >
                            {meta.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {(showNote || notes[q.id]) && (
                    <input
                      type="text"
                      className="input mt-2 text-sm"
                      placeholder="Add a note (optional)…"
                      value={notes[q.id] ?? ""}
                      onChange={(e) =>
                        setNotes((p) => ({ ...p, [q.id]: e.target.value }))
                      }
                    />
                  )}
                  {!showNote && !notes[q.id] && (
                    <button
                      type="button"
                      onClick={() => setOpenNote((p) => ({ ...p, [q.id]: true }))}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      Note
                    </button>
                  )}

                  <PhotoPicker
                    questionId={q.id}
                    files={photos[q.id] ?? []}
                    onChange={(files) =>
                      setPhotos((p) => ({ ...p, [q.id]: files }))
                    }
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="card p-4">
        <label className="label">Overall notes for this inspection</label>
        <textarea
          className="input min-h-[80px]"
          placeholder={`Anything else to record about Room ${roomNumber}…`}
          value={generalNotes}
          onChange={(e) => setGeneralNotes(e.target.value)}
        />
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> {counts.OK} OK
            </span>
            <span className="inline-flex items-center gap-1 text-red-700">
              <span className="h-2 w-2 rounded-full bg-red-500" /> {counts.NEEDS_REPAIR} Repair
            </span>
            <span className="hidden items-center gap-1 text-blue-700 sm:inline-flex">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> {counts.REPAIR_COMPLETED} Fixed
            </span>
            <span className="hidden items-center gap-1 text-slate-500 sm:inline-flex">
              <span className="h-2 w-2 rounded-full bg-slate-300" /> {counts.NA} N/A
            </span>
            {totalPhotos > 0 && (
              <span className="inline-flex items-center gap-1 text-slate-600">
                📷 {totalPhotos}
              </span>
            )}
          </div>
          <button onClick={submit} disabled={pending} className="btn-primary">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {pending ? "Saving…" : "Save inspection"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles.**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit.**

```powershell
git add src/components/InspectForm.tsx
git commit -m "feat(inspect): embed PhotoPicker per item and submit as FormData"
```

---

### Task D3: Build the `PhotoLightbox` component with admin delete

**Files:** Create `src/components/PhotoLightbox.tsx`.

- [ ] **Step 1: Write the component.**

Create `src/components/PhotoLightbox.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { deletePhoto } from "@/lib/actions/photos";

export type LightboxImage = {
  id: string;
  url: string;
  width?: number | null;
  height?: number | null;
};

type Props = {
  images: LightboxImage[];
  startIndex: number;
  isAdmin: boolean;
  onClose: () => void;
  onDeleted: (imageId: string) => void;
};

export function PhotoLightbox({ images, startIndex, isAdmin, onClose, onDeleted }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(images.length - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose]);

  if (images.length === 0) return null;
  const safeIndex = Math.min(index, images.length - 1);
  const current = images[safeIndex];

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deletePhoto(current.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDeleted(current.id);
      setConfirming(false);
      if (images.length <= 1) {
        onClose();
      } else if (safeIndex === images.length - 1) {
        setIndex(safeIndex - 1);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {isAdmin && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          className="absolute left-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-red-600"
          aria-label="Delete photo"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      )}

      {safeIndex > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIndex(safeIndex - 1);
          }}
          className="absolute left-2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
          aria-label="Previous"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {safeIndex < images.length - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIndex(safeIndex + 1);
          }}
          className="absolute right-2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
          aria-label="Next"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      <div
        className="relative max-h-full max-w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt=""
          className="max-h-[90vh] max-w-[90vw] object-contain"
        />
        <p className="mt-2 text-center text-xs text-white/60">
          {safeIndex + 1} of {images.length}
        </p>
      </div>

      {confirming && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/80"
          onClick={(e) => {
            e.stopPropagation();
            if (!pending) setConfirming(false);
          }}
        >
          <div
            className="rounded-xl bg-white p-5 max-w-sm space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-semibold text-slate-900">Delete this photo?</p>
            <p className="text-sm text-slate-600">
              This removes the file from storage and the database. It cannot be undone.
            </p>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {pending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles.**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit.**

```powershell
git add src/components/PhotoLightbox.tsx
git commit -m "feat(photos): add PhotoLightbox with admin delete"
```

---

### Task D4: Update `InspectionHistory` to render thumbnails and open the lightbox

**Files:** Modify `src/components/InspectionHistory.tsx`.

- [ ] **Step 1: Replace `InspectionHistory.tsx` contents.**

Open `src/components/InspectionHistory.tsx` and replace its entire contents with:

```tsx
"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronDown, User2 } from "lucide-react";
import { ItemStatusBadge, RoomStatusBadge } from "@/components/StatusBadge";
import { PhotoLightbox, type LightboxImage } from "@/components/PhotoLightbox";
import { type ItemStatus } from "@/lib/status";

type Image = { id: string; url: string; width: number | null; height: number | null };
type Item = {
  id: string;
  sectionName: string;
  questionText: string;
  status: ItemStatus;
  note: string | null;
  images: Image[];
};
type Inspection = {
  id: string;
  summary: "OK" | "NEEDS_REPAIR";
  notes: string | null;
  completedAt: string | null;
  inspector: string;
  items: Item[];
};

export function InspectionHistory({
  inspections: initial,
  isAdmin,
}: {
  inspections: Inspection[];
  isAdmin: boolean;
}) {
  const [inspections, setInspections] = useState(initial);
  const [open, setOpen] = useState<string | null>(initial[0]?.id ?? null);
  const [lightbox, setLightbox] = useState<{
    images: LightboxImage[];
    startIndex: number;
    inspectionId: string;
    itemId: string;
  } | null>(null);

  if (inspections.length === 0) {
    return (
      <div className="card p-8 text-center text-slate-500">
        No inspections recorded yet.
      </div>
    );
  }

  function openLightbox(inspectionId: string, itemId: string, images: Image[], idx: number) {
    setLightbox({
      images: images.map((img) => ({
        id: img.id,
        url: img.url,
        width: img.width,
        height: img.height,
      })),
      startIndex: idx,
      inspectionId,
      itemId,
    });
  }

  function handleDeleted(imageId: string) {
    setInspections((prev) =>
      prev.map((insp) =>
        insp.id !== lightbox?.inspectionId
          ? insp
          : {
              ...insp,
              items: insp.items.map((it) =>
                it.id !== lightbox.itemId
                  ? it
                  : { ...it, images: it.images.filter((img) => img.id !== imageId) },
              ),
            },
      ),
    );
    setLightbox((lb) =>
      lb ? { ...lb, images: lb.images.filter((img) => img.id !== imageId) } : null,
    );
  }

  return (
    <>
      <div className="space-y-3">
        {inspections.map((insp) => {
          const isOpen = open === insp.id;
          const issues = insp.items.filter((i) => i.status === "NEEDS_REPAIR").length;
          const fixed = insp.items.filter((i) => i.status === "REPAIR_COMPLETED").length;
          return (
            <div key={insp.id} className="card overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : insp.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-slate-900">
                    {insp.completedAt
                      ? new Date(insp.completedAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <User2 className="h-3.5 w-3.5" />
                    {insp.inspector}
                    {issues > 0 && (
                      <span className="ml-1 text-red-600">· {issues} to repair</span>
                    )}
                    {fixed > 0 && (
                      <span className="ml-1 text-blue-600">· {fixed} fixed</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <RoomStatusBadge status={insp.summary} />
                  <ChevronDown
                    className={clsx(
                      "h-4 w-4 text-slate-400 transition",
                      isOpen && "rotate-180",
                    )}
                  />
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 px-4 py-3">
                  {insp.notes && (
                    <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      {insp.notes}
                    </p>
                  )}
                  <ItemList
                    items={insp.items}
                    onOpenLightbox={(itemId, images, idx) =>
                      openLightbox(insp.id, itemId, images, idx)
                    }
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {lightbox && (
        <PhotoLightbox
          images={lightbox.images}
          startIndex={lightbox.startIndex}
          isAdmin={isAdmin}
          onClose={() => setLightbox(null)}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}

function ItemList({
  items,
  onOpenLightbox,
}: {
  items: Item[];
  onOpenLightbox: (itemId: string, images: Image[], idx: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const flagged = items.filter((i) => i.status !== "OK" && i.status !== "NA");
  const itemsWithPhotos = items.filter((i) => i.images.length > 0);
  const shown = showAll
    ? items
    : Array.from(new Set([...flagged, ...itemsWithPhotos]));

  return (
    <div className="space-y-3">
      {!showAll && shown.length > 0 && (
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Flagged items and items with photos
        </p>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-emerald-700">
          All items marked OK — nothing flagged.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 py-2">
              <div className="flex-1">
                <div className="text-sm text-slate-700">{item.questionText}</div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">
                  {item.sectionName}
                </div>
                {item.note && (
                  <div className="mt-0.5 text-xs italic text-slate-500">
                    “{item.note}”
                  </div>
                )}
                {item.images.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {item.images.map((img, idx) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => onOpenLightbox(item.id, item.images, idx)}
                        className="h-14 w-14 overflow-hidden rounded-md border border-slate-200 hover:opacity-80"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <ItemStatusBadge status={item.status} />
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => setShowAll((s) => !s)}
        className="text-xs font-medium text-brand-600 hover:underline"
      >
        {showAll ? "Show only flagged + photos" : `Show all ${items.length} items`}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles.**

```powershell
npx tsc --noEmit
```

Expected: errors *only* about `src/app/(app)/rooms/[id]/page.tsx` not passing `isAdmin` to `InspectionHistory` and not including `images`. Both are fixed in Task E1.

- [ ] **Step 3: Commit.**

```powershell
git add src/components/InspectionHistory.tsx
git commit -m "feat(history): render photo thumbnails and open PhotoLightbox"
```

---

## Phase E — Page integration

### Task E1: Update `rooms/[id]/page.tsx` for signed URLs and admin flag

**Files:** Modify `src/app/(app)/rooms/[id]/page.tsx`.

- [ ] **Step 1: Replace the file contents.**

Open `src/app/(app)/rooms/[id]/page.tsx` and replace its entire contents with:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardCheck, MapPin, Pencil } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getSignedUrl } from "@/lib/storage";
import { RoomStatusBadge } from "@/components/StatusBadge";
import { InspectionHistory } from "@/components/InspectionHistory";
import { roomStatusFromSummary, type RoomStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function RoomDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";

  const room = await prisma.room.findUnique({
    where: { id: params.id },
    include: {
      inspections: {
        orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
        include: {
          inspector: { select: { name: true } },
          items: {
            include: { images: true },
          },
        },
      },
    },
  });
  if (!room) notFound();

  const latest = room.inspections[0];
  const status = roomStatusFromSummary(latest?.summary) as RoomStatus;

  const history = await Promise.all(
    room.inspections.map(async (i) => ({
      id: i.id,
      summary: (i.summary === "NEEDS_REPAIR" ? "NEEDS_REPAIR" : "OK") as "OK" | "NEEDS_REPAIR",
      notes: i.notes,
      completedAt: i.completedAt ? i.completedAt.toISOString() : null,
      inspector: i.inspector.name,
      items: await Promise.all(
        i.items.map(async (it) => ({
          id: it.id,
          sectionName: it.sectionName,
          questionText: it.questionText,
          status: it.status as "OK" | "NEEDS_REPAIR" | "REPAIR_COMPLETED" | "NA",
          note: it.note,
          images: await Promise.all(
            it.images.map(async (img) => ({
              id: img.id,
              url: await getSignedUrl(img.storagePath, 3600),
              width: img.width,
              height: img.height,
            })),
          ),
        })),
      ),
    })),
  );

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">
                Room {room.number}
              </h1>
              <RoomStatusBadge status={status} />
            </div>
            {room.name && <p className="text-slate-600">{room.name}</p>}
            <div className="flex flex-wrap gap-4 text-sm text-slate-500">
              {room.floor && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> Floor {room.floor}
                </span>
              )}
              <span>
                {room.inspections.length} inspection
                {room.inspections.length === 1 ? "" : "s"} on record
              </span>
              {latest?.completedAt && (
                <span>
                  Last inspected {new Date(latest.completedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            {room.notes && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {room.notes}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Link href={`/inspect/${room.id}`} className="btn-primary">
              <ClipboardCheck className="h-4 w-4" />
              Start inspection
            </Link>
            {isAdmin && (
              <Link href={`/rooms?edit=${room.id}`} className="btn-secondary">
                <Pencil className="h-4 w-4" />
                Edit room
              </Link>
            )}
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold text-slate-900">
          Inspection history
        </h2>
        <InspectionHistory inspections={history} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the full project compiles.**

```powershell
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Run the dev server and confirm nothing crashes on load.**

```powershell
npm run dev
```

Open http://localhost:3000. Sign in. Open a room with existing inspections (no photos yet). Confirm the page renders without 500s.

Stop the dev server with Ctrl+C.

- [ ] **Step 4: Commit.**

```powershell
git add src/app/(app)/rooms/[id]/page.tsx
git commit -m "feat(rooms): include images with signed URLs and pass isAdmin"
```

---

## Phase F — Verification and ship

### Task F1: Local manual smoke test

**Files:** None.

Run through every item in §12 of the spec. Each item should pass before continuing.

- [ ] **Step 1: Start the dev server.**

```powershell
npm run dev
```

- [ ] **Step 2: Run the spec's test checklist.**

Walk through each numbered test:
1. Schema migrated cleanly (Task B1 already verified this — re-check Supabase Table Editor)
2. Storage upload happy path (inspect, attach 3 photos to one item, save; verify DB + Storage)
3. Storage upload rollback (temporarily break the DB write, confirm orphans get cleaned)
4. Display: thumbnails appear and load; lightbox opens
5. Bulk-select sanity: 25 photos in one tap succeeds; soft warning toast appears at 20+
6. Large file (11 MB) rejected
7. Wrong MIME (PDF) rejected
8. Mobile camera: tap camera button on phone → rear camera opens
9. URL expiry: leave page open >1 hr, reload, new URLs work
10. Existing inspections (no photos) still render
11. Delete photo as admin: lightbox trash → confirm → photo gone + audit row written
12. Delete photo as non-admin: trash icon absent

For #3 (rollback): inside `saveInspection`, temporarily throw an error inside the `$transaction` callback, save an inspection with photos, check Supabase Storage browser — the uploaded path(s) should be gone. Revert your test code change afterward.

- [ ] **Step 3: Fix anything that fails.**

Each failure is a small bug fix; iterate and re-run the affected step.

- [ ] **Step 4: Stop the dev server.**

Ctrl+C.

- [ ] **Step 5: Commit any fixes.**

```powershell
git add -A
git commit -m "fix: address issues found during local smoke test"
```

(Skip if no fixes were needed.)

---

### Task F2: Update DEPLOYMENT.md

**Files:** Modify `DEPLOYMENT.md`.

- [ ] **Step 1: Add Supabase steps to the deployment doc.**

Replace the contents of `DEPLOYMENT.md` with:

```markdown
# Deploying Divya Motel online

This app runs on Postgres and Supabase Storage. The recommended path is **Vercel** (hosting) + **Supabase** (Postgres + Storage). Total cost: $0 to start.

> You only have to do this once. After that, you push changes and it updates.

---

## 1. Create a Supabase project

1. Sign up at https://supabase.com (free tier).
2. Create a project. Pick a region close to where staff use the app.
3. From **Settings → Database → Connection string**, copy the **Transaction pooler** URL.
4. From **Settings → API**, copy the **Project URL** and the **service_role** secret.
5. Under **Storage → New bucket**, create a bucket named `inspection-photos`. Leave **Public bucket** OFF.

## 2. Push the code to GitHub

```bash
git init
git add .
git commit -m "Divya Motel room condition app"
# create a repo on github.com, then:
git remote add origin https://github.com/<you>/divya-motel.git
git push -u origin main
```

## 3. Deploy on Vercel

1. Sign up at https://vercel.com and **Import** the GitHub repo.
2. Add these **Environment Variables** in the Vercel project settings:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Supabase Transaction pooler URL |
   | `NEXTAUTH_SECRET` | a fresh secret — run `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
   | `NEXTAUTH_URL` | your live URL, e.g. `https://divya-motel.vercel.app` |
   | `SUPABASE_URL` | from step 1.4 |
   | `SUPABASE_SERVICE_ROLE_KEY` | from step 1.4 (**server-only**, never expose) |
   | `SEED_ADMIN_EMAIL` | admin login email |
   | `SEED_ADMIN_PASSWORD` | strong admin password |

3. Click **Deploy**.

## 4. Initialise the live database

After the first deploy, create the tables and seed the checklist/admin. Run locally with `DATABASE_URL` temporarily set to the Supabase string:

```bash
npx prisma db push       # create tables in Supabase Postgres
npm run db:seed          # admin + checklist + sample rooms
```

(or run these from the Supabase SQL console / a Vercel build step).

## 5. Done

Visit your Vercel URL on any phone, sign in as the admin, and start adding your real rooms and staff. Delete the sample rooms (101–203) from the Rooms page.

---

### Security checklist for production

- [ ] Set a **new** `NEXTAUTH_SECRET` (never reuse the dev one).
- [ ] Change the admin password from the seeded default.
- [ ] Use a strong `SEED_ADMIN_PASSWORD`.
- [ ] Confirm the `inspection-photos` bucket is **private** (no public read policy).
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is only referenced from server-side code (`src/lib/storage.ts`).
- [ ] Vercel serves over HTTPS automatically — keep it on.
- [ ] Give each staff member their own account (no shared logins) so the Activity log stays meaningful.
```

- [ ] **Step 2: Commit.**

```powershell
git add DEPLOYMENT.md
git commit -m "docs(deployment): update for Supabase Postgres + Storage"
```

---

### Task F3: Deploy and smoke-test production

**Files:** None.

- [ ] **Step 1: Push to main.**

```powershell
git push
```

Vercel auto-builds. Watch the deployment in the Vercel dashboard.

- [ ] **Step 2: Watch the build log for errors.**

If the build fails on a Prisma migration step, it likely means the production DB needs the migration applied. From local:
```powershell
$env:DATABASE_URL = "your-Supabase-pooler-URL"
npx prisma migrate deploy
Remove-Item Env:DATABASE_URL
```

Then trigger a redeploy in Vercel.

- [ ] **Step 3: Smoke test production.**

On a phone (or DevTools mobile emulation):
- Sign in as admin.
- Open a room, run an inspection, attach 2 photos to one item, save.
- Confirm the photos appear in history.
- Tap a thumbnail, confirm lightbox + admin trash icon.
- Delete one photo, confirm it disappears from history.
- Sign out, sign in as a non-admin (create one if needed via `/admin/users`), open the same room, open the lightbox, confirm trash icon is absent.

- [ ] **Step 4: Verify Supabase usage.**

In the Supabase dashboard:
- **Table Editor → InspectionItemImage** — rows should match the photos you uploaded.
- **Storage → inspection-photos** — objects should exist at the expected paths.
- **Logs** — no errors from the service-role key being used unexpectedly.

- [ ] **Step 5: Tell the user the feature is live.**

Done. The photos feature is shipped.

---

## What was deliberately not done

These were considered and explicitly deferred — see spec §14:

- **Per-room status timeline ("blockchain-like")** — separate brainstorming session next.
- **Downloadable report** — separate brainstorming session next.
- EXIF stripping, photo cropping, per-photo notes, photo download/export, dedup, bulk photo gallery, webhooks.

When you're ready, ask Claude to start brainstorming "the room status timeline" or "the report download". Each goes through its own spec → plan → implementation cycle.
