import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/session";

export const dynamic = "force-dynamic";

export type TakeoverRequestView = {
  id: string;
  taskId: string;
  taskLabel: string;
  status: string;
  requestedBy: string;
  assignedTo: string | null;
  note: string | null;
  createdAt: string;
};

// Polled by the managers' takeover popup: open requests on tasks that are still open.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(me, "housekeeping:tasks:manage")) return NextResponse.json({ requests: [] });

  const rows = await prisma.housekeepingTakeoverRequest.findMany({
    where: { status: "PENDING", task: { status: { in: ["READY_TO_CLEAN", "IN_PROGRESS", "TODO"] } } },
    orderBy: { createdAt: "asc" },
    take: 20,
    include: {
      requestedBy: { select: { name: true } },
      task: {
        select: {
          kind: true, title: true, status: true,
          room: { select: { number: true } },
          assignedHousekeeper: { select: { name: true } },
        },
      },
    },
  });

  const requests: TakeoverRequestView[] = rows.map((r) => ({
    id: r.id,
    taskId: r.taskId,
    taskLabel: r.task.kind === "ROOM_CLEANING" ? `Room ${r.task.room?.number ?? "?"}` : r.task.title ?? "Task",
    status: r.task.status,
    requestedBy: r.requestedBy.name,
    assignedTo: r.task.assignedHousekeeper?.name ?? null,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  }));
  return NextResponse.json({ requests }, { headers: { "Cache-Control": "no-store" } });
}
