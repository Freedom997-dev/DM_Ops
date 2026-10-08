import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireWorkflowAccess } from "@/lib/session";
import { WorkflowHistory, type HistoryDay, type HistorySubmission, type RoomHistoryEntry } from "@/components/WorkflowHistory";
import { motelTodayUTC } from "@/lib/business-date";
import { addDays, dateKey } from "@/lib/workflow-lock";

export const dynamic = "force-dynamic";

export default async function WorkflowHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { workflow } = await requireWorkflowAccess((await params).slug);
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

  const summarize = (s: (typeof submissions)[number]): HistorySubmission => ({
    id: s.id,
    date: s.date.toISOString(),
    status: s.status as "IN_PROGRESS" | "COMPLETED",
    createdBy: s.createdBy.name,
    roomsTouched: new Set(s.cells.map((c) => c.roomId)).size,
    issueCount: s.cells.filter((c) => c.status === "ISSUE").length,
    unlocked: !!s.unlockedAt,
  });

  // Every day from the first inspection up to yesterday, newest first — days
  // with no inspection are listed as missed (submission: null).
  const today = motelTodayUTC();
  const byKey = new Map(submissions.map((s) => [dateKey(s.date), s]));
  const earliest = submissions.length ? submissions[submissions.length - 1].date : today;
  const pastDays: HistoryDay[] = [];
  for (let d = addDays(today, -1); d >= earliest; d = addDays(d, -1)) {
    const s = byKey.get(dateKey(d));
    pastDays.push({ dateKey: dateKey(d), date: d.toISOString(), submission: s ? summarize(s) : null });
  }
  const todaySubmission = byKey.get(dateKey(today));
  const todayDay: HistoryDay = {
    dateKey: dateKey(today),
    date: today.toISOString(),
    submission: todaySubmission ? summarize(todaySubmission) : null,
  };

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
        href="/services"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to services
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{workflow.name}</h1>
        <p className="text-sm text-slate-500">
          Pick a day. Each day has its own sheet; past days are locked unless a manager unlocks them.
        </p>
      </div>
      <WorkflowHistory
        workflowSlug={workflow.slug}
        today={todayDay}
        pastDays={pastDays}
        rooms={rooms}
        byRoom={byRoom}
      />
    </div>
  );
}
