import { NextRequest } from "next/server";
import { requireUser } from "@/lib/session";
import { readLocalImage, isLocalStorage } from "@/lib/storage";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

/**
 * Dev-only: serves images from the local filesystem storage driver.
 * Auth-guarded to mirror the private Supabase bucket. In production
 * (Supabase configured) this route is inert and returns 404.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  if (!isLocalStorage) {
    return new Response("Not found", { status: 404 });
  }

  // Require a signed-in user (matches the private-bucket access model).
  await requireUser();

  const storagePath = params.path.map(decodeURIComponent).join("/");
  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  try {
    const buf = await readLocalImage(storagePath);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
