"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { deleteImages } from "@/lib/storage";

type Result = { ok: true } | { ok: false; error: string };

export async function deletePhoto(imageId: string): Promise<Result> {
  const admin = await requireAdmin();

  const image = await prisma.inspectionItemImage.findUnique({
    where: { id: imageId },
    include: {
      inspectionItem: {
        include: { inspection: { select: { roomId: true } } },
      },
    },
  });
  if (!image) return { ok: false, error: "Photo not found." };

  await deleteImages([image.storagePath]);

  try {
    await prisma.inspectionItemImage.delete({ where: { id: imageId } });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not delete photo row.",
    };
  }

  await logAudit({
    userId: admin.id,
    action: "DELETE",
    entity: "InspectionItemImage",
    entityId: imageId,
    details: {
      storagePath: image.storagePath,
      inspectionItemId: image.inspectionItemId,
    },
  });

  revalidatePath(`/rooms/${image.inspectionItem.inspection.roomId}`);
  return { ok: true };
}

export async function deleteInspection(inspectionId: string): Promise<Result> {
  const admin = await requireAdmin();

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: {
      room: { select: { number: true } },
      items: { include: { images: { select: { storagePath: true } } } },
    },
  });
  if (!inspection) return { ok: false, error: "Inspection not found." };

  const paths = inspection.items.flatMap((it) => it.images.map((img) => img.storagePath));
  await deleteImages(paths);

  try {
    await prisma.inspection.delete({ where: { id: inspectionId } });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not delete inspection.",
    };
  }

  await logAudit({
    userId: admin.id,
    action: "DELETE",
    entity: "Inspection",
    entityId: inspectionId,
    details: { roomNumber: inspection.room.number, photosDeleted: paths.length },
  });

  revalidatePath("/dashboard");
  revalidatePath("/rooms");
  revalidatePath(`/rooms/${inspection.roomId}`);
  return { ok: true };
}
