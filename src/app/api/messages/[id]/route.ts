import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canAccess } from "@/lib/messaging/server";
import { loadMessages } from "@/lib/messaging/dto";

export const dynamic = "force-dynamic";

// Polled by an open conversation: GET ?after=<ISO> → new messages since then.
// Without `after`, the latest 100 (used to refresh after a delete).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await prisma.conversation.findUnique({ where: { id: (await params).id } });
  if (!c || !canAccess(me, c)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const afterParam = new URL(req.url).searchParams.get("after");
  const after = afterParam ? new Date(afterParam) : undefined;
  const messages = await loadMessages(c.id, after && !isNaN(after.getTime()) ? { after } : {});
  return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}
