import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "fs";
import path from "path";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BUCKET = "inspection-photos";

// Choose the storage backend. Production sets SUPABASE_URL to a real
// `https://…supabase.co` URL + a service-role key → Supabase Storage.
// Local dev leaves those as placeholders → a filesystem driver so photo
// upload/preview work without any external service. See LOCAL_STORAGE_DIR.
const useSupabase =
  !!supabaseUrl &&
  !!serviceRoleKey &&
  supabaseUrl.startsWith("https://") &&
  !supabaseUrl.includes("localhost-not-used");

// ---------------------------------------------------------------------------
// Local filesystem driver (dev only)
// ---------------------------------------------------------------------------
const LOCAL_DIR =
  process.env.LOCAL_STORAGE_DIR || path.join(process.cwd(), ".local-storage", BUCKET);

function resolveLocal(storagePath: string) {
  // Guard against path traversal: the resolved file must stay under LOCAL_DIR.
  const full = path.resolve(LOCAL_DIR, storagePath);
  const base = path.resolve(LOCAL_DIR);
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error(`Illegal storage path: ${storagePath}`);
  }
  return full;
}

// ---------------------------------------------------------------------------
// Supabase driver (production)
// ---------------------------------------------------------------------------
// Lazily created so the app can boot locally without Supabase credentials.
const supabase =
  useSupabase && supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export async function uploadImage(
  storagePath: string,
  file: File | Buffer,
  contentType: string,
) {
  if (supabase) {
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      contentType,
      upsert: false,
    });
    if (error) throw new Error(`Upload failed for ${storagePath}: ${error.message}`);
    return;
  }

  // Local filesystem
  const full = resolveLocal(storagePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const data = file instanceof Buffer ? file : Buffer.from(await file.arrayBuffer());
  await fs.writeFile(full, data);
}

export async function getSignedUrl(storagePath: string, expiresInSeconds = 3600) {
  if (supabase) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error || !data?.signedUrl) {
      throw new Error(`Could not sign ${storagePath}: ${error?.message ?? "no URL"}`);
    }
    return data.signedUrl;
  }

  // Local: served by the auth-guarded API route below.
  const encoded = storagePath.split("/").map(encodeURIComponent).join("/");
  return `/api/local-images/${encoded}`;
}

export async function deleteImages(paths: string[]) {
  if (paths.length === 0) return;

  if (supabase) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) {
      // Best-effort. Log but do not throw — storage orphans are recoverable;
      // a thrown error here would block the DB cleanup the caller needs.
      console.error("Storage delete failed:", error.message, paths);
    }
    return;
  }

  // Local: unlink each file, ignore missing.
  await Promise.all(
    paths.map(async (p) => {
      try {
        await fs.unlink(resolveLocal(p));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error("Local storage delete failed:", (e as Error).message, p);
        }
      }
    }),
  );
}

/** Reads a locally-stored image. Used by the dev-only image API route. */
export async function readLocalImage(storagePath: string): Promise<Buffer> {
  return fs.readFile(resolveLocal(storagePath));
}

/** True when running against the local filesystem driver (no Supabase). */
export const isLocalStorage = !supabase;
