// Client-side helpers that keep media uploads under Vercel's request cap.
//
// Photos are sent to Server Actions as FormData. Vercel rejects any serverless
// request body over ~4.5 MB *before* it reaches the app, which surfaces as a
// crashed page ("This page couldn't load") with nothing in the function logs.
// Phone-camera photos are 3-8 MB each, so we shrink them in the browser first.

/** Total FormData budget per request — a little under Vercel's 4.5 MB cap. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

// Per-file limits for media that goes straight from the browser to storage
// (housekeeping). Must not exceed the bucket's fileSizeLimit, which
// scripts/ensure-storage-bucket.ts keeps in sync. Supabase's Free plan caps any
// single object at 50 MB; raise MAX_VIDEO_BYTES only on a paid plan.
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB (photos are compressed first)
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_FILES_PER_SUBMIT = 30;

export function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

const MAX_EDGE_PX = 1920;
const JPEG_QUALITY = 0.8;

/**
 * Downscale a photo to at most 1920px on its long edge and re-encode as JPEG.
 * Returns the original file for non-images, GIFs, formats the browser can't
 * decode (e.g. HEIC on Chrome), or when re-encoding wouldn't make it smaller.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    // "from-image" applies the EXIF rotation so portrait photos stay upright.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export function totalBytes(files: File[]): number {
  return files.reduce((sum, f) => sum + f.size, 0);
}

/** Human-readable error when a batch of files won't fit in one request, else null. */
export function uploadTooLargeError(files: File[]): string | null {
  const total = totalBytes(files);
  if (total <= MAX_UPLOAD_BYTES) return null;
  const mb = (total / (1024 * 1024)).toFixed(1);
  const hasVideo = files.some((f) => f.type.startsWith("video/"));
  return hasVideo
    ? `These files add up to ${mb} MB — the limit is 4 MB per upload. Videos are usually too large; use a short clip or photos instead.`
    : `These photos add up to ${mb} MB — the limit is 4 MB per upload. Remove a few and try again.`;
}

/** Message shown when the upload request itself fails (network drop, size cap). */
export const UPLOAD_FAILED_MESSAGE =
  "Upload failed — the files may be too large or the connection dropped. Try fewer photos and submit again.";
