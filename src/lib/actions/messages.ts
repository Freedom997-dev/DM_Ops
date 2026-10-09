"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { can, isManager, requirePermission, requireUser, type AuthUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications/notify";
import {
  ALL,
  MAX_MESSAGE_LENGTH,
  canAccess,
  conversationTitle,
  dmKey,
  memberIds,
  threadHref,
  threadKey,
} from "@/lib/messaging/server";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const bodySchema = z.string().trim().min(1, "Write a message first.").max(MAX_MESSAGE_LENGTH, `Keep it under ${MAX_MESSAGE_LENGTH} characters.`);

async function markRead(conversationId: string, userId: string) {
  await prisma.conversationRead.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    create: { conversationId, userId, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });
  await prisma.notification.updateMany({
    where: { userId, entityType: "Conversation", entityId: conversationId, readAt: null },
    data: { readAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Start a direct chat
// ---------------------------------------------------------------------------

export async function startDirectChat(otherUserId: string): Promise<Result<{ conversationId: string }>> {
  const me = await requireUser();
  if (otherUserId === me.id) return { ok: false, error: "Pick someone else." };
  const other = await prisma.user.findFirst({ where: { id: otherUserId, active: true }, select: { id: true } });
  if (!other) return { ok: false, error: "That person isn't an active staff member." };
  const c = await prisma.conversation.upsert({
    where: { key: dmKey(me.id, other.id) },
    create: { kind: "DIRECT", key: dmKey(me.id, other.id), createdById: me.id },
    update: {},
  });
  return { ok: true, conversationId: c.id };
}

// ---------------------------------------------------------------------------
// Send a message (direct chats + groups). Announcements are read-only;
// comments go through postComment.
// ---------------------------------------------------------------------------

async function deliver(me: AuthUser, conversationId: string, body: string) {
  const now = new Date();
  const message = await prisma.message.create({ data: { conversationId, senderId: me.id, body, createdAt: now } });
  const c = await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: now, lastMessageSenderId: me.id },
  });
  await markRead(conversationId, me.id);

  // Recipients: members minus anyone who muted this chat.
  const members = (await memberIds(c)).filter((id) => id !== me.id);
  const muted = new Set(
    (
      await prisma.conversationRead.findMany({
        where: { conversationId, muted: true, userId: { in: members } },
        select: { userId: true },
      })
    ).map((r) => r.userId),
  );
  const recipients = members.filter((id) => !muted.has(id));
  const preview = body.length > 140 ? `${body.slice(0, 140)}…` : body;

  if (c.kind === "DIRECT") {
    await notify({
      type: "msg.direct", actorId: me.id, userIds: recipients, collapse: true,
      title: `Message from ${me.name}`, body: preview, href: `/messages/${c.id}`,
      entityType: "Conversation", entityId: c.id,
    });
  } else if (c.kind === "GROUP") {
    await notify({
      type: "msg.group", actorId: me.id, userIds: recipients, collapse: true,
      title: `${me.name} in ${await conversationTitle(c, me)}`, body: preview, href: `/messages/${c.id}`,
      entityType: "Conversation", entityId: c.id,
    });
  } else if (c.kind === "THREAD") {
    await notify({
      type: "msg.comment", actorId: me.id, userIds: recipients, collapse: true,
      title: `${me.name} commented · ${(await conversationTitle(c, me)).replace(/ · comments$/, "")}`,
      body: preview, href: threadHref(c),
      entityType: "Conversation", entityId: c.id,
    });
  }
  return message;
}

export async function sendMessage(conversationId: string, text: string): Promise<Result<{ messageId: string }>> {
  const me = await requireUser();
  const body = bodySchema.safeParse(text);
  if (!body.success) return { ok: false, error: body.error.issues[0].message };
  const c = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!c || !canAccess(me, c)) return { ok: false, error: "Conversation not found." };
  if (c.kind === "ANNOUNCEMENT") return { ok: false, error: "Announcements can't be replied to." };
  const m = await deliver(me, c.id, body.data);
  revalidatePath("/messages");
  return { ok: true, messageId: m.id };
}

// ---------------------------------------------------------------------------
// Comments on a housekeeping task or a room
// ---------------------------------------------------------------------------

export async function postComment(
  contextType: "HK_TASK" | "ROOM",
  contextId: string,
  text: string,
): Promise<Result<{ conversationId: string }>> {
  const me = await requireUser();
  const body = bodySchema.safeParse(text);
  if (!body.success) return { ok: false, error: body.error.issues[0].message };

  if (contextType === "HK_TASK") {
    if (!can(me, "housekeeping:board:view")) return { ok: false, error: "Not allowed." };
    const task = await prisma.housekeepingTask.findUnique({ where: { id: contextId }, select: { id: true } });
    if (!task) return { ok: false, error: "Task not found." };
  } else {
    if (!isManager(me)) return { ok: false, error: "Not allowed." };
    const room = await prisma.room.findUnique({ where: { id: contextId }, select: { id: true } });
    if (!room) return { ok: false, error: "Room not found." };
  }

  const c = await prisma.conversation.upsert({
    where: { key: threadKey(contextType, contextId) },
    create: { kind: "THREAD", key: threadKey(contextType, contextId), contextType, contextId, createdById: me.id },
    update: {},
  });
  await deliver(me, c.id, body.data);
  return { ok: true, conversationId: c.id };
}

// ---------------------------------------------------------------------------
// Read state, mute, delete
// ---------------------------------------------------------------------------

export async function markConversationRead(conversationId: string): Promise<Result> {
  const me = await requireUser();
  const c = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!c || !canAccess(me, c)) return { ok: false, error: "Conversation not found." };
  await markRead(c.id, me.id);
  return { ok: true };
}

export async function setConversationMuted(conversationId: string, muted: boolean): Promise<Result> {
  const me = await requireUser();
  const c = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!c || !canAccess(me, c)) return { ok: false, error: "Conversation not found." };
  if (c.kind === "ANNOUNCEMENT") return { ok: false, error: "Announcements can't be muted." };
  await prisma.conversationRead.upsert({
    where: { conversationId_userId: { conversationId, userId: me.id } },
    create: { conversationId, userId: me.id, muted },
    update: { muted },
  });
  revalidatePath("/messages");
  return { ok: true };
}

export async function deleteMessage(messageId: string): Promise<Result> {
  const me = await requireUser();
  const m = await prisma.message.findUnique({ where: { id: messageId }, include: { conversation: true } });
  if (!m || m.deletedAt || !canAccess(me, m.conversation)) return { ok: false, error: "Message not found." };
  const own = m.senderId === me.id;
  // Moderators may remove messages anywhere except private direct chats.
  const moderator = m.conversation.kind !== "DIRECT" && can(me, "comms:messages:moderate");
  if (!own && !moderator) return { ok: false, error: "You can only delete your own messages." };

  await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date(), deletedById: me.id } });
  if (!own) {
    await logAudit({
      userId: me.id, action: "DELETE", entity: "Message", entityId: messageId,
      details: { conversationId: m.conversationId, kind: m.conversation.kind, senderId: m.senderId },
    });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Announcements (managers)
// ---------------------------------------------------------------------------

const announcementSchema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(120),
  body: bodySchema,
  roles: z.array(z.string()).min(1, "Pick who it's for."),
});

export async function postAnnouncement(input: unknown): Promise<Result<{ conversationId: string }>> {
  const me = await requirePermission("comms:announcements:send");
  const p = announcementSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };

  let roles = p.data.roles;
  if (!roles.includes(ALL)) {
    roles = (await prisma.role.findMany({ where: { key: { in: roles } }, select: { key: true } })).map((r) => r.key);
    if (roles.length === 0) return { ok: false, error: "Pick who it's for." };
  } else roles = [ALL];

  const now = new Date();
  const c = await prisma.conversation.create({
    data: {
      kind: "ANNOUNCEMENT",
      title: p.data.title,
      audienceRoles: JSON.stringify(roles),
      createdById: me.id,
      lastMessageAt: now,
      lastMessageSenderId: me.id,
      messages: { create: { senderId: me.id, body: p.data.body, createdAt: now } },
    },
  });
  await markRead(c.id, me.id);
  await logAudit({
    userId: me.id, action: "CREATE", entity: "Conversation", entityId: c.id,
    details: { kind: "ANNOUNCEMENT", title: p.data.title, audience: roles },
  });
  await notify({
    type: "msg.announcement",
    actorId: me.id,
    userIds: await memberIds(c),
    title: `Announcement: ${p.data.title}`,
    body: p.data.body.length > 160 ? `${p.data.body.slice(0, 160)}…` : p.data.body,
    href: `/messages/${c.id}`,
    entityType: "Conversation",
    entityId: c.id,
  });
  revalidatePath("/messages");
  return { ok: true, conversationId: c.id };
}
