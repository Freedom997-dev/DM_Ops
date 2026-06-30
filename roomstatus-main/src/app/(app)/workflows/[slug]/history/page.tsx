import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireWorkflowAccess } from "@/lib/session";
import { WorkflowHistory, type HistorySubmission, type RoomHistoryEntry } from "@/components/WorkflowHistory";

export const dynamic = "force-dynamic";

export default async function WorkflowHistoryPage({ params }: { params: { slug: string } }) {
  const { workflow } = await requireWorkflowAccess(params.slug);
  if (workflow.shape !== "MATRIX") notFound();

  const [submissions, rooms] = await Promise.all([
    prisma.workflowSubmission.findMany({
      where: { workflowId: workflow.id },
      orderBy: { date: "desc" },
      include: {
        createdBy: { select: { name: true } },
        cells: { select: { roomId: true, status: true } },
        _count: { select: { rows: true } },
      },
    }),
    prisma.room.findMany({
      where: { archived: false },
      orderBy: { number: "asc" },
      select: { id: true, number: true, name: true },
    }),
  ]);

  const historyByDate: HistorySubmission[] = submissions.map((s) => {
    const roomsTouched = new Set(s.cells.map((c) => c.roomId)).size;
    const issueCount = s.cells.filter((c) => c.status === "ISSUE").length;
    return {
      id: s.id,
      date: s.date.toISOString(),
      status: s.status as "IN_PROGRESS" | "COMPLETED",
      createdBy: s.createdBy.name,
      roomsTouched,
      issueCount,
    };
  });

  // Per-room aggregates
  const byRoom: Record<string, RoomHistoryEntry[]> = {};
  for (const room of rooms) byRoom[room.id] = [];
  for (const s of submissions) {
    const cellsByRoom = new Map<string, { touched: number; issues: number }>();
    for (const c of s.cells) {
      const cur = cellsByRoom.get(c.roomId) ?? { touched: 0, issues: 0 };
      cur.touched++;
      if (c.status === "ISSUE") cur.issues++;
      cellsByRoom.set(c.roomId, cur);
    }
    for (const [roomId, agg] of cellsByRoom.entries()) {
      const list = byRoom[roomId];
      if (!list) continue;
      list.push({
        submissionId: s.id,
        date: s.date.toISOString(),
        createdBy: s.createdBy.name,
        cellsTouched: agg.touched,
        issueCount: agg.issues,
      });
    }
  }

  return (
    <div className="space-y-5">
      <Link
        href={`/workflows/${workflow.slug}`}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {workflow.name}
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{workflow.name} — History</h1>
        <p className="text-sm text-slate-500">
          Browse by date or by room. Each submission represents one day&rsquo;s inspection.
        </p>
      </div>
      <WorkflowHistory
        workflowSlug={workflow.slug}
        submissions={historyByDate}
        rooms={rooms}
        byRoom={byRoom}
      />
    </div>
  );
}
