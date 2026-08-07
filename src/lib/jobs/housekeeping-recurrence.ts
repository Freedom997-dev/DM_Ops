import { prisma } from "@/lib/db";

// Plain module (no "use server") — see housekeeping-sweep.ts for why.
// Only src/app/api/cron/housekeeping-daily-reset/route.ts (CRON_SECRET
// gated) may call this.
//
// Nightly: recurring GENERAL tasks (e.g. "Clean lobby") go back to TODO,
// unassigned, with their checklist reset — so they reappear fresh every day
// instead of staying Done forever or needing manual recreation. One-time
// tasks (recurring: false) are untouched and stay Done.
export async function resetRecurringDailyTasks(): Promise<{ reset: number }> {
  const due = await prisma.housekeepingTask.findMany({
    where: { kind: "GENERAL", recurring: true, status: { not: "TODO" } },
    select: { id: true },
  });
  if (due.length === 0) return { reset: 0 };

  const ids = due.map((t) => t.id);
  await prisma.$transaction([
    prisma.housekeepingTask.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "TODO",
        assignedHousekeeperId: null,
        assignedById: null,
        assignedAt: null,
        startedAt: null,
        submittedById: null,
        submittedAt: null,
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
        closedAt: null,
      },
    }),
    prisma.housekeepingTaskItem.updateMany({
      where: { taskId: { in: ids } },
      data: { status: "PENDING", note: null },
    }),
  ]);

  return { reset: ids.length };
}
