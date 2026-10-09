// notify() — the one call every event site makes.
//
//   1. Is the event on? (admin rule, else catalog default)
//   2. Who receives it? direct = the userIds given; audience = admin-picked
//      roles, else holders of the event's default permission (+ Super Admin).
//   3. Drop the person who caused it, inactive users, and anyone who muted it.
//   4. Store one Notification per recipient, then push to their phones after
//      the response is sent (next/server `after`), so the action isn't slowed.
//
// Never throws: a notification problem must not break the action that caused it.

import { after } from "next/server";
import { prisma } from "@/lib/db";
import { ROLE_KEYS } from "@/lib/roles";
import { EVENT_BY_TYPE, parseRoles } from "./catalog";
import { sendPush } from "./push";

export type NotifyInput = {
  type: string;
  actorId?: string | null; // never notified about their own action
  userIds?: (string | null | undefined)[]; // direct events
  title: string;
  body?: string | null;
  href?: string | null;
  entityType?: string;
  entityId?: string;
};

async function audienceUserIds(permission: string | undefined, roles: string[] | null): Promise<string[]> {
  const where = roles
    ? { roles: { some: { role: { key: { in: roles } } } } }
    : permission
      ? {
          roles: {
            some: {
              role: { OR: [{ key: ROLE_KEYS.SUPER_ADMIN }, { permissions: { some: { permission } } }] },
            },
          },
        }
      : null;
  if (!where) return [];
  const users = await prisma.user.findMany({ where: { active: true, ...where }, select: { id: true } });
  return users.map((u) => u.id);
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    const def = EVENT_BY_TYPE.get(input.type);
    if (!def) {
      console.error(`[notify] unknown event type ${input.type}`);
      return;
    }
    const rule = await prisma.notificationRule.findUnique({ where: { type: def.type } });
    if (!(rule?.enabled ?? def.defaultEnabled)) return;

    let ids =
      def.recipients === "direct"
        ? input.userIds?.filter((id): id is string => !!id) ?? []
        : await audienceUserIds(def.defaultPermission, parseRoles(rule?.roles));
    ids = [...new Set(ids)].filter((id) => id !== input.actorId);
    if (ids.length === 0) return;

    // Direct recipients must still be active; audience lists already are.
    const [active, muted] = await Promise.all([
      def.recipients === "direct"
        ? prisma.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } })
        : Promise.resolve(ids.map((id) => ({ id }))),
      def.mutable
        ? prisma.notificationMute.findMany({ where: { type: def.type, userId: { in: ids } }, select: { userId: true } })
        : Promise.resolve([]),
    ]);
    const mutedSet = new Set(muted.map((m) => m.userId));
    const recipients = active.map((u) => u.id).filter((id) => !mutedSet.has(id));
    if (recipients.length === 0) return;

    await prisma.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        type: def.type,
        title: input.title.slice(0, 200),
        body: input.body?.slice(0, 500) ?? null,
        href: input.href ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      })),
    });

    const payload = { title: input.title, body: input.body, href: input.href, tag: `${def.type}:${input.entityId ?? ""}` };
    after(() => sendPush(recipients, payload).catch((e) => console.error("[notify] push failed:", e)));
  } catch (e) {
    console.error(`[notify] ${input.type} failed:`, e);
  }
}
