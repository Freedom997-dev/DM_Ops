"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "./rooms";

export type { ActionState };

// ---- Sections -------------------------------------------------------------
const sectionSchema = z.object({
  name: z.string().trim().min(1, "Section name is required").max(80),
});

export async function createSection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requirePermission("pm:checklist:add");
  const parsed = sectionSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const max = await prisma.section.aggregate({ _max: { order: true } });
  const section = await prisma.section.create({
    data: { name: parsed.data.name, order: (max._max.order ?? 0) + 1 },
  });
  await logAudit({
    userId: admin.id,
    action: "CREATE",
    entity: "Section",
    entityId: section.id,
    details: { name: section.name },
  });
  revalidatePath("/services/pm/settings/checklist");
  return { ok: true, message: `Section "${section.name}" added.` };
}

export async function renameSection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requirePermission("pm:checklist:update");
  const id = String(formData.get("id") || "");
  const parsed = sectionSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const section = await prisma.section.update({
    where: { id },
    data: { name: parsed.data.name },
  });
  await logAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "Section",
    entityId: section.id,
    details: { name: section.name },
  });
  revalidatePath("/services/pm/settings/checklist");
  return { ok: true, message: "Section renamed." };
}

export async function setSectionArchived(id: string, archived: boolean) {
  const admin = await requirePermission("pm:checklist:delete");
  const section = await prisma.section.update({
    where: { id },
    data: { archived },
  });
  // Archiving a section archives its questions too.
  await prisma.question.updateMany({
    where: { sectionId: id },
    data: { archived },
  });
  await logAudit({
    userId: admin.id,
    action: archived ? "ARCHIVE" : "RESTORE",
    entity: "Section",
    entityId: section.id,
    details: { name: section.name },
  });
  revalidatePath("/services/pm/settings/checklist");
}

// ---- Questions ------------------------------------------------------------
const questionSchema = z.object({
  sectionId: z.string().min(1, "Choose a section"),
  text: z.string().trim().min(1, "Question text is required").max(300),
});

export async function createQuestion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requirePermission("pm:checklist:add");
  const parsed = questionSchema.safeParse({
    sectionId: formData.get("sectionId"),
    text: formData.get("text"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const max = await prisma.question.aggregate({
    where: { sectionId: parsed.data.sectionId },
    _max: { order: true },
  });
  const question = await prisma.question.create({
    data: {
      sectionId: parsed.data.sectionId,
      text: parsed.data.text,
      order: (max._max.order ?? 0) + 1,
    },
  });
  await logAudit({
    userId: admin.id,
    action: "CREATE",
    entity: "Question",
    entityId: question.id,
    details: { text: question.text },
  });
  revalidatePath("/services/pm/settings/checklist");
  return { ok: true, message: "Question added." };
}

export async function updateQuestion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requirePermission("pm:checklist:update");
  const id = String(formData.get("id") || "");
  const text = String(formData.get("text") || "").trim();
  if (!text) return { ok: false, error: "Question text is required" };

  const before = await prisma.question.findUnique({ where: { id } });
  const question = await prisma.question.update({
    where: { id },
    data: { text },
  });
  await logAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "Question",
    entityId: question.id,
    details: { before: before?.text, after: text },
  });
  revalidatePath("/services/pm/settings/checklist");
  return { ok: true, message: "Question updated." };
}

export async function setQuestionArchived(id: string, archived: boolean) {
  const admin = await requirePermission("pm:checklist:delete");
  const question = await prisma.question.update({
    where: { id },
    data: { archived },
  });
  await logAudit({
    userId: admin.id,
    action: archived ? "ARCHIVE" : "RESTORE",
    entity: "Question",
    entityId: question.id,
    details: { text: question.text },
  });
  revalidatePath("/services/pm/settings/checklist");
}
