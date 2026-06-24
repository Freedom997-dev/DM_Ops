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
