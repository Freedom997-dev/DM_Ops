/**
 * Creates the private `inspection-photos` bucket if it does not already exist.
 *
 * src/lib/storage.ts assumes the bucket is present — it uploads and signs URLs
 * but never provisions. On a fresh Supabase project that means every photo
 * upload fails at runtime, so this runs as part of the deploy build.
 *
 * Idempotent: a no-op once the bucket exists. Skipped entirely when the
 * Supabase env vars are absent or point at the local-dev placeholder, which is
 * the same condition storage.ts uses to fall back to its filesystem driver.
 */
import { createClient } from "@supabase/supabase-js";

const BUCKET = "inspection-photos";

// Mirrors the per-upload limits enforced in src/lib/actions/*.ts.
// 50 MB is the video ceiling; images are additionally capped at 10 MB there.
const FILE_SIZE_LIMIT = 50 * 1024 * 1024;
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key || !url.startsWith("https://") || url.includes("localhost-not-used")) {
    console.log(`[storage] Supabase not configured — skipping ${BUCKET} provisioning.`);
    return;
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw new Error(`Could not list buckets: ${listError.message}`);

  if (buckets?.some((b) => b.name === BUCKET)) {
    console.log(`[storage] Bucket "${BUCKET}" already exists.`);
    return;
  }

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: FILE_SIZE_LIMIT,
    allowedMimeTypes: ALLOWED_MIME,
  });

  // Tolerate a concurrent deploy having just created it.
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Could not create bucket "${BUCKET}": ${error.message}`);
  }

  console.log(`[storage] Created private bucket "${BUCKET}".`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
