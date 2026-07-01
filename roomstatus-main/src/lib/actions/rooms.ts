"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export type ActionState = { ok: boolean; error?: string; message?: string };

const roomSchema = z.object({
  number: z.string().trim().min(1, "Room number is required").max(20),
  name: z.string().trim().max(80).optional(),
  floor: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function createRoom(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = roomSchema.safeParse({
    number: formData.get("number"),
    name: formData.get("name") || undefined,
    floor: formData.get("floor") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const existing = await prisma.room.findUnique({
    where: { number: parsed.data.number },
  });
  if (existing) {
    return { ok: false, error: `Room ${parsed.data.number} already exists.` };
  }

  const room = await prisma.room.create({ data: parsed.data });
  await logAudit({
    userId: admin.id,
    action: "CREATE",
    entity: "Room",
    entityId: room.id,
    details: { number: room.number, name: room.name },
  });

  revalidatePath("/services/pm");
  revalidatePath("/services/pm/rooms");
  return { ok: true, message: `Room ${room.number} added.` };
}

export async function updateRoom(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const parsed = roomSchema.safeParse({
    number: formData.get("number"),
    name: formData.get("name") || undefined,
    floor: formData.get("floor") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const clash = await prisma.room.findFirst({
    where: { number: parsed.data.number, NOT: { id } },
  });
  if (clash) {
    return { ok: false, error: `Room ${parsed.data.number} already exists.` };
  }

  const before = await prisma.room.findUnique({ where: { id } });
  const room = await prisma.room.update({ where: { id }, data: parsed.data });
  await logAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "Room",
    entityId: room.id,
    details: { before, after: parsed.data },
  });

  revalidatePath("/services/pm");
  revalidatePath("/services/pm/rooms");
  revalidatePath(`/services/pm/rooms/${id}`);
  return { ok: true, message: "Room updated." };
}

export async function setRoomArchived(id: string, archived: boolean) {
  const admin = await requireAdmin();
  const room = await prisma.room.update({ where: { id }, data: { archived } });
  await logAudit({
    userId: admin.id,
    action: archived ? "ARCHIVE" : "RESTORE",
    entity: "Room",
    entityId: room.id,
    details: { number: room.number },
  });
  revalidatePath("/services/pm");
  revalidatePath("/services/pm/rooms");
}
