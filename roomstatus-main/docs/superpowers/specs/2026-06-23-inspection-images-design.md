# Inspection Photo Evidence — Design Spec

**Date:** 2026-06-23
**Status:** Draft (awaiting user review)
**Scope:** Add the ability to attach photo evidence to per-item responses inside an inspection, and migrate the database from Neon to Supabase to host the photos in Supabase Storage.

## 1. Motivation

The current inspection flow records text status (`OK | NEEDS_REPAIR | REPAIR_COMPLETED | NA`) and an optional note per checklist item. For ambiguous items (a cracked tile, a stained carpet, a leaking faucet) text alone is weak evidence. Photo attachments give:

- A clearer record for repair vendors ("here's exactly what's broken")
- Stronger audit trail for repeat issues
- Visual confirmation when an item is marked `REPAIR_COMPLETED`

Photos are the trigger for switching from Neon to Supabase. Both run identical Postgres, but Supabase also offers Storage with signed URLs and a free-tier quota that fits this app.

## 2. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where photos attach | Per checklist item | Tied to the specific issue, not the whole inspection |
| Max photos per item | 25 | Generous cap, enforced client-side and server-side |
| Bucket visibility | Private | Photos may capture guest belongings |
| URL strategy | Signed URLs, 1 hour validity | Browser never sees the service-role key; URLs expire |
| Photo requirement | Always optional | Lowest friction; no enforcement on any status |
| Upload timing | Upload-then-save (single server action) | Avoids orphan files; saves are infrequent enough that the wait is acceptable |
| Image variants | None at upload; Supabase transforms for thumbnails on demand | Saves storage cost; offloads thumbnailing to Supabase |
| EXIF stripping | Out of scope (initial release) | Low risk for fixture photos; revisit if guest faces ever appear |

## 3. Scope

### In scope
- New `InspectionItemImage` model + relation
- Per-item camera/upload UI in `InspectForm`
- Thumbnail + lightbox rendering in `InspectionHistory`
- Server-side upload handler in the `saveInspection` server action
- New `deleteInspection` server action that cleans Storage before DB delete
- Storage layer wrapper (`src/lib/storage.ts`)
- Supabase migration: data move + env var changes + bucket creation
- New Vercel env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

### Out of scope
- In-browser rotate / crop / edit
- Server-side compression (Supabase transforms cover thumbnails)
- Backfilling photos to existing inspections
- A per-inspection bulk-photo zone
- Photo download / export endpoints
- EXIF metadata stripping
- Image deduplication
- Per-photo notes (notes remain per-item only)

## 4. Schema changes

### 4.1 New model

```prisma
model InspectionItemImage {
  id               String         @id @default(cuid())
  inspectionItemId String
  inspectionItem   InspectionItem @relation(fields: [inspectionItemId], references: [id], onDelete: Cascade)

  storagePath      String         // "inspections/<inspId>/<itemId>/<uuid>.<ext>"
  width            Int?
  height           Int?
  bytes            Int?
  createdAt        DateTime       @default(now())

  @@index([inspectionItemId])
}
```

### 4.2 Modified model

`InspectionItem` gets a back-relation:
```prisma
images InspectionItemImage[]
```

### 4.3 Migration command

```
npx prisma migrate dev --name add_inspection_item_images
```

(After Supabase swap; against the Supabase Postgres URL.)

## 5. Storage layout

- **Bucket name:** `inspection-photos`
- **Visibility:** Private (no public read policy)
- **Path convention:** `inspections/<inspectionId>/<itemId>/<uuid>.<ext>`
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`, `image/heic`
- **Max file size:** 10 MB (client + server validated)

The path embeds both the inspection ID and item ID. This means:
- One Storage prefix scan returns every photo for an inspection (used by `deleteInspection`)
- A targeted prefix scan returns every photo for a single item (useful for diagnostic admin tools)
- Orphan cleanup (if ever needed) can target a specific inspection or item

Per-item cap enforcement does **not** rely on Storage scans. The 25-photo cap is enforced (a) client-side at file-select time and (b) server-side by counting the in-memory FormData entries for that question key. Since inspections are created in a single atomic save, no concurrency case exists where two clients race to exceed the cap on the same item.

## 6. Upload flow

### 6.1 Client (in `InspectForm`)

Each checklist question row gains a photo affordance:

```
[ Question text ............ ] [ OK ] [ Repair ] [ Fixed ] [ N/A ]
                                                                [ 📷 (n) ]
                                       [thumbnail] [thumbnail] [thumbnail] [+]
```

- `<input type="file" accept="image/*" capture="environment" multiple hidden>` — opens phone rear camera on mobile, file picker on desktop.
- Selected files held in `Record<questionId, File[]>` state in the existing component.
- Inline thumbnails rendered from `URL.createObjectURL(file)`.
- `×` button on each thumbnail removes before save.
- Client-side validation per select:
  - Max 25 per item (block further selects)
  - Max 10 MB per file (reject with toast)
  - MIME starts with `image/` (reject with toast)

### 6.2 Save action (server)

The `saveInspection` server action signature changes from typed JSON to `FormData`:

```ts
export async function saveInspection(form: FormData) { ... }
```

FormData contents:
- `payload` (string) — JSON of the existing `SaveInspectionInput` (room, notes, responses)
- `image-<questionId>-<index>` (File) — repeated per file, indexed for ordering

Server algorithm — **uploads happen before the DB transaction**, never inside it. Holding a DB connection open during slow Storage I/O is an anti-pattern and Prisma's array-form `$transaction` doesn't support async work between statements anyway.

1. `requireUser()` — auth check (unchanged).
2. Parse `payload` JSON, re-validate with existing Zod schema.
3. Load referenced questions (existing snapshot logic).
4. Compute summary from item statuses (existing logic).
5. **Generate IDs up-front** — install `cuid` (or the maintained `@paralleldrive/cuid2`) and call it directly in the server action to mint the `Inspection.id` and each `InspectionItem.id` before any DB write. Pass those IDs into the Prisma `create` instead of relying on `@default(cuid())`. This lets us build deterministic storage paths from the start. Adds one ~4 KB dependency.
6. **Group FormData files by question ID.** Validate each:
   - MIME starts with `image/`
   - Size ≤ 10 MB
   - Per-item count ≤ 25
7. **Upload to Storage, sequentially within an inspection, parallel across items if simple:**
   - `storagePath` = `inspections/<inspId>/<itemId>/<crypto.randomUUID()>.<ext>`
   - Optionally read width/height (best-effort — skip if unavailable)
   - Call `storage.upload(path, file, { upsert: false })`
   - Track every uploaded path in an array for potential rollback
8. **If any upload fails:** best-effort `storage.remove(uploadedPaths)`, return `{ ok: false, error }`. No DB writes happened, so DB is clean.
9. **Run the Prisma transaction** (`$transaction([...])`):
   - `prisma.inspection.create` with the pre-generated `id`, plus nested `items.create` using the pre-generated item IDs, plus nested `items.images.create` for each item's uploaded paths.
   - This is one atomic write.
10. **If the transaction fails:** best-effort `storage.remove(uploadedPaths)`, return `{ ok: false, error }`.
11. `logAudit({ action: "CREATE", entity: "Inspection", ... })` (unchanged).
12. `revalidatePath` for dashboard/rooms (unchanged).
13. Return `{ ok: true, inspectionId }`.

The rollback model: **Storage uploads are reversible, DB writes either fully commit or don't happen.** A failure between steps 7 and 9 (upload succeeded, DB about to write) is the only window where rollback runs — and that window is small. A failure after step 9 leaves a successful inspection in the DB, which is fine.

### 6.3 Progress feedback

Save button text updates while pending:
- "Uploading 2 of 5…" (string built from server progress is hard; instead the client shows total file count and a spinner)
- For the initial implementation, a simple spinner with "Saving…" is acceptable. Per-photo progress is a future polish item.

## 7. Display flow (`InspectionHistory`)

### 7.1 Server-side signing

`src/app/(app)/rooms/[id]/page.tsx` already loads inspections with items. Extend the query to include `images`:

```ts
items: {
  include: { images: true },
}
```

Then, before passing to the client component, generate signed URLs for every image:

```ts
const signedItems = await Promise.all(items.map(async (it) => ({
  ...it,
  images: await Promise.all(it.images.map(async (img) => ({
    id: img.id,
    width: img.width,
    height: img.height,
    url: await getSignedUrl(img.storagePath, 3600),
  }))),
})));
```

URLs are good for 1 hour from page load. Stale URLs render as broken images — acceptable for a long-idle tab; user refreshes.

### 7.2 Thumbnail strip

In `InspectionHistory.tsx`, the `<ItemList>` component renders, below each item with images:

```
[Question text]  [status badge]
"optional note"
[thumb] [thumb] [thumb] [thumb] [thumb]
```

Thumbnails use Supabase's transform parameter for downscaling (e.g. `?width=120&quality=70`).

### 7.3 Lightbox

`src/components/PhotoLightbox.tsx` — minimal modal:
- Fullscreen dark backdrop
- Single image at natural size, fit-to-viewport
- Left/right arrows to navigate between images in the same inspection
- ESC + outer click to close
- No external library — ~50 lines of React + Tailwind

## 8. Deletion flow

A new server action handles inspection deletion explicitly:

```ts
export async function deleteInspection(inspectionId: string)
```

Algorithm:
1. `requireAdmin()` — only admins can delete inspections.
2. Load all `storagePath` values for the inspection (one query joining through items → images).
3. Call `supabase.storage.from('inspection-photos').remove(paths)`.
4. If Storage call errors, log and continue. Storage orphans are recoverable; broken UI from a failed DB delete is worse.
5. `prisma.inspection.delete({ where: { id: inspectionId } })` — DB cascade handles items + image rows.
6. `logAudit({ action: "DELETE", entity: "Inspection", ... })`.
7. `revalidatePath` for affected views.

**Note:** Current code has no inspection delete UI. This action is added but not exposed in this iteration. It exists so storage cleanup is correct *if and when* a delete UI is added.

## 9. Migration (Neon → Supabase)

Operational, not feature work. Sequence:

1. **Create Supabase project.** Free tier. Region close to staff.
2. **Capture connection string.** Settings → Database → "Transaction" pooler URL. (Direct URLs don't pool well in Vercel.)
3. **Locally dump Neon, restore to Supabase:**
   ```bash
   pg_dump "$NEON_URL" --no-owner --no-acl > backup.sql
   psql "$SUPABASE_URL" -f backup.sql
   ```
4. **Verify.** Compare row counts between Neon and Supabase for `User`, `Room`, `Section`, `Question`, `Inspection`, `InspectionItem`, `AuditLog`.
5. **Swap `DATABASE_URL` in Vercel.** Redeploy.
6. **Add new Vercel env vars:**
   - `SUPABASE_URL` (e.g. `https://xxxxx.supabase.co`)
   - `SUPABASE_SERVICE_ROLE_KEY` (Settings → API → service_role secret)
7. **Create the `inspection-photos` bucket** in Supabase dashboard. Set it private (no public read policy).
8. **Smoke test the migrated app.** Sign in, run an inspection (without photos yet), confirm dashboard and history all work.
9. **Pause Neon** (or delete after a 7-day safety window).

## 10. Environment configuration

| Var | Where set | Purpose |
|---|---|---|
| `DATABASE_URL` | Vercel + local | Postgres connection (now Supabase) |
| `NEXTAUTH_SECRET` | Vercel + local | Existing — unchanged |
| `NEXTAUTH_URL` | Vercel + local | Existing — unchanged |
| `SUPABASE_URL` | Vercel + local | Storage client base URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + local | Storage uploads (server-only — never exposed to browser) |

The service-role key is **server-only**. It must never be inlined into client bundles. Enforced by importing it only inside `src/lib/storage.ts` (server module) and never from a `"use client"` file.

## 11. Files affected

### New
- `src/lib/storage.ts` — Supabase Storage wrapper. Exports `uploadImage`, `getSignedUrl`, `deleteImages`.
- `src/components/PhotoPicker.tsx` — per-item client component (file input, thumbnails, remove, cap enforcement).
- `src/components/PhotoLightbox.tsx` — modal viewer.
- `src/lib/actions/deleteInspection.ts` — new server action (defined but not yet wired to UI).

### Modified
- `prisma/schema.prisma` — `InspectionItemImage` model + relation.
- `src/lib/actions/inspections.ts` — accept FormData, upload + transaction, rollback on failure.
- `src/components/InspectForm.tsx` — embed `<PhotoPicker>` per item.
- `src/components/InspectionHistory.tsx` — render thumb strip + lightbox.
- `src/app/(app)/rooms/[id]/page.tsx` — extend Prisma query with `images`, generate signed URLs server-side.
- `package.json` — add `@supabase/supabase-js`.
- `DEPLOYMENT.md` — document new env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) and the Supabase bucket setup step.

### Untouched
- `middleware.ts`
- `src/lib/auth.ts`, `session.ts`, `audit.ts`
- All admin pages (`/admin/users`, `/admin/questions`, `/admin/audit`)
- `RoomsManager`, `UsersManager`, `ChecklistManager`

## 12. Testing strategy

Manual end-to-end is sufficient for this scale; no automated test suite exists today and adding one is out of scope for this feature.

Test checklist:
1. **Schema:** `prisma migrate dev` runs cleanly against Supabase.
2. **Storage upload (happy):** Inspect a room, attach 3 photos to one item, save. Verify (a) inspection row created, (b) 3 image rows created, (c) 3 objects in Supabase Storage at the expected paths.
3. **Storage upload (rollback):** Force a DB error (e.g., temporarily set `roomId` to an invalid value). Confirm uploaded files are deleted from Storage on failure.
4. **Display:** Open the room detail page, expand the inspection, confirm thumbnails appear and load (signed URLs work). Tap a thumb, confirm lightbox.
5. **Cap enforcement:** Try to select a 26th photo — client should refuse with a clear message.
6. **Large file:** Try an 11 MB photo — client should refuse.
7. **Wrong MIME:** Try a PDF — client should refuse.
8. **Mobile camera:** On a phone, tap the camera button — should open the rear camera directly.
9. **URL expiry:** Leave a history page open for >1 hour. Reload. New URLs are signed; old in-memory URLs are dead. (Acceptable behavior; documenting it.)
10. **Existing inspections:** Old inspections (no photos) still render correctly.

## 13. Risks & open questions

| Risk | Mitigation |
|---|---|
| Save action times out on slow phone networks during a 5+ photo upload | Vercel function timeout is 10s on hobby; consider sequential vs. parallel upload, accept 10s ceiling for now |
| Supabase free-tier storage cap (1 GB) hit | Typical photo ~500 KB; cap = ~2000 photos. Monitor at Supabase dashboard. Pro tier ($25/mo) is 100 GB if needed |
| Service-role key leaked into client bundle | Code review checklist + tsconfig path mapping; key only imported in server files |
| Migration `pg_dump`/`psql` not available on user's machine | Provide a fallback using Supabase's UI import or `prisma db pull` |

## 14. Future work (explicitly deferred)

- Per-photo notes
- Bulk download of all photos for an inspection
- EXIF stripping before upload
- Image rotation/crop in-browser
- Streaming upload progress per photo
- Webhook to notify admin when `NEEDS_REPAIR` photos are added
- "Photo gallery for the whole room" view across inspections

---

**Reviewer:** Read this end-to-end. Flag any section that disagrees with what you want. Once approved, this spec drives the implementation plan generated by the `writing-plans` skill.
