import { prisma } from "@/lib/db";
import { deleteImages } from "@/lib/storage";

// Plain module (no "use server") — Server Actions are auto-exposed as
// callable endpoints to any client, so this must not live in an actions
// file. Only src/app/api/cron/housekeeping-cleanup/route.ts (CRON_SECRET
// gated) may call this.
export async function sweepExpiredHousekeepingPhotos(): Promise<{ deleted: number }> {
  const setting = await prisma.housekeepingSetting.findUnique({ where: { id: "singleton" } });
  const retentionDays = setting?.retentionDays ?? 7;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const expired = await prisma.housekeepingPhoto.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, storagePath: true },
  });
  if (expired.length === 0) return { deleted: 0 };

  await deleteImages(expired.map((p) => p.storagePath));
  await prisma.housekeepingPhoto.deleteMany({ where: { id: { in: expired.map((p) => p.id) } } });
  return { deleted: expired.length };
}
