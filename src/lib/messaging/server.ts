// Staff messaging — who can see a conversation, who its members are, titles,
// and the per-user conversation list with unread counts.
//
//   DIRECT        key "dm:<a>:<b>" (sorted ids) — only those two people.
//   GROUP         key "group:ALL" (everyone) or "group:<ROLE>" — membership is
//                 the role itself, so it follows role changes automatically.
//                 Super Admin can open every group but is only notified for
//                 groups whose role they hold.
//   ANNOUNCEMENT  no key; audienceRoles JSON (["ALL"] or role keys). Read-only.
//   THREAD        key "thread:HK_TASK:<id>" / "thread:ROOM:<id>" — comments on
//                 a housekeeping task (board viewers) or a room (managers).
//
// Every page, API route and action goes through canAccess() — never trust a
// conversation id from the browser on its own.

import type { Conversation } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, isManager, type AuthUser } from "@/lib/session";
import { ROLE_KEYS } from "@/lib/roles";
import { parseRoles } from "@/lib/notifications/catalog";

export const MAX_MESSAGE_LENGTH = 2000;
export const ALL = "ALL";

export const dmKey = (a: string, b: string) => `dm:${[a, b].sort().join(":")}`;
export const groupKey = (role: string) => `group:${role}`;
export const threadKey = (type: "HK_TASK" | "ROOM", id: string) => `thread:${type}:${id}`;

type Conv = Pick<Conversation, "id" | "kind" | "key" | "title" | "audienceRoles" | "contextType" | "contextId" | "createdById">;

export function dmMembers(c: Conv): string[] {
  return c.kind === "DIRECT" && c.key ? c.key.split(":").slice(1) : [];
}
export const groupRole = (c: Conv) => (c.kind === "GROUP" && c.key ? c.key.slice("group:".length) : null);

export function canAccess(user: AuthUser, c: Conv): boolean {
  switch (c.kind) {
    case "DIRECT":
      return dmMembers(c).includes(user.id);
    case "GROUP": {
      const role = groupRole(c);
      return role === ALL || user.isSuperAdmin || (!!role && user.roleKeys.includes(role));
    }
    case "ANNOUNCEMENT": {
      const audience = parseRoles(c.audienceRoles) ?? [];
      return (
        c.createdById === user.id ||
        user.isSuperAdmin ||
        audience.includes(ALL) ||
        audience.some((r) => user.roleKeys.includes(r))
      );
    }
    case "THREAD":
      return c.contextType === "HK_TASK"
        ? can(user, "housekeeping:board:view")
        : c.contextType === "ROOM"
          ? isManager(user)
          : false;
    default:
      return false;
  }
}

/** Users with any of these roles (or everyone for ALL), active only. */
async function usersInRoles(roles: string[]): Promise<string[]> {
  const where = roles.includes(ALL) ? {} : { roles: { some: { role: { key: { in: roles } } } } };
  const users = await prisma.user.findMany({ where: { active: true, ...where }, select: { id: true } });
  return users.map((u) => u.id);
}

/** Who a conversation belongs to — used for notifications and "seen by". */
export async function memberIds(c: Conv): Promise<string[]> {
  switch (c.kind) {
    case "DIRECT":
      return dmMembers(c);
    case "GROUP": {
      const role = groupRole(c);
      return role ? usersInRoles([role]) : [];
    }
    case "ANNOUNCEMENT":
      return usersInRoles(parseRoles(c.audienceRoles) ?? []);
    case "THREAD": {
      const senders = await prisma.message.findMany({
        where: { conversationId: c.id, deletedAt: null },
        distinct: ["senderId"],
        select: { senderId: true },
      });
      const ids = senders.map((s) => s.senderId);
      if (c.contextType === "HK_TASK" && c.contextId) {
        const task = await prisma.housekeepingTask.findUnique({
          where: { id: c.contextId },
          select: { assignedHousekeeperId: true, assignedById: true, createdById: true },
        });
        if (task) ids.push(...[task.assignedHousekeeperId, task.assignedById, task.createdById].filter((x): x is string => !!x));
      }
      return onlyThoseWhoCanSee(c, [...new Set(ids)]);
    }
    default:
      return [];
  }
}

// Thread members come from history (assignee, earlier commenters…), so re-check
// they can still open it — e.g. a role was removed since they commented.
async function onlyThoseWhoCanSee(c: Conv, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return ids;
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, active: true },
    select: { id: true, roles: { select: { role: { select: { key: true, permissions: { select: { permission: true } } } } } } },
  });
  return users
    .filter((u) => {
      const roleKeys = u.roles.map((r) => r.role.key);
      const permissions = new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission)));
      return canAccess({ id: u.id, roleKeys, permissions, isSuperAdmin: roleKeys.includes(ROLE_KEYS.SUPER_ADMIN) } as AuthUser, c);
    })
    .map((u) => u.id);
}

const ROLE_GROUP_TITLES: Record<string, string> = {
  [ALL]: "All staff",
  [ROLE_KEYS.ADMIN]: "Admins",
  [ROLE_KEYS.MANAGER]: "Managers",
  [ROLE_KEYS.INSPECTOR]: "Inspectors",
  [ROLE_KEYS.HOUSEKEEPER]: "Housekeepers",
};

export async function conversationTitle(c: Conv, me: { id: string }): Promise<string> {
  switch (c.kind) {
    case "DIRECT": {
      const otherId = dmMembers(c).find((id) => id !== me.id) ?? me.id;
      const other = await prisma.user.findUnique({ where: { id: otherId }, select: { name: true } });
      return other?.name ?? "Former staff member";
    }
    case "GROUP": {
      const role = groupRole(c) ?? "";
      if (ROLE_GROUP_TITLES[role]) return ROLE_GROUP_TITLES[role];
      const r = await prisma.role.findUnique({ where: { key: role }, select: { label: true } });
      return r?.label ?? role;
    }
    case "ANNOUNCEMENT":
      return c.title ?? "Announcement";
    case "THREAD":
      return threadTitle(c);
    default:
      return "Conversation";
  }
}

async function threadTitle(c: Conv): Promise<string> {
  if (c.contextType === "ROOM" && c.contextId) {
    const room = await prisma.room.findUnique({ where: { id: c.contextId }, select: { number: true } });
    return `Room ${room?.number ?? "?"} · comments`;
  }
  if (c.contextType === "HK_TASK" && c.contextId) {
    const t = await prisma.housekeepingTask.findUnique({
      where: { id: c.contextId },
      select: { kind: true, title: true, room: { select: { number: true } } },
    });
    if (t) return `${t.kind === "ROOM_CLEANING" ? `Room ${t.room?.number ?? "?"} cleaning` : t.title ?? "Task"} · comments`;
  }
  return "Comments";
}

/** Where a thread's comments live in the app. */
export function threadHref(c: Pick<Conv, "contextType" | "contextId">): string {
  if (c.contextType === "ROOM") return `/settings/rooms/${c.contextId}`;
  return `/services/housekeeping?task=${c.contextId}`;
}

/** Create the groups this user belongs to, so they appear before anyone has posted. */
export async function ensureGroups(user: AuthUser): Promise<void> {
  const roles = [ALL, ...user.roleKeys.filter((r) => r !== ROLE_KEYS.SUPER_ADMIN)];
  for (const role of roles) {
    await prisma.conversation.upsert({
      where: { key: groupKey(role) },
      create: { kind: "GROUP", key: groupKey(role), createdById: user.id },
      update: {},
    });
  }
}

export type ConversationSummary = {
  id: string;
  kind: string;
  title: string;
  preview: string | null;
  lastMessageAt: string | null;
  unread: number;
  muted: boolean;
};

/** Every conversation this user can see, with unread counts. Announcements first, then newest activity. */
export async function listConversations(user: AuthUser): Promise<ConversationSummary[]> {
  await ensureGroups(user);
  const groupKeys = [ALL, ...user.roleKeys].map(groupKey);

  const convs = await prisma.conversation.findMany({
    where: {
      OR: [
        { kind: "DIRECT", key: { contains: user.id } },
        user.isSuperAdmin ? { kind: "GROUP" } : { kind: "GROUP", key: { in: groupKeys } },
        { kind: "ANNOUNCEMENT" },
        { kind: "THREAD", OR: [{ reads: { some: { userId: user.id } } }, { messages: { some: { senderId: user.id } } }] },
      ],
    },
    orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
    take: 200,
    include: {
      reads: { where: { userId: user.id } },
      messages: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { body: true, senderId: true } },
    },
  });
  // Direct chats where only one side exists (never messaged) are hidden from the other person.
  const visible = convs.filter((c) => canAccess(user, c) && (c.kind !== "DIRECT" || c.lastMessageAt || c.createdById === user.id));

  const out = await Promise.all(
    visible.map(async (c) => {
      const read = c.reads[0];
      const unread = await prisma.message.count({
        where: {
          conversationId: c.id,
          deletedAt: null,
          senderId: { not: user.id },
          ...(read ? { createdAt: { gt: read.lastReadAt } } : {}),
        },
      });
      return {
        id: c.id,
        kind: c.kind,
        title: await conversationTitle(c, user),
        preview: c.messages[0]?.body.slice(0, 120) ?? null,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
        unread,
        muted: read?.muted ?? false,
      };
    }),
  );
  const rank = (k: string) => (k === "ANNOUNCEMENT" ? 0 : 1);
  return out.sort((a, b) => rank(a.kind) - rank(b.kind) || (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
}

/** Number of conversations with unread messages (header badge). Muted chats don't count. */
export async function unreadConversationCount(user: AuthUser): Promise<number> {
  const convs = await prisma.conversation.findMany({
    where: {
      lastMessageAt: { not: null },
      lastMessageSenderId: { not: user.id },
      OR: [
        { kind: "DIRECT", key: { contains: user.id } },
        { kind: "GROUP", key: { in: [ALL, ...user.roleKeys].map(groupKey) } },
        { kind: "ANNOUNCEMENT" },
        { kind: "THREAD", reads: { some: { userId: user.id } } },
      ],
    },
    select: {
      id: true, kind: true, key: true, title: true, audienceRoles: true, contextType: true, contextId: true,
      createdById: true, lastMessageAt: true,
      reads: { where: { userId: user.id }, select: { lastReadAt: true, muted: true } },
    },
  });
  return convs.filter((c) => {
    if (!canAccess(user, c)) return false;
    const read = c.reads[0];
    if (read?.muted) return false;
    return !read || (c.lastMessageAt && c.lastMessageAt > read.lastReadAt);
  }).length;
}
