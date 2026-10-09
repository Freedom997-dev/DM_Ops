import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canAccess, threadKey } from "@/lib/messaging/server";
import { loadMessages } from "@/lib/messaging/dto";

export const dynamic = "force-dynamic";

// Comments on a task or room: GET ?type=HK_TASK|ROOM&id=<id>[&after=<ISO>]
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type");
  const id = sp.get("id");
  if ((type !== "HK_TASK" && type !== "ROOM") || !id) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // Access is checked on a stand-in when the thread doesn't exist yet.
  const c = await prisma.conversation.findUnique({ where: { key: threadKey(type, id) } });
  const probe = c ?? { id: "", kind: "THREAD", key: null, title: null, audienceRoles: null, contextType: type, contextId: id, createdById: "" };
  if (!canAccess(me, probe)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!c) return NextResponse.json({ conversationId: null, messages: [] }, { headers: { "Cache-Control": "no-store" } });

  const afterParam = sp.get("after");
  const after = afterParam ? new Date(afterParam) : undefined;
  const messages = await loadMessages(c.id, after && !isNaN(after.getTime()) ? { after } : {});
  return NextResponse.json({ conversationId: c.id, messages }, { headers: { "Cache-Control": "no-store" } });
}
