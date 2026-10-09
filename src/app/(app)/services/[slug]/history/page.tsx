import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireWorkflowAccess, can, isManager } from "@/lib/session";
import { WorkflowHistory, type HistoryDay, type HistorySubmission } from "@/components/WorkflowHistory";
import { getWorkflowPerformance, parseRange } from "@/lib/workflow-performance";
import { motelTodayUTC } from "@/lib/business-date";
import { addDays, dateKey } from "@/lib/workflow-lock";

export const dynamic = "force-dynamic";

export default async function WorkflowHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ view?: string; range?: string }>;
}) {
  const { user, workflow } = await requireWorkflowAccess((await params).slug);
  if (workflow.shape !== "MATRIX") notFound();
  const sp = await searchParams;
  const canPerformance = can(user, "workflows:performance:view");
  const view = sp.view === "performance" && canPerformance ? "performance" : "date";

  const submissions = await prisma.workflowSubmission.findMany({
    where: { workflowId: workflow.id },
    orderBy: { date: "desc" },
    include: {
      createdBy: { select: { name: true } },
      cells: { select: { roomId: true, status: true } },
    },
  });

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

  // Performance data is only computed when that tab is open.
  const performance =
    view === "performance" ? await getWorkflowPerformance(workflow.id, parseRange(sp.range), today) : null;

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
        workflowName={workflow.name}
        today={todayDay}
        pastDays={pastDays}
        view={view}
        canPerformance={canPerformance}
        performance={performance}
        canRoomHistory={isManager(user)}
      />
    </div>
  );
}
