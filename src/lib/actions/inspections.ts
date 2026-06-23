"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { summaryFromItems } from "@/lib/status";

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

export type SaveInspectionInput = z.infer<typeof inspectionSchema>;

export async function saveInspection(input: SaveInspectionInput) {
  const user = await requireUser();
  const parsed = inspectionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid inspection data." };
  }
  const { roomId, notes, responses } = parsed.data;

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return { ok: false, error: "Room not found." };

  // Snapshot each question's text/section so this record stays accurate even
  // if the checklist is edited later.
  const questions = await prisma.question.findMany({
    where: { id: { in: responses.map((r) => r.questionId) } },
    include: { section: true },
  });
  const qmap = new Map(questions.map((q) => [q.id, q]));

  const summary = summaryFromItems(responses.map((r) => r.status));

  const inspection = await prisma.inspection.create({
    data: {
      roomId,
      inspectorId: user.id,
      status: "COMPLETED",
      summary,
      notes: notes || null,
      completedAt: new Date(),
      items: {
        create: responses.map((r) => {
          const q = qmap.get(r.questionId);
          return {
            questionId: r.questionId,
            questionText: q?.text ?? "(deleted question)",
            sectionName: q?.section.name ?? "—",
            status: r.status,
            note: r.note || null,
          };
        }),
      },
    },
  });

  await logAudit({
    userId: user.id,
    action: "CREATE",
    entity: "Inspection",
    entityId: inspection.id,
    details: { roomNumber: room.number, summary },
  });

  revalidatePath("/dashboard");
  revalidatePath("/rooms");
  revalidatePath(`/rooms/${roomId}`);
  return { ok: true, inspectionId: inspection.id };
}
