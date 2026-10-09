"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { EVENT_BY_TYPE } from "@/lib/notifications/catalog";

type Result = { ok: true } | { ok: false; error: string };

// --- Inbox -------------------------------------------------------------------

export async function markNotificationRead(id: string): Promise<Result> {
  const me = await requireUser();
  await prisma.notification.updateMany({ where: { id, userId: me.id, readAt: null }, data: { readAt: new Date() } });
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<Result> {
  const me = await requireUser();
  await prisma.notification.updateMany({ where: { userId: me.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
  return { ok: true };
}

// --- Phone push on this device -----------------------------------------------

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function savePushSubscription(sub: unknown, userAgent: string): Promise<Result> {
  const me = await requireUser();
  const parsed = subscriptionSchema.safeParse(sub);
  if (!parsed.success) return { ok: false, error: "This browser sent an invalid subscription." };
  const { endpoint, keys } = parsed.data;
  // A device belongs to whoever enabled it last (shared phone, new login).
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: me.id, userAgent: userAgent.slice(0, 200) },
    update: { p256dh: keys.p256dh, auth: keys.auth, userId: me.id, userAgent: userAgent.slice(0, 200), lastUsedAt: new Date() },
  });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<Result> {
  const me = await requireUser();
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: me.id } });
  return { ok: true };
}

// --- My preferences ----------------------------------------------------------

export async function setNotificationMuted(type: string, muted: boolean): Promise<Result> {
  const me = await requireUser();
  const def = EVENT_BY_TYPE.get(type);
  if (!def) return { ok: false, error: "Unknown notification type." };
  if (!def.mutable) return { ok: false, error: "This notice can't be turned off." };
  if (muted) {
    await prisma.notificationMute.upsert({
      where: { userId_type: { userId: me.id, type } },
      create: { userId: me.id, type },
      update: {},
    });
  } else {
    await prisma.notificationMute.deleteMany({ where: { userId: me.id, type } });
  }
  revalidatePath("/notifications");
  return { ok: true };
}

// --- Admin rules (Settings → Notifications) ----------------------------------

export async function setNotificationRule(
  type: string,
  enabled: boolean,
  roles: string[] | null, // audience events only; null = default recipients
): Promise<Result> {
  const admin = await requirePermission("admin:notifications:manage");
  const def = EVENT_BY_TYPE.get(type);
  if (!def) return { ok: false, error: "Unknown notification type." };

  let rolesJson: string | null = null;
  if (def.recipients === "audience" && roles) {
    const valid = await prisma.role.findMany({ where: { key: { in: roles } }, select: { key: true } });
    if (valid.length === 0) return { ok: false, error: "Pick at least one role, or reset to default." };
    rolesJson = JSON.stringify(valid.map((r) => r.key));
  }

  await prisma.notificationRule.upsert({
    where: { type },
    create: { type, enabled, roles: rolesJson },
    update: { enabled, roles: rolesJson },
  });
  await logAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "NotificationRule",
    entityId: type,
    details: { enabled, roles: rolesJson ? JSON.parse(rolesJson) : "default" },
  });
  revalidatePath("/settings/notifications");
  return { ok: true };
}

export async function resetNotificationRule(type: string): Promise<Result> {
  const admin = await requirePermission("admin:notifications:manage");
  await prisma.notificationRule.deleteMany({ where: { type } });
  await logAudit({ userId: admin.id, action: "UPDATE", entity: "NotificationRule", entityId: type, details: "reset to default" });
  revalidatePath("/settings/notifications");
  return { ok: true };
}
