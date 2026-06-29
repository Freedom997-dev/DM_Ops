# Inspection Photo Evidence

Inspectors can attach photos to any checklist item during an inspection. Photos display as thumbnails in history; clicking opens a fullscreen lightbox. Admins can delete individual photos after save via the lightbox.

## Status

| | |
|---|---|
| **Shipped on** | 2026-06-24 |
| **Design spec** | [`docs/superpowers/specs/2026-06-23-inspection-images-design.md`](../superpowers/specs/2026-06-23-inspection-images-design.md) |
| **Implementation plan** | [`docs/superpowers/plans/2026-06-23-inspection-images.md`](../superpowers/plans/2026-06-23-inspection-images.md) |
| **Live URL path(s)** | `/inspect/[roomId]` (upload), `/rooms/[id]` (view + admin delete) |

## Roles

| Role | What they can do |
|---|---|
| ADMIN | Upload during inspection. Delete photos after save via the lightbox. |
| INSPECTOR | Upload during inspection. Remove photos before save (× button on the thumbnail strip). Cannot delete after save. |

## Routes

Photos extend existing routes; no new pages.

| URL | Where photos appear | Purpose |
|---|---|---|
| `/inspect/[roomId]` | Per-question 📷 button + thumbnail strip in `<PhotoPicker>` | Inspector attaches photos before saving |
| `/rooms/[id]` | Thumbnail strip under each `InspectionItem` with photos | Read-only display; tap to open lightbox |

## Data model touchpoints

- **Reads from:** InspectionItemImage (new), InspectionItem, Inspection
- **Writes to:** InspectionItemImage (create on save, delete via admin)

See [`docs/data-model.md → InspectionItemImage`](../data-model.md).

## Key files

### New
- `src/lib/storage.ts` — Supabase Storage wrapper. Exports `uploadImage`, `getSignedUrl`, `deleteImages`. Server-only.
- `src/lib/actions/photos.ts` — `deletePhoto(imageId)` and `deleteInspection(inspectionId)` server actions. Both admin-only.
- `src/components/PhotoPicker.tsx` — per-item file input + thumbnail strip (client). Used inside `InspectForm`.
- `src/components/PhotoLightbox.tsx` — fullscreen modal viewer with prev/next nav and admin-only trash icon.

### Modified
- `src/lib/actions/inspections.ts` — `saveInspection` now takes `FormData`, uploads photos to Storage before the DB transaction, rolls back on failure.
- `src/lib/audit.ts` — typed unions extended with `DELETE` action and `InspectionItemImage` entity.
- `src/components/InspectForm.tsx` — embeds `<PhotoPicker>` per item; submits as `FormData`.
- `src/components/InspectionHistory.tsx` — renders thumbnail strips; opens `<PhotoLightbox>` on click.
- `src/app/(app)/rooms/[id]/page.tsx` — query extended with `images: true`; generates signed URLs server-side; passes `isAdmin` to history component.
- `src/lib/db.ts` — appends `?pgbouncer=true&connection_limit=1` to `DATABASE_URL` (required for Prisma + Supabase pooler).

## Behavior notes

- **Per-item attachment.** Each checklist question has its own 📷 button. Photos are not "for the inspection" — they're tied to specific items.
- **No per-item count cap, but soft warning at 20+.** Inspectors can attach as many photos as they want per item. A non-blocking toast appears at 20+ to nudge against accidental bulk uploads.
- **10 MB per file ceiling.** Enforced client-side at file-select AND server-side in `saveInspection`.
- **MIME validation.** Anything not starting with `image/` is rejected.
- **Upload-then-transact rollback.** See [architecture.md → upload-then-transact](../architecture.md). If the Prisma transaction fails after uploads succeed, the action best-effort deletes the uploaded paths.
- **IDs minted up-front.** `cuid()` is called for the Inspection and each InspectionItem before any DB write, so storage paths can embed them deterministically.
- **Signed URLs for display, generated server-side.** `src/app/(app)/rooms/[id]/page.tsx` calls `getSignedUrl(path, 3600)` for every image before passing to the client. URLs are good for 1 hour; pages reload after expiry.
- **Lightbox trash icon visible only to admins.** `isAdmin` prop drives conditional rendering. Server-side `requireAdmin()` enforces this for the action too — defense in depth.
- **DB cascade does NOT delete Storage objects.** `deletePhoto` and `deleteInspection` explicitly call `deleteImages(paths)` before the DB delete.

## Auth gates

- Upload during inspection: requires being signed in (`requireUser()` in saveInspection).
- Delete photo after save: requires admin (`requireAdmin()` in `deletePhoto`).
- Delete inspection (defined but not yet UI-exposed): requires admin (`requireAdmin()` in `deleteInspection`).

## Storage / external services

- **Supabase Storage bucket:** `inspection-photos`, private (no public read policy)
- **Path convention:** `inspections/<inspectionId>/<itemId>/<uuid>.<ext>`
- **Allowed MIME:** `image/jpeg`, `image/png`, `image/webp`, `image/heic`
- **Max file size:** 10 MB
- **Signed URL TTL:** 3600 seconds (1 hour)
- **Quota:** Supabase free tier = 1 GB total. At ~500 KB/photo that's ~2000 photos. Monitor at Supabase dashboard.

## Out of scope (deferred)

- Per-photo notes
- Bulk download / export of photos
- EXIF stripping before upload
- In-browser rotate / crop
- Streaming upload progress (currently shows a spinner with "Saving…")
- Inspection delete UI (the server action exists but isn't wired to a button anywhere)

## Change log

- 2026-06-24 · Initial ship · `971f341` (merge of `feat/inspection-photos`)
- 2026-06-24 · Added pgbouncer-safe URL handling in `src/lib/db.ts` to fix Prisma + Supabase pooler interaction · `8fb63bf`
