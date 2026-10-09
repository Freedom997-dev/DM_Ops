import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { unreadConversationCount } from "@/lib/messaging/server";

export const dynamic = "force-dynamic";

// Polled by the header bell: GET → { unread, messagesUnread }; GET ?list=1 → also the latest 20.
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = new URL(req.url).searchParams.get("list") === "1";
  const [unread, messagesUnread, items] = await Promise.all([
    prisma.notification.count({ where: { userId: me.id, readAt: null } }),
    unreadConversationCount(me),
    list
      ? prisma.notification.findMany({
          where: { userId: me.id },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, title: true, body: true, href: true, readAt: true, createdAt: true },
        })
      : Promise.resolve(null),
  ]);
  return NextResponse.json({ unread, messagesUnread, items }, { headers: { "Cache-Control": "no-store" } });
}
