"use server";

import cuid from "cuid";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
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
  const user = await requirePermission("pm:inspections:add");

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

  revalidatePath("/services/pm");
  revalidatePath("/services/pm/rooms");
  revalidatePath(`/services/pm/rooms/${roomId}`);
  return { ok: true, inspectionId };
}
