import { prisma } from "@/lib/db";

export type MessageDTO = {
  id: string;
  body: string | null; // null when deleted
  senderId: string;
  senderName: string;
  createdAt: string;
};

/** Messages of a conversation, oldest first: the latest `limit`, or everything after `after`. */
export async function loadMessages(conversationId: string, opts: { after?: Date; limit?: number } = {}): Promise<MessageDTO[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId, ...(opts.after ? { createdAt: { gt: opts.after } } : {}) },
    orderBy: { createdAt: opts.after ? "asc" : "desc" },
    take: opts.after ? 200 : (opts.limit ?? 100),
    include: { sender: { select: { name: true } } },
  });
  const list = opts.after ? rows : rows.reverse();
  return list.map((m) => ({
    id: m.id,
    body: m.deletedAt ? null : m.body,
    senderId: m.senderId,
    senderName: m.sender.name,
    createdAt: m.createdAt.toISOString(),
  }));
}
