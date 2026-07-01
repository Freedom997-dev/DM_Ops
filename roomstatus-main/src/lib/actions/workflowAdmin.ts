"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { ROLES } from "@/lib/permissions";

type OkOnly = { ok: true };
type Failure = { ok: false; error: string };
type Result = OkOnly | Failure;
type ResultWith<T> = ({ ok: true } & T) | Failure;

// ---------------------------------------------------------------------------
// Workflow Items (admin)
// ---------------------------------------------------------------------------

const itemCreateSchema = z.object({
  workflowId: z.string().min(1),
  text: z.string().trim().min(1).max(200),
});

export async function createWorkflowItem(input: z.infer<typeof itemCreateSchema>): Promise<ResultWith<{ itemId: string }>> {
  const admin = await requireAdmin();
  const parsed = itemCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const workflow = await prisma.workflowDefinition.findUnique({ where: { id: parsed.data.workflowId } });
  if (!workflow) return { ok: false, error: "Workflow not found." };

  // Append to end: pick order = (max order) + 1
  const last = await prisma.workflowItem.findFirst({
    where: { workflowId: parsed.data.workflowId },
    orderBy: { order: "desc" },
  });
  const order = (last?.order ?? -1) + 1;

  const item = await prisma.workflowItem.create({
    data: { workflowId: parsed.data.workflowId, text: parsed.data.text, order },
  });

  await logAudit({
    userId: admin.id,
    action: "CREATE",
    entity: "WorkflowItem",
    entityId: item.id,
    details: { workflowId: workflow.id, text: parsed.data.text },
  });

  revalidatePath(`/services/${workflow.slug}/settings`);
  return { ok: true, itemId: item.id };
}

const itemUpdateSchema = z.object({
  itemId: z.string().min(1),
  text: z.string().trim().min(1).max(200).optional(),
  order: z.number().int().optional(),
});

export async function updateWorkflowItem(input: z.infer<typeof itemUpdateSchema>): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = itemUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const item = await prisma.workflowItem.findUnique({
    where: { id: parsed.data.itemId },
    include: { workflow: true },
  });
  if (!item) return { ok: false, error: "Item not found." };

  const data: { text?: string; order?: number } = {};
  if (parsed.data.text !== undefined) data.text = parsed.data.text;
  if (parsed.data.order !== undefined) data.order = parsed.data.order;

  await prisma.workflowItem.update({ where: { id: parsed.data.itemId }, data });

  await logAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "WorkflowItem",
    entityId: item.id,
    details: { changes: data },
  });

  revalidatePath(`/services/${item.workflow.slug}/settings`);
  return { ok: true };
}

export async function archiveWorkflowItem(itemId: string, archived: boolean): Promise<Result> {
  const admin = await requireAdmin();

  const item = await prisma.workflowItem.findUnique({
    where: { id: itemId },
    include: { workflow: true },
  });
  if (!item) return { ok: false, error: "Item not found." };

  await prisma.workflowItem.update({ where: { id: itemId }, data: { archived } });

  await logAudit({
    userId: admin.id,
    action: archived ? "ARCHIVE" : "RESTORE",
    entity: "WorkflowItem",
    entityId: itemId,
    details: { archived },
  });

  revalidatePath(`/services/${item.workflow.slug}/settings`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Workflow Definitions (admin)
// ---------------------------------------------------------------------------

const definitionUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  rolesAllowed: z.array(z.enum(ROLES)).min(1).optional(),
});

export async function updateWorkflowDefinition(input: z.infer<typeof definitionUpdateSchema>): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = definitionUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const definition = await prisma.workflowDefinition.findUnique({ where: { id: parsed.data.id } });
  if (!definition) return { ok: false, error: "Workflow not found." };

  const data: { name?: string; description?: string | null; rolesAllowed?: string } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.description !== undefined) data.description = parsed.data.description || null;
  if (parsed.data.rolesAllowed !== undefined) data.rolesAllowed = JSON.stringify(parsed.data.rolesAllowed);

  await prisma.workflowDefinition.update({ where: { id: parsed.data.id }, data });

  await logAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "WorkflowDefinition",
    entityId: definition.id,
    details: { changes: data },
  });

  revalidatePath("/settings/services");
  revalidatePath(`/services/${definition.slug}/settings`);
  return { ok: true };
}

export async function archiveWorkflowDefinition(id: string, archived: boolean): Promise<Result> {
  const admin = await requireAdmin();

  const definition = await prisma.workflowDefinition.findUnique({ where: { id } });
  if (!definition) return { ok: false, error: "Workflow not found." };

  await prisma.workflowDefinition.update({ where: { id }, data: { archived } });

  await logAudit({
    userId: admin.id,
    action: archived ? "ARCHIVE" : "RESTORE",
    entity: "WorkflowDefinition",
    entityId: id,
    details: { archived },
  });

  revalidatePath("/settings/services");
  return { ok: true };
}
