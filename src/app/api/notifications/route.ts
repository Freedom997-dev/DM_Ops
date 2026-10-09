import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Polled by the header bell: GET → { unread }; GET ?list=1 → also the latest 20.
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = new URL(req.url).searchParams.get("list") === "1";
  const [unread, items] = await Promise.all([
    prisma.notification.count({ where: { userId: me.id, readAt: null } }),
    list
      ? prisma.notification.findMany({
          where: { userId: me.id },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, title: true, body: true, href: true, readAt: true, createdAt: true },
        })
      : Promise.resolve(null),
  ]);
  return NextResponse.json({ unread, items }, { headers: { "Cache-Control": "no-store" } });
}
