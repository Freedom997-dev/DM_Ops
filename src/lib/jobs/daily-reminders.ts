// Scheduled Daily Cleanliness notifications (Vercel Cron, see vercel.json).
//
//   remindNotStarted()   — late morning: today's inspection hasn't been started
//                          → roles allowed to run the service.
//   reportYesterday()    — early morning: yesterday missed → managers;
//                          yesterday's issue summary → managers (off by default).
//
// Safe to re-run: notifications collapse per workflow+day, so a retried cron
// replaces its own unread notice instead of duplicating it.

import { prisma } from "@/lib/db";
import { motelTodayUTC, formatBusinessDate } from "@/lib/business-date";
import { parseRolesAllowed } from "@/lib/permissions";
import { notify } from "@/lib/notifications/notify";

const DAY_MS = 24 * 60 * 60 * 1000;
const key = (d: Date) => d.toISOString().slice(0, 10);

async function matrixWorkflows() {
  return prisma.workflowDefinition.findMany({
    where: { archived: false, shape: "MATRIX" },
    select: { id: true, slug: true, name: true, rolesAllowed: true },
  });
}

export async function remindNotStarted(now = new Date()): Promise<{ reminded: number }> {
  const today = motelTodayUTC(now);
  let reminded = 0;
  for (const wf of await matrixWorkflows()) {
    const started = await prisma.workflowSubmission.findUnique({
      where: { workflowId_date: { workflowId: wf.id, date: today } },
      select: { id: true },
    });
    if (started) continue;
    const roles = parseRolesAllowed(wf.rolesAllowed);
    const users = await prisma.user.findMany({
      where: { active: true, roles: { some: { role: { key: { in: roles } } } } },
      select: { id: true },
    });
    await notify({
      type: "dc.not_started",
      userIds: users.map((u) => u.id),
      collapse: true,
      title: `${wf.name} not started yet`,
      body: `${formatBusinessDate(today, { weekday: "long", month: "short", day: "numeric" })} — nobody has started today's inspection.`,
      href: `/services/${wf.slug}`,
      entityType: "WorkflowDay",
      entityId: `${wf.id}:${key(today)}`,
    });
    reminded++;
  }
  return { reminded };
}

export async function reportYesterday(now = new Date()): Promise<{ missed: number; summaries: number }> {
  const yesterday = new Date(motelTodayUTC(now).getTime() - DAY_MS);
  const label = formatBusinessDate(yesterday, { weekday: "long", month: "short", day: "numeric" });
  let missed = 0;
  let summaries = 0;

  for (const wf of await matrixWorkflows()) {
    const sub = await prisma.workflowSubmission.findUnique({
      where: { workflowId_date: { workflowId: wf.id, date: yesterday } },
      select: { cells: { select: { status: true, roomId: true } } },
    });
    const entityId = `${wf.id}:${key(yesterday)}`;
    const href = `/services/${wf.slug}?date=${key(yesterday)}`;

    if (!sub || sub.cells.length === 0) {
      await notify({
        type: "dc.missed",
        collapse: true,
        title: `${wf.name} was missed yesterday`,
        body: `No inspection was recorded for ${label}.`,
        href,
        entityType: "WorkflowDay",
        entityId,
      });
      missed++;
      continue;
    }

    const issues = sub.cells.filter((c) => c.status === "ISSUE");
    const rooms = new Set(issues.map((c) => c.roomId)).size;
    await notify({
      type: "dc.issues_summary",
      collapse: true,
      title: issues.length
        ? `${wf.name}: ${issues.length} issue${issues.length === 1 ? "" : "s"} yesterday`
        : `${wf.name}: no issues yesterday`,
      body: issues.length
        ? `${label} — ${rooms} room${rooms === 1 ? "" : "s"} with issues.`
        : `${label} — every checked item was OK.`,
      href,
      entityType: "WorkflowDay",
      entityId,
    });
    summaries++;
  }
  return { missed, summaries };
}
