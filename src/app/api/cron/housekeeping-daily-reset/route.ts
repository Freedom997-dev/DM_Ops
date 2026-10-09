import { NextResponse } from "next/server";
import { resetRecurringDailyTasks } from "@/lib/jobs/housekeeping-recurrence";
import { prisma } from "@/lib/db";
import { reportYesterday } from "@/lib/jobs/daily-reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Nightly reset — recurring daily tasks (e.g. "Clean lobby") go back to
 * TODO + unassigned so they reappear fresh each day. Guarded by CRON_SECRET
 * (Vercel Cron sends it as a Bearer token automatically when the env var is set).
 * Also: Daily Cleanliness "missed yesterday" / issue-summary notifications,
 * and deletes notifications older than 90 days.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { reset } = await resetRecurringDailyTasks();
  const { count: purgedNotifications } = await prisma.notification.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
  });
  const yesterday = await reportYesterday();
  return NextResponse.json({ ok: true, reset, purgedNotifications, yesterday });
}
