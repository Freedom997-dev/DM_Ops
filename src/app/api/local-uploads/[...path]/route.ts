import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { uploadImage, isLocalStorage } from "@/lib/storage";
import { verifyUploadTicket } from "@/lib/upload-ticket";

/**
 * Dev-only stand-in for a Supabase signed upload URL: accepts a multipart PUT
 * with one file and writes it to the local storage driver. Authorised by the
 * signed token issued alongside the URL (see createUploadUrl). In production
 * (Supabase configured) this route is inert and returns 404.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!isLocalStorage) return new Response("Not found", { status: 404 });

  const segments = (await params).path.map(decodeURIComponent);
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === ".." || seg.includes("/") || seg.includes("\\")) {
      return new Response("Not found", { status: 404 });
    }
  }
  const storagePath = segments.join("/");

  const token = req.nextUrl.searchParams.get("token") ?? "";
  const user = await getCurrentUser();
  if (!user || !verifyUploadTicket("local-upload", storagePath, token)) {
    return Response.json({ error: "Invalid or expired upload URL" }, { status: 403 });
  }

  const form = await req.formData();
  const file = [...form.values()].find((v): v is File => v instanceof File);
  if (!file) return Response.json({ error: "No file" }, { status: 400 });

  await uploadImage(storagePath, file, file.type);
  return Response.json({ Key: storagePath });
}
